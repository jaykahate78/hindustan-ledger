'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('BBQ admin displays existing accounting as third tab, cashier kitchen stay isolated',()=>{
 const admin=read('public/bbq-admin.html'),cashier=read('public/bbq.html'),kitchen=read('public/bbq-kitchen.html');
 assert.match(admin,/id="tabSales"/);assert.match(admin,/id="tabInventory"/);assert.match(admin,/id="tabAccounts"/);
 assert.match(admin,/id="accountsPane"/);assert.match(admin,/id="bbqAccountingFrame"/);
 assert.doesNotMatch(cashier,/accountingFrame|tabAccounts|accountsPane/);
 assert.doesNotMatch(kitchen,/accountingFrame|tabAccounts|accountsPane/);
 const script=read('public/js/bbq-inventory-admin.js');
 assert.match(script,/accounting\.html\?company=bbq&embedded=1/);
 assert.match(script,/frame\.hasAttribute\('src'\)/);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(script,/function checkAccountingFrame\(\)/);
 assert.match(script,/function accountingViewIsValid\(frame\)/);
 assert.match(script,/location\?\.pathname==='\/accounting\.html'/);
 assert.match(script,/accountingNavigationFailures>=3/);
 assert.match(script,/frame\.src=BBQ_ACCOUNTING_URL/);
});
test('existing accounting retains all four ledger sections and company isolation',()=>{
 const html=read('public/accounting.html'),js=read('public/js/company-accounting.js');
 for(const key of ['tab-balances','tab-vouchers','tab-ledgers','tab-history'])assert.ok(html.includes(key),key);
 assert.match(html,/bbq-embedded/);
 assert.match(html,/html\.bbq-embedded \.accounting-back-nav\{display:none!important\}/);
 assert.match(html,/class="accounting-back-nav"/);
 assert.match(js,/orgSelector\.disabled=true/);
 assert.match(js,/bbq:'BBQ Pav Bhaji Chain'/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
test('BBQ accounting page and APIs have server enforced admin check independent of tab visibility',()=>{
 const server=read('server.js');
 assert.match(server,/BBQ accounting is available to admins only/);
 assert.match(server,/app\.get\('\/accounting\.html'/);
 assert.match(server,/req\.query\.company!=='bbq'/);
 assert.match(server,/access\.rows\[0\]\.role!=='ADMIN'/);
 assert.match(server,/req\.orgRole!=='ADMIN'/);
 assert.match(server,/scopeAccount,async\(req,res,next\)/);
 assert.match(server,/auth\.requireRole\('OPERATOR'\)/);
 assert.doesNotThrow(()=>new vm.Script(server));
});

test('embedded account tab prevents recursive navigation into the admin dashboard',()=>{
 const src=read('public/js/bbq-inventory-admin.js');
 const start=src.indexOf("const BBQ_ACCOUNTING_URL=");
 const end=src.indexOf("invEl('recipeDish').onchange",start);
 const section=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 const iframeState={
  location:{pathname:'/bbq-admin.html',search:''},
  source:'',
  hidden:false,
  hasAttribute(n){return n==='src'&&this.source!==''},
  addEventListener(event,handler){this.onload=handler},
  set src(value){this.source=value},
  get src(){return this.source},
  contentWindow:{location:{pathname:'/bbq-admin.html',search:''}}
 };
 const panes={};
 const element=id=>{
  if(id==='bbqAccountingFrame')return iframeState;
  return panes[id]||(panes[id]={hidden:false,className:'',textContent:'',setAttribute(){}});
 };
 const globals={invEl:element,invShowTab(){},URLSearchParams,console};
 // Execute just the tab-guard portion (not the other admin inventory API calls).
 vm.runInNewContext(section,globals);
 globals.invEl('tabAccounts').onclick();
 assert.equal(iframeState.src,'/accounting.html?company=bbq&embedded=1');
 iframeState.contentWindow.location={pathname:'/bbq-admin.html',search:''};
 iframeState.onload();
 assert.equal(iframeState.src,'/accounting.html?company=bbq&embedded=1');
 iframeState.contentWindow.location={pathname:'/accounting.html',search:'?company=bbq&embedded=1'};
 iframeState.onload();
 assert.match(panes.accountingNotice.textContent,/BBQ company accounting/);
 assert.equal(iframeState.hidden,false);
});
