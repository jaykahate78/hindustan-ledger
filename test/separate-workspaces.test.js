'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
test('Hindustan Pipes and BBQ software remain separate',()=>{
 assert.ok(read('pipes.html').includes('js/pipes-ui.js'));
 assert.ok(read('bbq.html').includes('js/bbq-cashier.js'));
 assert.ok(!read('bbq.html').includes('Raw Material Stock'));
 assert.ok(read('index.html').includes('href="/bbq-admin.html"'));
 assert.ok(read('index.html').includes('href="/pipes.html"'));
});
test('one login routes BBQ staff automatically and preserves separated dashboards',()=>{
 const portal=read('bbq-access.html');
 assert.ok(portal.includes('url=/login.html'));
 for(const role of ['admin','billing','kitchen'])assert.ok(read('bbq-'+role+'-login.html').includes('url=/login.html'));
 for(const page of ['bbq-admin.html','bbq.html','bbq-kitchen.html'])assert.ok(read(page).includes('<html'));
 const login=read('login.js');assert.ok(login.includes('/api/auth/landing'));
 for(const f of ['js/pipes-ui.js','js/bbq-cashier.js','js/bbq-admin.js','js/bbq-kitchen.js','login.js'])assert.doesNotThrow(()=>new vm.Script(read(f)));
});
test('separate company accounting remains locked',()=>{
 const js=read('js/company-accounting.js');
 assert.ok(js.includes('orgSelector.disabled=true'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
