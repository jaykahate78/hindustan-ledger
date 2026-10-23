'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const publicDir=path.resolve(__dirname,'../public');
const read=file=>fs.readFileSync(path.join(publicDir,file),'utf8');
test('separate business pages have only their dedicated operations and accounting links',()=>{
 const pipes=read('pipes.html'),bbq=read('bbq.html'),portal=read('index.html');
 assert.match(pipes,/\/js\/pipes-ui\.js/);assert.doesNotMatch(pipes,/\/js\/bbq-ui\.js|Kitchen Order Queue/);
 assert.match(bbq,/\/js\/bbq-ui\.js/);assert.doesNotMatch(bbq,/\/js\/pipes-ui\.js|Raw Material Stock|Pre-Casting Production/);
 assert.match(pipes,/accounting\.html\?company=pipes/);assert.match(bbq,/accounting\.html\?company=bbq/);
 assert.match(portal,/href="\/pipes\.html"/);assert.match(portal,/href="\/bbq\.html"/);
 assert.doesNotMatch(portal,/Voucher \/ Transactions|Create Transaction Voucher/);
});
test('dedicated frontend scripts parse and do not contain cross-business code',()=>{
 const pipes=read('js/pipes-ui.js'),bbq=read('js/bbq-ui.js');
 for(const [name,source] of [['pipes',pipes],['bbq',bbq]])assert.doesNotThrow(()=>new vm.Script(source,{filename:name+'.js'}));
 assert.match(pipes,/async function pipes\(\)/);assert.doesNotMatch(pipes,/async function pos\(\)/);
 assert.match(bbq,/async function pos\(\)/);assert.doesNotMatch(bbq,/async function pipes\(\)/);
});
test('accounting page is locked by requested company',()=>{
 const accounting=read('accounting.html'),js=read('js/company-accounting.js');
 assert.match(accounting,/company-accounting\.js/);
 assert.match(js,/orgSelector\.disabled=true/);
 assert.match(js,/URLSearchParams/);
 assert.match(js,/orgs\.find\(o=>o\.name===names\[requested\]\)/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
