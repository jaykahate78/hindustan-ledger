'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('cashier must confirm payment before creating kitchen order',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../operations.js'),'utf8');
 assert.ok(src.includes('req.body.payment_confirmed!==true'));
 assert.ok(src.includes('payment_confirmed_at'));assert.ok(src.includes('cashier_user_id'));
});
test('payment method belongs inside cashier cart; no separate payment screen',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/bbq.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/js/bbq-cashier.js'),'utf8');
 assert.ok(html.includes('id="paymentMethod"'));
 assert.ok(html.includes('id="paymentReference"'));
 assert.ok(html.includes('Confirm Payment & Send KOT'));
 assert.ok(!html.includes('cashierPayments')&&!html.includes('id="kitchen"'));
 assert.ok(js.includes('payment_confirmed:true'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
