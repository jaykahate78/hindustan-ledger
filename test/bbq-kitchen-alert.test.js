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
  createOscillator(){return {type:'',frequency:{value:0},connect(){},start(){tones.push('start')},stop(){}}}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
 }
 const synth={cancel(){},getVoices(){return [{lang:'en-IN'}]},speak(u){spoken.push(u.text)}};
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
 return {context,elements,spoken,tones,timers,storage,callbacks,
  setOrders(x){orders=x},
  allowSound(){autoplayAllowed=true},
  async settle(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve))}
 };
}
const kot=(id,status='NEW')=>({id,order_no:'POS-TEST-'+id,channel:'TAKEAWAY',table_label:'',status,items:[{name:'Pav Bhaji',quantity:1}]});
test('new KOT speaks New order received and triggers tone, but polling same order does not repeat',async()=>{
 const f=fixture([kot(51)]);
 vm.runInContext(script,f.context);
 await f.settle();
 assert.deepEqual(f.spoken,['New order received']);
 assert.equal(f.tones.length,2,'two-tone notification');
 assert.match(f.elements.get('arrival').textContent,/New order received/);
 assert.equal(f.elements.get('newCount').textContent,1);
 f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,1,'duplicate poll must stay silent');
 f.setOrders([kot(52),kot(51)]);f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,2,'new order must alert');
 assert.equal(f.tones.length,4);
 assert.equal(f.storage.get('bbq.kitchen.lastNotifiedOrderId.v1'),'52');
 f.setOrders([kot(52,'PREPARING'),kot(51,'READY')]);f.timers[0]();await f.settle();
 assert.equal(f.spoken.length,2,'stage changes must not trigger a new-order alert');
});
test('autoplay-blocked kitchen clearly prompts activation and activation restores audio',async()=>{
 const f=fixture([kot(72)],false);
 vm.runInContext(script,f.context);
 await f.settle();
 assert.match(f.elements.get('soundStatus').textContent,/Tap to activate order sound/);
 assert.equal(f.spoken.length,0);
 assert.equal(f.elements.get('arrival').hidden,false);
 f.allowSound();
 await f.elements.get('sound').onclick();
 await f.settle();
 assert.equal(f.spoken.at(-1),'New order received','test sound reads requested phrase');
 assert.equal(f.tones.length,2,'tone after user gesture');
 assert.match(f.elements.get('soundStatus').textContent,/Order sound: ON/);
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
test('kitchen UI includes audio-unlock fallback and no prices or payment data',()=>{
 assert.match(html,/id="soundPanel"/);
 assert.match(html,/id="soundStatus"/);
 assert.match(html,/id="arrival"/);
 assert.match(html,/id="sound"/);
 assert.match(script,/New order received/);
 assert.match(script,/SpeechSynthesisUtterance/);
 assert.match(script,/localStorage/);
 assert.match(script,/visibilitychange/);
 assert.match(script,/setInterval\(reload,10000\)/);
 assert.doesNotMatch(script,/total_amount|unit_price|payment_method/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
