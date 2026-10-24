'use strict';
// Voice-and-tone alerts are enabled by default; browser autoplay policies can still require one tap.
const el=id=>document.getElementById(id);
const ALERT_TEXT='New order received';
const TWO_TONE_ALERT=[[880,0],[1180,.18]]; // Original compact kitchen chime.
const LAST_NOTIFIED_KEY='bbq.kitchen.lastNotifiedOrderId.v1';
const storedLast=(()=>{try{const n=Number(localStorage.getItem(LAST_NOTIFIED_KEY));return Number.isSafeInteger(n)&&n>0?n:0}catch{return 0}})();
const state={lastNotified:storedLast,audio:null,audioReady:false,speechReady:!!window.speechSynthesis,
  pendingAnnouncement:false,refreshing:false,arrivalTimeout:null,soundError:'',authorized:false};
async function api(path,opt={}){
 const response=await fetch('/api/operations/'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...opt});
 const data=await response.json().catch(()=>({error:'Invalid server response'}));
 if(!response.ok)throw Error(data.error||'Kitchen request failed');
 return data;
}
function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n}
// Alerts run without a visible control panel. Browser gesture restrictions still apply.
function audioStatus(){
 if(state.audioReady)state.soundError='';
}
function context(){
 if(state.audio)return state.audio;
 const C=window.AudioContext||window.webkitAudioContext;
 if(!C)return null;
 try{state.audio=new C()}catch(e){state.soundError='Cannot start audio: '+e.message;return null}
 return state.audio;
}
function beep(){
 const ctx=state.audio;
 if(!state.audioReady||!ctx||ctx.state!=='running')return false;
 try{
  const start=ctx.currentTime;
  for(const [frequency,offset] of TWO_TONE_ALERT){
   const o=ctx.createOscillator(),g=ctx.createGain();
   o.type='sine';o.frequency.value=frequency;
   g.gain.setValueAtTime(.0001,start+offset);
   g.gain.exponentialRampToValueAtTime(.12,start+offset+.015);
   g.gain.exponentialRampToValueAtTime(.0001,start+offset+.15);
   o.connect(g);g.connect(ctx.destination);o.start(start+offset);o.stop(start+offset+.17);
  }
  return true;
 }catch(e){el('error').textContent='Tone could not play: '+e.message;return false}
}
function speak(){
 const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
 if(!synth||!Utterance)return false;
 try{
  synth.cancel();
  const utterance=new Utterance(ALERT_TEXT);
  utterance.lang='en-IN';utterance.rate=.9;utterance.pitch=1;utterance.volume=1;
  if(typeof synth.getVoices==='function'){
   const voices=synth.getVoices();
   // Indian English is explicitly preferred; voice options vary by browser/device.
   const indianEnglish=voices.filter(v=>/^en[-_]in$/i.test(v.lang||''));
   const voice=indianEnglish.find(v=>v.localService===true)||indianEnglish[0]||
    voices.find(v=>/^en[-_]/i.test(v.lang||'')&&/india|indian/i.test(v.name||''))||
    voices.find(v=>/^en([_-]|$)/i.test(v.lang||''));
   if(voice)utterance.voice=voice;
  }
  utterance.onerror=()=>{el('error').textContent='Voice unavailable on this device. Check browser speech/audio settings.'};
  synth.speak(utterance);
  return true;
 }catch(e){el('error').textContent='Voice alert unavailable: '+e.message;return false}
}
function playOrderAlert(){
 if(!state.audioReady){state.pendingAnnouncement=true;audioStatus();return}
 state.pendingAnnouncement=false;
 beep();speak();
}
function showArrival(count){
 const banner=el('arrival');
 banner.textContent=count===1?'🔔 New order received — check the kitchen display':`🔔 ${count} new orders received — check the kitchen display`;
 banner.hidden=false;
 clearTimeout(state.arrivalTimeout);
 state.arrivalTimeout=setTimeout(()=>{banner.hidden=true},8000);
}
async function activateAudio(){
 // A first tap or keypress can unlock sound on browsers that block autoplay.
 const ctx=context();
 if(!ctx)return;
 try{
  if(ctx.state!=='running')await ctx.resume();
  state.audioReady=ctx.state==='running';
  audioStatus();
  if(state.audioReady&&state.pendingAnnouncement)playOrderAlert();
 }catch(e){
  state.soundError='Audio is blocked: '+e.message;
 }
}
function attemptAutomaticSound(){
 const ctx=context();
 if(!ctx){
  state.audioReady=false;
  audioStatus();
  return;
 }
 if(ctx.state==='running'){state.audioReady=true;audioStatus();return}
 // An autoplay-blocked resume may remain pending: never block polling or KOT rendering.
 Promise.resolve(ctx.resume()).then(()=>{
  state.audioReady=ctx.state==='running';
  audioStatus();
  if(state.audioReady&&state.pendingAnnouncement)playOrderAlert();
 }).catch(()=>{audioStatus()});
 audioStatus();
}
function recordAnnouncedId(value){
 if(value<=state.lastNotified)return;
 state.lastNotified=value;
 try{localStorage.setItem(LAST_NOTIFIED_KEY,String(value))}catch{}
}
async function refresh(){
 if(state.refreshing||!state.authorized)return;
 state.refreshing=true;
 try{
  const orders=await api('pos/kitchen-orders');
  const activeNew=orders.filter(o=>o.status==='NEW'&&Number.isSafeInteger(Number(o.id))&&Number(o.id)>state.lastNotified);
  const newest=orders.reduce((max,o)=>Math.max(max,Number(o.id)||0),state.lastNotified);
  // Advance high-water mark for all seen orders so old orders never re-alert.
  recordAnnouncedId(newest);
  if(activeNew.length){showArrival(activeNew.length);playOrderAlert()}
  el('newCount').textContent=orders.filter(o=>o.status==='NEW').length;
  el('prepCount').textContent=orders.filter(o=>o.status==='PREPARING').length;
  el('readyCount').textContent=orders.filter(o=>o.status==='READY').length;
  const target=el('tickets');target.replaceChildren();
  for(const o of orders.filter(x=>['NEW','PREPARING','READY'].includes(x.status))){
   const card=node('article');card.className='ticket'+(o.status==='NEW'?' new':'');
   card.append(node('h2',o.order_no),node('p',o.table_label||o.channel),node('strong',o.status));
   for(const item of o.items||[])card.appendChild(node('p',item.quantity+' × '+item.name));
   const next={NEW:'PREPARING',PREPARING:'READY',READY:'COMPLETED'}[o.status];
   const btn=node('button','Mark '+next);
   btn.onclick=async()=>{try{await api('pos/orders/'+o.id+'/status',{method:'PATCH',body:JSON.stringify({status:next})});await refresh()}catch(e){el('error').textContent=e.message}};
   card.append(btn);
   if(['NEW','PREPARING'].includes(o.status)){
    const cancel=node('button','Cancel Order');cancel.className='secondary';cancel.type='button';
    cancel.onclick=async()=>{
     const message=o.status==='NEW'
      ?'Cancel this order? Unused ingredients will return to stock. Customer refund must be handled separately.'
      :'Cancel after preparation started? Used ingredients will be counted as wastage, not restocked. Customer refund must be handled separately.';
     if(!window.confirm(message))return;
     try{await api('pos/orders/'+o.id+'/status',{method:'PATCH',body:JSON.stringify({status:'CANCELLED'})});await refresh()}
     catch(e){el('error').textContent=e.message}
    };
    card.append(cancel);
   }
   target.append(card);
  }
  if(!target.children.length)target.appendChild(node('p','No active orders'));
  el('error').textContent='';
 }finally{state.refreshing=false}
}
function reload(){refresh().catch(e=>el('error').textContent=e.message)}
// No visible sound banner: unlock automatically on the first kitchen interaction if needed.
function unlockOnInteraction(){
 if(state.authorized&&!state.audioReady)void activateAudio();
}
document.addEventListener('pointerdown',unlockOnInteraction,{passive:true});
document.addEventListener('keydown',unlockOnInteraction);
el('reload').onclick=reload;
audioStatus();
api('pos/session').then(r=>{
 if(!r.can_kitchen){window.location.replace('/login.html');return}
 state.authorized=true;attemptAutomaticSound();return refresh();
}).catch(e=>el('error').textContent=e.message);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
setInterval(reload,10000);
