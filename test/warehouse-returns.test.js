'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const attach=require('../warehouse-returns');
test('warehouse returns routes are registered',()=>{
 const registered=[];const router={get:(p,h)=>{registered.push('GET '+p);assert.equal(typeof h,'function')},post:(p,h)=>{registered.push('POST '+p);assert.equal(typeof h,'function')}};
 attach(router,{});
 assert.deepEqual(registered,['GET /pipes/returns','GET /pipes/returns/eligible','POST /pipes/returns','POST /pipes/returns/:id/inspect']);
});
test('return migration is additive and rejects duplicate claims',()=>{
 const sql=fs.readFileSync(path.resolve(__dirname,'../sql/warehouse-returns.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS warehouse_bundle_returns/i);
 assert.match(sql,/dispatch_id BIGINT NOT NULL UNIQUE/i);
 assert.match(sql,/status='ACCEPTED'/i);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
});
test('return availability restores only owner-accepted bundles',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../warehouse-dispatch.js'),'utf8');
 assert.match(src,/r\.status='ACCEPTED'/);
 assert.match(src,/warehouse_bundle_returns/);
});
