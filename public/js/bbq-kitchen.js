'use strict';
// Voice-and-tone alerts are enabled by default; browser autoplay policies can still require one tap.
const el=id=>document.getElementById(id);
const ALERT_TEXT='Attention kitchen, new order received';
const ALERT_VOLUME=1; // 100% of the configured alert output; device volume is controlled by the OS.
const TRIPLE_ALERT=[[920,0],[920,.20],[1250,.40]];
const VOICE_DELAY_MS=650; // Speak after the three tones, not over them.
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
function audioStatus(){
 const panel=el('soundPanel'),title=el('soundStatus'),hint=el('soundHint'),button=el('sound');
 const audioWorking=state.audioReady;
 panel.className='sound-panel '+(audioWorking?'ready':'needs-tap');
 title.textContent=audioWorking?'🔊 Order sound: ON':'🔔 Tap to activate order sound';
 hint.textContent=audioWorking
  ?(state.speechReady?'Triple Alert · 100% · “Attention kitchen, new order received” · once per new order.':'Triple Alert · 100% · once per new order. Voice unavailable on this browser.')
  :'Browsers may block automatic audio until you tap the button. Keep this device unmuted.';
 button.textContent=audioWorking?'🔊 Test Order Alert':'🔊 Activate Order Sound';
 if(state.soundError&&!audioWorking)el('error').textContent=state.soundError;
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
  for(const [frequency,offset] of TRIPLE_ALERT){
   const o=ctx.createOscillator(),g=ctx.createGain();
   o.type='sine';o.frequency.value=frequency;
   g.gain.setValueAtTime(.0001,start+offset);
   g.gain.exponentialRampToValueAtTime(.24*ALERT_VOLUME,start+offset+.015);
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
  utterance.lang='en-IN';utterance.rate=.92;utterance.pitch=1;utterance.volume=ALERT_VOLUME;
  if(typeof synth.getVoices==='function'){
   const voices=synth.getVoices();
   const voice=voices.find(v=>v.lang?.toLowerCase()==='en-in')||
    voices.find(v=>v.lang?.toLowerCase().startsWith('en-'));
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
 beep();
 setTimeout(speak,VOICE_DELAY_MS);
}
function showArrival(count){
 const banner=el('arrival');
 banner.textContent=count===1?'🔔 New order received — check the kitchen display':`🔔 ${count} new orders received — check the kitchen display`;
 banner.hidden=false;
 clearTimeout(state.arrivalTimeout);
 state.arrivalTimeout=setTimeout(()=>{banner.hidden=true},8000);
}
async function activateAudio(test=false){
 // This handler must be reached from a click to unlock sound in strict browsers.
 const ctx=context();
 const resumed=ctx&&ctx.state!=='running'?ctx.resume():Promise.resolve();
 // Speech is invoked synchronously in the click gesture for browser compatibility.
 if(test)speak();
 try{
  await resumed;
  state.audioReady=ctx?ctx.state==='running':!!(window.speechSynthesis&&window.SpeechSynthesisUtterance);
  if(!state.audioReady)state.soundError='Audio is blocked. Tap Activate Order Sound once and check device volume.';
  audioStatus();
  if(state.audioReady){
   if(test)beep();
   else if(state.pendingAnnouncement)playOrderAlert();
   state.pendingAnnouncement=false;
  }
 }catch(e){state.soundError='Audio is blocked: '+e.message;audioStatus()}
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
el('sound').onclick=()=>activateAudio(true);
el('reload').onclick=reload;
audioStatus();
api('pos/session').then(r=>{
 if(!r.can_kitchen){window.location.replace('/login.html');return}
 state.authorized=true;attemptAutomaticSound();return refresh();
}).catch(e=>el('error').textContent=e.message);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reload()});
setInterval(reload,10000);
