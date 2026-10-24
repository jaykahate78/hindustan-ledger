'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createAuth,hashPassword}=require('../auth');
const salt='b'.repeat(64);
const profiles=[
 {id:1,username:'demo.admin',password:'testadmin123',is_owner:false,role:'ADMIN',destination:'/bbq-admin.html'},
 {id:2,username:'demo.cashier',password:'testcashier123',is_owner:false,role:'OPERATOR',destination:'/bbq.html'},
 {id:3,username:'demo.kitchen',password:'testkitchen123',is_owner:false,role:'KITCHEN',destination:'/bbq-kitchen.html'},
 {id:4,username:'demo.groupowner',password:'testowner123',is_owner:true,role:null,destination:'/'},
 {id:5,username:'demo.pipes',password:'testpipes123',is_owner:false,role:'PIPES',destination:'/'}
].map(u=>({...u,password_hash:hashPassword(u.password,salt),password_salt:salt,is_active:true}));
function fixture(){
 const session=new Map();
 const pool={async query(sql,args=[]){
  if(sql.includes('FROM app_users WHERE username=')){
   const u=profiles.find(x=>x.username===args[0]);return {rowCount:u?1:0,rows:u?[u]:[]};
  }
  if(sql.startsWith('INSERT INTO app_sessions')){session.set(args[1],args[0]);return {rowCount:1,rows:[]}}
  if(sql.includes('FROM app_sessions s JOIN app_users u')){
   const id=session.get(args[0]);const u=profiles.find(x=>x.id===id);
   return {rowCount:u?1:0,rows:u?[{id:u.id,username:u.username,is_owner:u.is_owner}]:[]};
  }
  if(sql.startsWith('SELECT o.name,r.role FROM app_user_roles')){
   const u=profiles.find(x=>x.id===args[0]);return {rowCount:u?1:0,rows:u?[{name:u.role==='PIPES'?'Hindustan Pipes':'BBQ Pav Bhaji Chain',role:u.role}]:[]}
  }
  if(sql.startsWith('DELETE FROM app_sessions')){session.delete(args[0]);return {rowCount:1,rows:[]}}
  throw Error('Unexpected test query: '+sql);
 }};
 const app=express();app.use(express.json());app.use('/api/auth',createAuth(pool).router);
 app.use((err,_req,res,_next)=>res.status(500).json({error:err.message}));
 return app;
}
test('one login authenticates distinct BBQ roles and redirects by server-assigned role',async()=>{
 const server=fixture().listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/api/auth/landing')).status,401);
  for(const u of profiles){
   const bad=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u.username,password:'invalid'})});
   assert.equal(bad.status,401);
   const signin=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u.username,password:u.password})});
   assert.equal(signin.status,200,u.username);
   const cookie=(signin.headers.get('set-cookie')||'').split(';')[0];
   assert.match(cookie,/^hl_session=[a-f0-9]{64}$/);
   const route=await fetch(base+'/api/auth/landing',{headers:{Cookie:cookie}});
   assert.equal(route.status,200,u.username);
   const data=await route.json();
   assert.equal(data.destination,u.destination,u.username);
   if(u.role==='ADMIN')assert.equal(data.workspace,'bbq');
   if(u.role==='OPERATOR'||u.role==='KITCHEN')assert.notEqual(data.destination,'/bbq-admin.html');
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
test('login pages have one entry point and old staff cards no longer collect credentials',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const read=f=>fs.readFileSync(path.join(__dirname,'..','public',f),'utf8');
 const main=read('login.html'),client=read('login.js');
 assert.match(main,/One secure login/);
 assert.match(client,/\/api\/auth\/landing/);
 assert.doesNotMatch(main,/Choose your staff login|Choose your business/);
 for(const f of ['bbq-access.html','bbq-admin-login.html','bbq-billing-login.html','bbq-kitchen-login.html']){
  const text=read(f);assert.match(text,/url=\/login.html/);
  assert.doesNotMatch(text,/id="login"|type="password"/);
 }
 assert.doesNotThrow(()=>new vm.Script(client));
});
test('server enforces URL-level dashboard permissions irrespective of user selected link',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(server,/q\.rows\[0\]\.role!==required/);
 assert.match(server,/\['\/bbq-admin\.html','ADMIN'/);
 assert.match(server,/\['\/bbq\.html','OPERATOR'/);
 assert.match(server,/\['\/bbq-kitchen\.html','KITCHEN'/);
 assert.match(server,/res\.redirect\(302,'\/login\.html'\)/);
});
