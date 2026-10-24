'use strict';
const form=document.getElementById('login');
const error=document.getElementById('error');
const button=form.querySelector('button[type="submit"]');
let routing=false;
async function destination(){
 const response=await fetch('/api/auth/landing',{credentials:'same-origin',cache:'no-store'});
 if(response.status===401)return null;
 if(!response.ok)throw Error('Unable to verify your assigned role. Contact the administrator.');
 const data=await response.json();
 const allowed=new Set(['/','/bbq-admin.html','/bbq.html','/bbq-kitchen.html']);
 if(!allowed.has(data.destination))throw Error('Invalid account destination');
 return data.destination;
}
async function finishLogin(){
 const target=await destination();
 if(!target)return false;
 routing=true;
 window.location.replace(target);
 return true;
}
async function checkExistingSession(){
 try{
  if(await finishLogin())return;
 }catch(e){error.textContent=e.message}
 button.disabled=false;
 button.textContent='Sign in';
}
form.addEventListener('submit',async(event)=>{
 event.preventDefault();if(routing)return;
 error.textContent='';button.disabled=true;button.textContent='Signing in…';
 try{
  const username=form.elements.namedItem('username').value.trim().toLowerCase();
  const password=form.elements.namedItem('password').value;
  const response=await fetch('/api/auth/login',{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({username,password})
  });
  if(!response.ok){
   error.textContent=response.status===429?'Too many attempts. Try later.':'Incorrect username or password.';
   return;
  }
  if(!await finishLogin()){
   error.textContent='Account session could not be verified. Please retry.';
  }
 }catch(e){
  error.textContent=e.message||'Cannot connect to the server.';
 }finally{if(!routing){button.disabled=false;button.textContent='Sign in'}}
});
button.disabled=true;button.textContent='Checking session…';
checkExistingSession();
