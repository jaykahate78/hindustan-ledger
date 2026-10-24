'use strict';
const logout=document.getElementById('logout');
if(logout)logout.addEventListener('click',async()=>{
 logout.disabled=true;
 try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}finally{window.location.replace('/bbq-access.html')}
});
