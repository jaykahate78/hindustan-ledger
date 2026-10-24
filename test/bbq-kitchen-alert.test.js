'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../public/js/bbq-kitchen.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/bbq-kitchen.html'),'utf8');
function fixture(initialOrders,autoplayAllowed=true){
 const elements=new Map();
 const spoken=[];
 const tones=[];
 const pitches=[];
 const gains=[];
 const voiceSelection=[];
 let orders=initialOrders;
 const storage=new Map();
 const callbacks=[];
 const fakeElement=()=>{
  const x={children:[],hidden:false,textContent:'',className:'',onclick:null,
   append(...children){this.children.push(...children)},
   appendChild(child){this.children.push(child)},
   replaceChildren(...children){this.children=[...children]}};
  return x;
 };
 const document={
  hidden:false,
  getElementById(id){if(!elements.has(id))elements.set(id,fakeElement());return elements.get(id)},
  createElement:fakeElement,
  addEventListener(event,fn){callbacks.push({event,fn})}
 };
 class AudioContextMock{
  constructor(){this.state=autoplayAllowed?'running':'suspended';this.currentTime=3;this.destination={}}
  resume(){if(autoplayAllowed)this.state='running';return Promise.resolve()}
  createOscillator(){const osc={type:'',frequency:{value:0},connect(){},start(){tones.push('start');pitches.push(osc.frequency.value)},stop(){}};return osc}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(value){gains.push(value)}},connect(){}}}
 }
 const synth={cancel(){},getVoices(){return [{lang:'en-US',name:'American English'},{lang:'en-IN',name:'Indian English',localService:true}]},speak(u){spoken.push(u.text);voiceSelection.push(u.voice?.lang)}};
 class Utterance{constructor(text){this.text=text}}
 const fetch=async url=>({
  ok:true,status:200,async json(){
   if(url.endsWith('pos/session'))return {role:'KITCHEN',can_kitchen:true};
   if(url.endsWith('pos/kitchen-orders'))return orders;
   throw Error('Unexpected request '+url)
  }
 });
 const timers=[];
 const context=vm.createContext({
  window:{AudioContext:AudioContextMock,speechSynthesis:synth,SpeechSynthesisUtterance:Utterance,
   location:{replace(url){throw Error('Unexpected redirect '+url)},}},
  document,fetch,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  setInterval(fn){timers.push(fn);return timers.length},
  setTimeout(fn){return 1},clearTimeout(){},
  console,Promise,Number,Math,Set,String,Array
 });
 return {context,elements,spoken,tones,pitches,gains,voiceSelection,timers,storage,callbacks,
  setOrders(x){orders=x},
  allowSound(){autoplayAllowed=true},
  async settle(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))}
 };
}
const kot=(id,status='NEW')=>({id,order_no:'POS-TEST-'+id,channel:'TAKEAWAY',table_label:'',status,items:[{name:'Pav Bhaji',quantity:1}]});
test('new KOT plays original two-tone bell with Indian English voice once per order',async()=>{
 const f=fixture([kot(51)]);
 vm.runInContext(script,f.context);
 await f.settle();
 assert.deepEqual(f.spoken,['New order received']);
 assert.equal(f.tones.length,2,'original two-tone bell');
 assert.deepEqual(f.pitches,[880,1180]);
 assert.deepEqual(f.voiceSelection,['en-IN'],'prefer Indian English browser voice over American');
 assert.ok(f.gains.some(x=>Math.abs(x-.12)<.00001),'original bell level restored');
 assert.match(f.elements.get('arrival').textContent,/New order received/);
 assert.equal(f.elements.get('newCount').textContent,1);
 f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,1,'duplicate poll must stay silent');
 f.setOrders([kot(52),kot(51)]);f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,2,'new order must alert once');
 assert.equal(f.tones.length,4);
 assert.equal(f.storage.get('bbq.kitchen.lastNotifiedOrderId.v1'),'52');
 f.setOrders([kot(52,'PREPARING'),kot(51,'READY')]);f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,2,'stage changes must not trigger a new-order alert');
});
test('when browser blocks autoplay the first touch activates audio without sound panel',async()=>{
 const f=fixture([kot(72)],false);
 vm.runInContext(script,f.context);
 await f.settle();
 assert.equal(f.spoken.length,0);
 assert.equal(f.elements.get('arrival').hidden,false);
 assert.ok(!f.elements.has('soundPanel'),'no green sound bar instantiated');
 assert.ok(!f.elements.has('sound'),'no test sound button');
 const click=f.callbacks.find(c=>c.event==='pointerdown');
 assert.ok(click,'first-interaction unlock is registered');
 f.allowSound();
 click.fn();
 await f.settle();
 assert.equal(f.spoken.at(-1),'New order received','pending spoken alert after sound unlock');
 assert.equal(f.tones.length,2,'two-tone after first interaction');
});
test('existing latest order IDs are persisted to avoid repeat notifications on reload',async()=>{
 const f=fixture([kot(81),kot(80)]);
 vm.runInContext(script,f.context);
 await f.settle();
 assert.equal(f.storage.get('bbq.kitchen.lastNotifiedOrderId.v1'),'81');
 assert.equal(f.spoken.length,1,'batch of two new orders gets one announcement');
 f.setOrders([kot(81),kot(80)]);
 f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,1);
});
test('sound panel is removed and KOT voice/tone logic remains available',()=>{
 assert.doesNotMatch(html,/id="soundPanel"|id="soundStatus"|id="sound"|sound-panel/);
 assert.match(html,/id="arrival"/);
 assert.match(html,/id="newCount"/);
 assert.match(script,/New order received/);
 assert.match(script,/TWO_TONE_ALERT=\[\[880,0\],\[1180,\.18\]\]/);
 assert.match(script,/indianEnglish/);
 assert.match(script,/SpeechSynthesisUtterance/);
 assert.match(script,/pointerdown/);
 assert.match(script,/keydown/);
 assert.match(script,/localStorage/);
 assert.match(script,/visibilitychange/);
 assert.match(script,/setInterval\(reload,10000\)/);
 assert.doesNotMatch(script,/total_amount|unit_price|payment_method/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
