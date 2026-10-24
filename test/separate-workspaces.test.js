'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('Hindustan Pipes and BBQ software remain separate',()=>{
 assert.ok(read('pipes.html').includes('js/pipes-ui.js'));
 assert.ok(read('bbq.html').includes('js/bbq-cashier.js'));
 assert.ok(!read('bbq.html').includes('Raw Material Stock'));
 assert.ok(read('index.html').includes('href="/bbq-admin.html"'));
 assert.ok(read('index.html').includes('href="/pipes.html"'));
});
test('one login routes BBQ staff automatically and preserves separated dashboards',()=>{
 const portal=read('bbq-access.html');
 assert.ok(portal.includes('url=/login.html'));
 for(const role of ['admin','billing','kitchen'])assert.ok(read('bbq-'+role+'-login.html').includes('url=/login.html'));
 for(const page of ['bbq-admin.html','bbq.html','bbq-kitchen.html'])assert.ok(read(page).includes('<html'));
 const login=read('login.js');assert.ok(login.includes('/api/auth/landing'));
 for(const f of ['js/pipes-ui.js','js/bbq-cashier.js','js/bbq-admin.js','js/bbq-kitchen.js','login.js'])assert.doesNotThrow(()=>new vm.Script(read(f)));
});
test('separate company accounting remains locked',()=>{
 const js=read('js/company-accounting.js');
 assert.ok(js.includes('orgSelector.disabled=true'));
 assert.doesNotThrow(()=>new vm.Script(js));
});

test('BBQ Admin can return to authorized Main Page without disabling direct role-based login',async()=>{
 const html=read('index.html'),dashboard=read('bbq-admin.html');
 assert.match(dashboard,/href="\/\?view=home"/);
 assert.match(dashboard,/← Main Page/);
 const script=/<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
 assert.ok(script,'main workspace page has client role-routing logic');
 async function view(session,search=''){
  const main={hidden:false},pipes={hidden:false},pipesActions={hidden:false},pipesRestricted={hidden:true},description={textContent:''};
  let redirected='';
  const elements={pipesWorkspace:pipes,pipesActions,pipesRestricted,workspaceDescription:description};
  const document={querySelector:()=>main,getElementById:id=>elements[id]};
  const window={location:{search,replace(url){redirected=url}}};
  const fetch=async()=>({ok:true,json:async()=>session});
  await vm.runInNewContext(script,{window,document,fetch,URLSearchParams,console});
  return {redirected,main,pipes,pipesActions,pipesRestricted,description};
 }
 const admin={destination:'/bbq-admin.html',workspace:'bbq',role:'ADMIN',canAccessPipes:false};
 const returned=await view(admin,'?view=home');
 assert.equal(returned.redirected,'','explicit Main Page link must not bounce to admin');
 assert.equal(returned.main.hidden,false);
 assert.equal(returned.pipes.hidden,false,'both business cards should be visible on Main Page');
 assert.equal(returned.pipesActions.hidden,true,'unauthorized BBQ admin cannot open Pipes links');
 assert.equal(returned.pipesRestricted.hidden,false,'explain how to switch to a Pipes-authorized login');
 assert.match(returned.description.textContent,/assigned login permissions/);
 const sharedAdmin=await view({...admin,canAccessPipes:true},'?view=home');
 assert.equal(sharedAdmin.pipes.hidden,false);
 assert.equal(sharedAdmin.pipesActions.hidden,false,'multi-business admin can open Pipes');
 assert.equal(sharedAdmin.pipesRestricted.hidden,true);
 const fresh=await view(admin);
 assert.equal(fresh.redirected,'/bbq-admin.html','ordinary login keeps auto-redirect');
 const kitchen=await view({destination:'/bbq-kitchen.html',workspace:'bbq',role:'KITCHEN'},'?view=home');
 assert.equal(kitchen.redirected,'/bbq-kitchen.html','staff cannot access admin business landing');
 const owner=await view({destination:'/',workspace:'group',role:'OWNER'});
 assert.equal(owner.redirected,'');
 assert.equal(owner.main.hidden,false);
 assert.equal(owner.pipes.hidden,false,'group owner retains two business cards');
 assert.equal(owner.pipesActions.hidden,false,'group owner can open Pipes');
});
