'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('cashier is a single billing view, kitchen and admin are separate',()=>{
 const html=read('bbq.html'),client=read('js/bbq-cashier.js');
 assert.doesNotThrow(()=>new vm.Script(client));
 assert.ok(html.includes('id="cartItems"')&&html.includes('id="placeOrder"'));
 assert.ok(html.includes('bbq-cashier.js'));
 assert.ok(read('bbq-kitchen.html').includes('id="tickets"'));
 assert.ok(read('bbq-admin.html').includes('id="orders"'));
 assert.ok(!html.includes('id="menuForm"')&&!html.includes('id="kitchen"'));
});
test('cart quantity and server-priced payment flow',()=>{
 const client=read('js/bbq-cashier.js');
 for(const x of ['pos/menu','pos/orders','renderCart','payment_method','payment_confirmed:true'])assert.ok(client.includes(x),x);
 assert.ok(client.includes('window.confirm'));
 assert.ok(!client.includes('innerHTML='));
});
test('availability endpoint preserves the existing menu behaviour',()=>{
 const ops=fs.readFileSync(path.join(__dirname,'../operations.js'),'utf8');
 assert.ok(ops.includes("/pos/menu/:id/availability"));
 assert.ok(ops.includes("typeof req.body.available!=='boolean'"));
});
