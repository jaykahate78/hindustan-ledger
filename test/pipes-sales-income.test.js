'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('factory sales endpoints register independently of BBQ',()=>{
 const routes=[];const router={get:(p,h)=>{assert.equal(typeof h,'function');routes.push('GET '+p)},post:(p,h)=>{assert.equal(typeof h,'function');routes.push('POST '+p)}};
 require('../pipes-sales')(router,{});
 assert.deepEqual(routes,['GET /pipes/sales-orders','POST /pipes/sales-orders','POST /pipes/sales-orders/:id/cancel','GET /pipes/income-register','POST /pipes/income-register','GET /pipes/sales-summary']);
});
test('sales schema is non-destructive and no financial auto posting',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../sql/pipes-sales-income.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS pipe_sales_orders/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS pipe_income_register/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
 const src=fs.readFileSync(path.join(__dirname,'../pipes-sales.js'),'utf8');
 assert.doesNotMatch(src,/INSERT INTO vouchers|INSERT INTO journal_lines|UPDATE warehouse_bundles/i);
});
test('factory sales UI parses and is isolated from restaurant',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/js/pipes-ui.js'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/salesOrderForm/);assert.match(js,/incomeForm/);
 assert.doesNotMatch(js,/async function pos\(/);
});
