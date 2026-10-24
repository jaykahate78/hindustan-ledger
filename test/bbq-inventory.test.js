'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const inventory=require('../bbq-inventory'),{canPos}=require('../pos-permissions');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('BBQ ingredient routes are isolated and admin-only except cashier availability',()=>{
 const routes=[];const router={get:(url,handler)=>{assert.equal(typeof handler,'function');routes.push('GET '+url)},post:(url,handler)=>{assert.equal(typeof handler,'function');routes.push('POST '+url)},put:(url,handler)=>{assert.equal(typeof handler,'function');routes.push('PUT '+url)}};
 inventory(router,{});
 for(const expected of ['GET /pos/inventory/items','POST /pos/inventory/items','GET /pos/inventory/recipes','PUT /pos/inventory/menu/:id/recipe','POST /pos/inventory/items/:id/stock','POST /pos/inventory/items/:id/count','GET /pos/menu-stock','GET /pos/inventory/report'])assert.ok(routes.includes(expected),expected);
 assert.equal(canPos('POST','/pos/inventory/items','OPERATOR'),false);
 assert.equal(canPos('GET','/pos/inventory/report','KITCHEN'),false);
 assert.equal(canPos('PUT','/pos/inventory/menu/5/recipe','ADMIN'),true);
 assert.equal(canPos('GET','/pos/menu-stock','OPERATOR'),true);
 assert.equal(canPos('GET','/pos/inventory/items','ADMIN'),true);
});
test('inventory migration has scoped keys, movement audit and no factory table edits',()=>{
 const sql=read('sql/bbq-inventory.sql');for(const x of ['bbq_inventory_items','bbq_menu_recipes','bbq_inventory_movements','bbq_inventory_order_usage','ORDER_CONSUMPTION','CANCEL_RESTORE'])assert.ok(sql.includes(x));
 assert.ok(sql.includes('UNIQUE(organization_id,id)'));assert.ok(!/DROP TABLE|TRUNCATE/i.test(sql));
 assert.ok(!sql.includes('raw_material_movements'));
});
test('paid POS checkout atomically consumes and failed stock never writes movements',()=>{
 const ops=read('operations.js');assert.ok(ops.includes("await require('./bbq-inventory').consume(client,id,order.id,lines,req.user.id)"));
 assert.ok(ops.includes("await client.query('COMMIT')"));assert.ok(ops.includes("await client.query('ROLLBACK')"));
 assert.ok(ops.includes("FOR SHARE"));assert.ok(ops.includes('handleCancellation'));
});
test('aggregate recipe consumption across multiple dishes using same ingredient',async()=>{
 const events=[];
 const db={query:async(sql,args=[])=>{events.push({sql,args});if(sql.startsWith('SELECT r.menu_item_id'))return {rows:[{menu_item_id:11,inventory_item_id:3,qty_per_dish:'250.000',name:'Bhaji base',active:true},{menu_item_id:12,inventory_item_id:3,qty_per_dish:'50.000',name:'Bhaji base',active:true}]};if(sql.startsWith('SELECT id,name,quantity_on_hand'))return {rowCount:1,rows:[{id:3,name:'Bhaji base',quantity_on_hand:'700.000'}]};if(sql.startsWith('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand-$1'))return {rowCount:1,rows:[{id:3}]};return {rowCount:1,rows:[]}}};
 await inventory.consume(db,2,33,[{menu:{id:11},qty:2},{menu:{id:12},qty:1}],7);
 const used=events.filter(x=>x.sql.includes('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand-$1'));
 assert.equal(used.length,1);assert.equal(used[0].args[0],550);
 assert.equal(events.filter(x=>x.sql.includes('ORDER_CONSUMPTION')).length,1);
});
test('checkout fails closed when dish recipe is absent',async()=>{
 const statements=[];
 const db={query:async(sql)=>{statements.push(sql);return {rows:[],rowCount:0}}};
 await assert.rejects(()=>inventory.consume(db,2,33,[{menu:{id:7},qty:1}],7),/missing its approved ingredient recipe/);
 assert.equal(statements.filter(s=>s.startsWith('UPDATE')).length,0);
});
test('checkout rejects low stock even when paid order request reached server',async()=>{
 const statements=[];
 const db={query:async(sql)=>{statements.push(sql);if(sql.startsWith('SELECT r.menu_item_id'))return {rows:[{menu_item_id:11,inventory_item_id:3,qty_per_dish:'250.000',name:'Bhaji base',active:true}]};return {rowCount:1,rows:[{id:3,name:'Bhaji base',quantity_on_hand:'100.000'}]}}};
 await assert.rejects(()=>inventory.consume(db,2,33,[{menu:{id:11},qty:1}],7),/Insufficient stock/);
 assert.ok(!statements.some(s=>s.startsWith('UPDATE bbq_inventory_items')));
});
test('preparation not begun restores, preparation begun marks waste (no double deduction)',async()=>{
 for(const before of ['NEW','PREPARING']){
  const events=[];const db={query:async(sql,args)=>{events.push({sql,args});if(sql.startsWith('SELECT inventory_item_id'))return {rows:[{inventory_item_id:4,quantity_used:'2.000',disposition:'CONSUMED'}]};return {rowCount:1,rows:[]}}};
  await inventory.handleCancellation(db,2,55,before,7);
  const restores=events.filter(e=>e.sql.startsWith('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand+$1'));
  assert.equal(restores.length,before==='NEW'?1:0);
  assert.equal(events.at(-1).args[0],before==='NEW'?'RESTORED':'WASTED');
 }
});
test('admin and cashier inventory scripts compile without exposing prices to kitchen',()=>{
 for(const f of ['public/js/bbq-inventory-admin.js','public/js/bbq-cashier.js'])assert.doesNotThrow(()=>new vm.Script(read(f)));
 const admin=read('public/bbq-admin.html'),cashier=read('public/bbq.html'),kitchen=read('public/bbq-kitchen.html');
 assert.ok(admin.includes('id="inventoryPane"')&&admin.includes('id="recipeRows"'));
 assert.ok(cashier.includes('id="stockNotice"'));assert.ok(!kitchen.includes('inventoryPane'));
});
