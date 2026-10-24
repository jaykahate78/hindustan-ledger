'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {canPos,posCapabilities}=require('../pos-permissions');
test('admin alone can read day-wise completed BBQ report',()=>{
 const paths=[];require('../bbq-admin-report')({get:(p,h)=>{paths.push(p);assert.equal(typeof h,'function')}},{});
 assert.deepEqual(paths,['/pos/admin/daily-report']);
 assert.equal(canPos('GET','/pos/admin/daily-report','ADMIN'),true);
 assert.equal(canPos('GET','/pos/admin/daily-report','OWNER'),true);
 assert.equal(canPos('GET','/pos/admin/daily-report','OPERATOR'),false);
 assert.equal(canPos('GET','/pos/admin/daily-report','KITCHEN'),false);
 assert.equal(posCapabilities('ADMIN').view,'admin');
});
test('daily report is completed-only, IST and scoped by business',()=>{
 const src=read('bbq-admin-report.js');
 for(const field of ['BBQ Pav Bhaji Chain','Asia/Kolkata',"o.status='COMPLETED'",'cash_sales','upi_sales','card_sales','cashier_user_id','json_agg','recent_days','STAGING-%'])assert.ok(src.includes(field),field);
 assert.ok(!src.includes('INSERT INTO pos_orders'));
});
test('order creation captures cashier and kitchen completion time',()=>{
 const src=read('operations.js');
 assert.ok(src.includes('cashier_user_id'));
 assert.ok(src.includes('completed_at=CASE WHEN'));
 assert.ok(src.includes("WHERE id=$2 AND organization_id=$3"));
});
test('separate role-specific logins and pages parse',()=>{
 const server=read('server.js');
 for(const route of ['/bbq-admin.html','/bbq.html','/bbq-kitchen.html'])assert.ok(server.includes(route));
 for(const mode of ['admin','billing','kitchen'])assert.ok(read('public/bbq-'+mode+'-login.html').includes('bbq-role-login.js'));
 for(const file of ['public/js/bbq-role-login.js','public/js/bbq-cashier.js','public/js/bbq-admin.js','public/js/bbq-kitchen.js'])assert.doesNotThrow(()=>new vm.Script(read(file)));
 assert.ok(!read('public/bbq.html').includes('id="kitchen"'));
 assert.ok(!read('public/bbq-kitchen.html').includes('id="paymentMethod"'));
 assert.ok(!read('public/bbq-admin.html').includes('id="cartItems"'));
});
