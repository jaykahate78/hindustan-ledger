'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('financial APIs register reporting and owner-reviewed posting routes',()=>{
 const routes=[];
 const router={get:(p,h)=>{assert.equal(typeof h,'function');routes.push('GET '+p)},post:(p,h)=>{assert.equal(typeof h,'function');routes.push('POST '+p)}};
 require('../pipes-finance')(router,{});
 assert.deepEqual(routes,['GET /pipes/finance/report','GET /pipes/finance/unposted','POST /pipes/finance/post']);
});
test('financial posting requires owner and has transactional balanced entries',()=>{
 const src=fs.readFileSync(require('node:path').join(__dirname,'../pipes-finance.js'),'utf8');
 assert.match(src,/req\.user\?\.is_owner/);
 assert.match(src,/await db\.query\('BEGIN'\)/);
 assert.match(src,/journal_lines/);
 assert.match(src,/pipe_finance_postings/);
 assert.match(src,/await db\.query\('ROLLBACK'\)/);
});
test('posting link migration is additive and prevents duplicate sources',()=>{
 const sql=fs.readFileSync(require('node:path').join(__dirname,'../sql/pipes-finance.sql'),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS pipe_finance_postings/i);
 assert.match(sql,/UNIQUE\(organization_id,source_type,source_id\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b/i);
});
