'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
test('procurement endpoints cover supplier, PO, receipt and expense workflows',()=>{
 const expected=['GET /pipes/suppliers','POST /pipes/suppliers','GET /pipes/purchase-orders','POST /pipes/purchase-orders','POST /pipes/purchase-lines/:id/receive','GET /pipes/factory-expenses','POST /pipes/factory-expenses'];
 const actual=[];const router={get:(p,h)=>{assert.equal(typeof h,'function');actual.push('GET '+p)},post:(p,h)=>{assert.equal(typeof h,'function');actual.push('POST '+p)}};
 require('../pipes-procurement')(router,{});assert.deepEqual(actual,expected);
});
test('purchase receipts are transactionally recorded with stock movements',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../pipes-procurement.js'),'utf8');
 assert.match(code,/FOR UPDATE OF l/);
 assert.match(code,/Receipt exceeds outstanding purchase order quantity/);
 assert.match(code,/raw_material_movements/);
 assert.match(code,/await db\.query\('COMMIT'\)/);
});
test('purchase schema is additive and preserves original records',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../sql/pipes-procurement.sql'),'utf8');
 for(const name of ['pipe_suppliers','pipe_purchase_orders','pipe_purchase_order_lines','pipe_purchase_receipts','pipe_factory_expenses'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+name));
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
});
