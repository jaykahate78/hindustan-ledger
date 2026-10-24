'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('Hindustan Pipes and BBQ software remain separate',()=>{
 assert.ok(read('pipes.html').includes('js/pipes-ui.js'));
 assert.ok(read('bbq.html').includes('js/bbq-cashier.js'));
 assert.ok(!read('bbq.html').includes('Raw Material Stock'));
 assert.ok(read('index.html').includes('href="/bbq-access.html"'));
 assert.ok(read('index.html').includes('href="/pipes.html"'));
});
test('three BBQ logins point to three separate screens',()=>{
 const portal=read('bbq-access.html');
 for(const role of ['admin','billing','kitchen'])assert.ok(portal.includes('/bbq-'+role+'-login.html'));
 for(const page of ['bbq-admin.html','bbq.html','bbq-kitchen.html'])assert.ok(read(page).includes('<html'));
 for(const f of ['js/pipes-ui.js','js/bbq-cashier.js','js/bbq-admin.js','js/bbq-kitchen.js','js/bbq-role-login.js'])assert.doesNotThrow(()=>new vm.Script(read(f)));
});
test('separate company accounting remains locked',()=>{
 const js=read('js/company-accounting.js');
 assert.ok(js.includes('orgSelector.disabled=true'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
