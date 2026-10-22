'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const attachDispatch=require('../warehouse-dispatch');
test('dispatch endpoints register with the operations router',()=>{
 const paths=[];
 const router={get:(path,handler)=>{paths.push(['GET',path]);assert.equal(typeof handler,'function')},post:(path,handler)=>{paths.push(['POST',path]);assert.equal(typeof handler,'function')}};
 attachDispatch(router,{});
 assert.deepEqual(paths,[
  ['GET','/pipes/dispatch/availability'],
  ['GET','/pipes/dispatch/history'],
  ['GET','/pipes/dispatch/stock-summary'],
  ['POST','/pipes/dispatch']
 ]);
});
test('warehouse dispatch schema is strictly additive',()=>{
 const fs=require('node:fs');const schema=fs.readFileSync(require('node:path').join(__dirname,'../sql/warehouse-dispatch.sql'),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS warehouse_bundle_dispatches/i);
 assert.match(schema,/bundle_id BIGINT NOT NULL UNIQUE/i);
 assert.doesNotMatch(schema,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
});
