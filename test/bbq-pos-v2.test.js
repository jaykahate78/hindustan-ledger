'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/bbq.html'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../public/js/bbq-pos-v2.js'),'utf8');
test('restaurant v2 client syntax and three focused views',()=>{assert.doesNotThrow(()=>new vm.Script(js));for(const view of ['billing','kitchen','menu'])assert.match(html,new RegExp('id="'+view+'"'));assert.match(html,/bbq-pos-v2\.js/);});
test('only existing restaurant workflows enhanced',()=>{for(const s of ['pos/menu','pos/orders','availability','payment','receipt','Print KOT','showCart','statusFilter'])assert.ok(js.includes(s));assert.doesNotMatch(js,/pipes\/|warehouse|factory/i);assert.doesNotMatch(html,/Raw Material Stock|Hindustan Pipes/);});
test('quick cart quantity guards, explicit payment confirmation, safe ticket DOM',()=>{assert.match(js,/count>=500/);assert.match(js,/window\.confirm\('Confirm actual receipt/);assert.match(js,/textContent/);assert.doesNotMatch(js,/innerHTML\s*=/);});
test('backend menu availability endpoint isolated and validated',()=>{const server=fs.readFileSync(path.join(__dirname,'../operations.js'),'utf8');assert.match(server,/\/pos\/menu\/:id\/availability/);assert.match(server,/typeof req\.body\.available!=='boolean'/);assert.match(server,/organization_id=\$2 AND id=\$3/);});
