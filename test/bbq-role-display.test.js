'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {canPos,posCapabilities}=require('../pos-permissions');
test('cashier kitchen and admin have separate access',()=>{
 assert.equal(posCapabilities('OPERATOR').view,'cashier');
 assert.equal(posCapabilities('KITCHEN').view,'kitchen');
 assert.equal(posCapabilities('ADMIN').view,'admin');
 assert.equal(canPos('GET','/pos/admin/daily-report','OPERATOR'),false);
 assert.equal(canPos('GET','/pos/admin/daily-report','KITCHEN'),false);
 assert.equal(canPos('GET','/pos/admin/daily-report','ADMIN'),true);
 assert.equal(canPos('GET','/pos/admin/daily-report','OWNER'),true);
 assert.equal(canPos('GET','/pos/kitchen-orders','OPERATOR'),false);
 assert.equal(canPos('PATCH','/pos/orders/15/status','KITCHEN'),true);
});
test('cashier screen has payment and KDS has no financial fields',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/bbq.html'),'utf8');
 const kds=fs.readFileSync(path.join(__dirname,'../public/bbq-kitchen.html'),'utf8');
 assert.ok(html.includes('id="paymentMethod"'));
 assert.ok(!html.includes('cashierPayments')&&!html.includes('id="kitchen"'));
 assert.ok(!kds.includes('total_amount')&&!kds.includes('Record Payment'));
});
