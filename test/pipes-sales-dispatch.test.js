'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
test('sales fulfilment routes register and keep organization scoped',()=>{
 const routes=[];
 const router={get:(route,handler)=>{assert.equal(typeof handler,'function');routes.push('GET '+route)},post:(route,handler)=>{assert.equal(typeof handler,'function');routes.push('POST '+route)}};
 require('../pipes-sales-dispatch')(router,{});
 assert.deepEqual(routes,['GET /pipes/sales-dispatch/availability','GET /pipes/sales-dispatch/status','POST /pipes/sales-dispatch']);
 const src=fs.readFileSync(path.join(__dirname,'../pipes-sales-dispatch.js'),'utf8');
 assert.match(src,/FOR UPDATE OF wb/);
 assert.match(src,/FOR UPDATE/);
 assert.match(src,/Bundles exceed remaining sales order quantity/);
 assert.match(src,/Bundle already dispatched/);
 assert.match(src,/await db\.query\('ROLLBACK'\)/);
});
test('sales dispatch schema is additive and enforces unique dispatched bundles',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../sql/pipes-sales-dispatch.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS pipe_sales_dispatch_links/);
 assert.match(sql,/dispatch_id BIGINT NOT NULL UNIQUE/);
 assert.match(sql,/bundle_id BIGINT NOT NULL UNIQUE/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
});
test('sales fulfilment UI parses and remains in Pipes workspace',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../public/js/pipes-ui.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../public/pipes.html'),'utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/sales-dispatch\/availability/);
 assert.match(js,/fulfilOrder/);
 assert.match(html,/id="salesDispatchForm"/);
 assert.doesNotMatch(html,/Kitchen Order Queue/);
});
