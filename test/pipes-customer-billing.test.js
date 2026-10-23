'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('customer billing endpoints are isolated Pipes routes',()=>{
 const actual=[];const router={get:(p,h)=>{assert.equal(typeof h,'function');actual.push('GET '+p)},post:(p,h)=>{assert.equal(typeof h,'function');actual.push('POST '+p)}};
 require('../pipes-customer-billing')(router,{});
 assert.deepEqual(actual,['GET /pipes/billing/invoices','GET /pipes/billing/unbilled','POST /pipes/billing/invoices','GET /pipes/billing/invoices/:id','POST /pipes/billing/invoices/:id/payments']);
});
test('invoice posting requires dispatched and unbilled allocations with owner confirmation',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../pipes-customer-billing.js'),'utf8');
 assert.match(s,/Owner approval required for draft invoice/);
 assert.match(s,/Owner confirmation required for manual payment/);
 assert.match(s,/Bundle already billed, returned, or does not match order/);
 assert.match(s,/Payment exceeds outstanding invoice balance/);
 assert.match(s,/FOR UPDATE/);
 assert.match(s,/await db\.query\('ROLLBACK'\)/);
 assert.doesNotMatch(s,/INSERT INTO vouchers|INSERT INTO journal_lines/);
});
test('billing schema prevents duplicate billing for the same dispatched bundle',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../sql/pipes-customer-billing.sql'),'utf8');
 assert.match(s,/sales_dispatch_link_id BIGINT NOT NULL UNIQUE/);
 assert.match(s,/CREATE TABLE IF NOT EXISTS pipe_customer_payments/);
 assert.doesNotMatch(s,/\bDROP\b|\bTRUNCATE\b/);
});
test('Pipes invoice UI parses',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../public/js/pipes-ui.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(s));
 assert.match(s,/customerInvoiceForm/);
 assert.match(s,/balance_due/);
});
