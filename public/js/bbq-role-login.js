'use strict';
const form=document.getElementById('login'),error=document.getElementById('error');
const expected=document.body.dataset.role||'';
const destinations={ADMIN:'/bbq-admin.html',OPERATOR:'/bbq.html',KITCHEN:'/bbq-kitchen.html'};
form.addEventListener('submit',async event=>{
 event.preventDefault();
 error.textContent='';const button=form.querySelector('button');button.disabled=true;
 try{
  const username=document.getElementById('username').value.trim().toLowerCase();
  const password=document.getElementById('password').value;
  const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  if(!response.ok){error.textContent=response.status===429?'Too many attempts. Please try later.':'Incorrect username or password.';return}
  const profile=await fetch('/api/operations/pos/session',{credentials:'same-origin'});
  const session=await profile.json().catch(()=>({}));
  const role=session.role;
  if(!profile.ok||!(role===expected||(expected==='ADMIN'&&role==='OWNER'))){
   await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).catch(()=>{});
   error.textContent='This account cannot access the selected screen. Choose the correct login.';
   return;
  }
  window.location.assign(destinations[expected]);
 }catch(e){error.textContent='Connection error. Please retry.'}finally{button.disabled=false}
});
