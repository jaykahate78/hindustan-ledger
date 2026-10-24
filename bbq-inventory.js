'use strict';
// BBQ ingredient stock is a separate ledger from the Hindustan Pipes material ledger.
const fail=(status,message)=>Object.assign(new Error(message),{status});
const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(err=>{console.error('BBQ inventory operation',err.message);res.status(err.status||500).json({error:err.status?err.message:'Inventory operation failed'})});
const milli=value=>{
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(n*1000-Math.round(n*1000))>1e-6)throw fail(400,'Quantity must be nonnegative with at most 3 decimals');
 return Math.round(n*1000);
};
const units=['g','ml','piece'];
const dateCheck=v=>{const s=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s+'T00:00:00Z'))||new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw fail(400,'Use a valid YYYY-MM-DD date');return s};
const org=async db=>{const r=await db.query("SELECT id FROM organizations WHERE name='BBQ Pav Bhaji Chain'");if(!r.rowCount)throw fail(503,'BBQ business not configured');return r.rows[0].id};
async function consume(client,orgId,orderId,lines,userId){
 const uniqueIds=[...new Set(lines.map(l=>Number(l.menu.id)))];
 const r=await client.query('SELECT r.menu_item_id,r.inventory_item_id,r.qty_per_dish,i.name,i.active FROM bbq_menu_recipes r JOIN bbq_inventory_items i ON i.id=r.inventory_item_id AND i.organization_id=r.organization_id WHERE r.organization_id=$1 AND r.menu_item_id=ANY($2::bigint[]) ORDER BY r.inventory_item_id,r.menu_item_id',[orgId,uniqueIds]);
 const found=new Set(r.rows.map(row=>Number(row.menu_item_id)));
 if(uniqueIds.some(id=>!found.has(id)))throw fail(409,'A dish is missing its approved ingredient recipe. Ask admin to configure inventory.');
 const needed=new Map();
 for(const row of r.rows){
  if(!row.active)throw fail(409,'Ingredient '+row.name+' is inactive');
  const quantity=lines.filter(l=>Number(l.menu.id)===Number(row.menu_item_id)).reduce((s,l)=>s+l.qty,0);
  const required=milli(row.qty_per_dish)*quantity;
  if(!Number.isSafeInteger(required)||required<=0)throw fail(400,'Invalid recipe consumption quantity');
  const key=Number(row.inventory_item_id);needed.set(key,(needed.get(key)||0)+required);
 }
 const ids=[...needed.keys()].sort((a,b)=>a-b);
 const stock=await client.query('SELECT id,name,quantity_on_hand FROM bbq_inventory_items WHERE organization_id=$1 AND id=ANY($2::bigint[]) ORDER BY id FOR UPDATE',[orgId,ids]);
 if(stock.rowCount!==ids.length)throw fail(409,'Recipe references missing inventory');
 for(const row of stock.rows){const need=needed.get(Number(row.id));if(milli(row.quantity_on_hand)<need)throw fail(409,'Insufficient stock: '+row.name+'. Replenish before billing.')}
 for(const itemId of ids){
  const qty=needed.get(itemId)/1000;
  const changed=await client.query('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand-$1 WHERE organization_id=$2 AND id=$3 AND quantity_on_hand >= $1 RETURNING id',[qty,orgId,itemId]);
  if(!changed.rowCount)throw fail(409,'Insufficient stock; refresh menu');
  await client.query('INSERT INTO bbq_inventory_order_usage(organization_id,order_id,inventory_item_id,quantity_used) VALUES($1,$2,$3,$4)',[orgId,orderId,itemId,qty]);
  await client.query("INSERT INTO bbq_inventory_movements(organization_id,inventory_item_id,order_id,quantity_delta,reason,reference,recorded_by) VALUES($1,$2,$3,$4,'ORDER_CONSUMPTION',$5,$6)",[orgId,itemId,orderId,-qty,'POS order '+orderId,userId]);
 }
}
async function handleCancellation(client,orgId,orderId,fromStatus,userId){
 if(!['NEW','PREPARING'].includes(fromStatus))return;
 const usages=await client.query('SELECT inventory_item_id,quantity_used,disposition FROM bbq_inventory_order_usage WHERE organization_id=$1 AND order_id=$2 ORDER BY inventory_item_id FOR UPDATE',[orgId,orderId]);
 for(const u of usages.rows){
  if(u.disposition!=='CONSUMED')continue;
  if(fromStatus==='NEW'){
   await client.query('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand+$1 WHERE organization_id=$2 AND id=$3',[u.quantity_used,orgId,u.inventory_item_id]);
   await client.query("INSERT INTO bbq_inventory_movements(organization_id,inventory_item_id,order_id,quantity_delta,reason,reference,recorded_by) VALUES($1,$2,$3,$4,'CANCEL_RESTORE',$5,$6)",[orgId,u.inventory_item_id,orderId,u.quantity_used,'Cancelled before preparation',userId]);
  }
  await client.query('UPDATE bbq_inventory_order_usage SET disposition=$1 WHERE organization_id=$2 AND order_id=$3 AND inventory_item_id=$4',[fromStatus==='NEW'?'RESTORED':'WASTED',orgId,orderId,u.inventory_item_id]);
 }
}
module.exports=function attachBbqInventory(router,pool){
 router.get('/pos/inventory/items',wrap(async(req,res)=>{const id=await org(pool);res.json((await pool.query('SELECT id,code,name,unit,quantity_on_hand,reorder_level,active FROM bbq_inventory_items WHERE organization_id=$1 ORDER BY name',[id])).rows)}));
 router.post('/pos/inventory/items',wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim(),code=String(req.body.code||'').trim().toUpperCase(),unit=String(req.body.unit||''),level=milli(req.body.reorder_level||0);
  if(name.length<2||name.length>120||!/^[-A-Z0-9_]{2,30}$/.test(code)||!units.includes(unit))throw fail(400,'Enter valid ingredient name, code and unit (g/ml/piece)');
  const id=await org(pool);
  try{const r=await pool.query('INSERT INTO bbq_inventory_items(organization_id,code,name,unit,reorder_level) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,code,name,unit,level/1000]);res.status(201).json(r.rows[0])}catch(e){if(e.code==='23505')throw fail(409,'Ingredient code already exists');throw e}
 }));
 router.get('/pos/inventory/recipes',wrap(async(req,res)=>{const id=await org(pool);res.json((await pool.query('SELECT r.menu_item_id,r.inventory_item_id,r.qty_per_dish,i.name AS ingredient,i.unit,m.name AS dish FROM bbq_menu_recipes r JOIN bbq_inventory_items i ON i.id=r.inventory_item_id AND i.organization_id=r.organization_id JOIN pos_menu_items m ON m.id=r.menu_item_id AND m.organization_id=r.organization_id WHERE r.organization_id=$1 ORDER BY m.name,i.name',[id])).rows)}));
 router.put('/pos/inventory/menu/:id/recipe',wrap(async(req,res)=>{
  const menuId=Number(req.params.id),items=req.body.items;
  if(!Number.isSafeInteger(menuId)||menuId<1||!Array.isArray(items)||items.length<1||items.length>30)throw fail(400,'Recipe requires 1–30 ingredients');
  const clean=[],seen=new Set();for(const x of items){const id=Number(x.inventory_item_id),qty=milli(x.qty_per_dish);if(!Number.isSafeInteger(id)||id<=0||qty<=0||seen.has(id))throw fail(400,'Invalid, duplicate or zero recipe ingredient');seen.add(id);clean.push({id,qty:qty/1000})}
  const client=await pool.connect();try{
   await client.query('BEGIN');const id=await org(client);
   const menu=await client.query('SELECT id FROM pos_menu_items WHERE id=$1 AND organization_id=$2 FOR UPDATE',[menuId,id]);if(!menu.rowCount)throw fail(404,'Menu item not found');
   const inv=await client.query('SELECT id FROM bbq_inventory_items WHERE organization_id=$1 AND id=ANY($2::bigint[]) AND active',[id,clean.map(x=>x.id)]);
   if(inv.rowCount!==clean.length)throw fail(409,'Recipe has unknown or inactive ingredient');
   await client.query('DELETE FROM bbq_menu_recipes WHERE organization_id=$1 AND menu_item_id=$2',[id,menuId]);
   for(const item of clean)await client.query('INSERT INTO bbq_menu_recipes(organization_id,menu_item_id,inventory_item_id,qty_per_dish) VALUES($1,$2,$3,$4)',[id,menuId,item.id,item.qty]);
   await client.query('COMMIT');res.json({menu_item_id:menuId,ingredients:clean.length});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }));
 router.post('/pos/inventory/items/:id/stock',wrap(async(req,res)=>{
  const itemId=Number(req.params.id),type=String(req.body.type||''),raw=milli(req.body.quantity),ref=String(req.body.reference||'').trim();
  if(!Number.isSafeInteger(itemId)||itemId<1||!['OPENING','PURCHASE','ADJUSTMENT','WASTE'].includes(type)||raw<=0||ref.length>120)throw fail(400,'Valid stock movement requires positive quantity');
  const direction=type==='WASTE'?-1:type==='ADJUSTMENT'?(req.body.direction==='OUT'?-1:req.body.direction==='IN'?1:0):1;
  if(!direction)throw fail(400,'Adjustment requires IN or OUT');
  const delta=direction*raw/1000;const db=await pool.connect();try{
   await db.query('BEGIN');const id=await org(db);const changed=await db.query('UPDATE bbq_inventory_items SET quantity_on_hand=quantity_on_hand+$1 WHERE organization_id=$2 AND id=$3 AND active AND quantity_on_hand+$1>=0 RETURNING *',[delta,id,itemId]);
   if(!changed.rowCount)throw fail(409,'Ingredient unavailable or insufficient stock');
   await db.query('INSERT INTO bbq_inventory_movements(organization_id,inventory_item_id,quantity_delta,reason,reference,recorded_by) VALUES($1,$2,$3,$4,$5,$6)',[id,itemId,delta,type,ref||'Admin stock record',req.user.id]);
   await db.query('COMMIT');res.status(201).json(changed.rows[0]);
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
 }));
 router.post('/pos/inventory/items/:id/count',wrap(async(req,res)=>{
  const itemId=Number(req.params.id),physical=milli(req.body.counted_quantity),note=String(req.body.reference||'Physical stock count').trim();
  if(!Number.isSafeInteger(itemId)||itemId<1||note.length>120)throw fail(400,'Invalid physical count');
  const db=await pool.connect();try{
   await db.query('BEGIN');const id=await org(db);const found=await db.query('SELECT id,quantity_on_hand FROM bbq_inventory_items WHERE organization_id=$1 AND id=$2 AND active FOR UPDATE',[id,itemId]);if(!found.rowCount)throw fail(404,'Ingredient not found');
   const delta=physical-milli(found.rows[0].quantity_on_hand);
   if(delta){await db.query('UPDATE bbq_inventory_items SET quantity_on_hand=$1 WHERE organization_id=$2 AND id=$3',[physical/1000,id,itemId]);await db.query('INSERT INTO bbq_inventory_movements(organization_id,inventory_item_id,quantity_delta,reason,reference,recorded_by) VALUES($1,$2,$3,$4,$5,$6)',[id,itemId,delta/1000,'COUNT_ADJUSTMENT',note,req.user.id])}
   await db.query('COMMIT');res.json({inventory_item_id:itemId,quantity_on_hand:physical/1000,difference:delta/1000});
  }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
 }));
 router.get('/pos/menu-stock',wrap(async(req,res)=>{
  const id=await org(pool);const [menu,recipe]=await Promise.all([
   pool.query('SELECT id,available FROM pos_menu_items WHERE organization_id=$1 ORDER BY id',[id]),
   pool.query('SELECT r.menu_item_id,r.qty_per_dish,i.quantity_on_hand,i.reorder_level,i.active FROM bbq_menu_recipes r JOIN bbq_inventory_items i ON i.id=r.inventory_item_id AND i.organization_id=r.organization_id WHERE r.organization_id=$1 ORDER BY r.menu_item_id',[id])
  ]);
  const grouped=new Map();for(const r of recipe.rows){const key=Number(r.menu_item_id);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r)}
  res.json(menu.rows.map(m=>{const used=grouped.get(Number(m.id))||[];const max=used.length?Math.min(...used.map(x=>x.active?Math.floor(milli(x.quantity_on_hand)/milli(x.qty_per_dish)):0)):0;return {menu_item_id:m.id,can_make:!!m.available&&max>=1,max_portions:Math.max(0,Math.min(max,10000)),low_stock:used.length>0&&used.some(x=>milli(x.quantity_on_hand)-milli(x.qty_per_dish)<=milli(x.reorder_level)),reason:!m.available?'Menu unavailable':!used.length?'Recipe not configured':max<1?'Out of stock':null}}));
 }));
 router.get('/pos/inventory/report',wrap(async(req,res)=>{
  const id=await org(pool);
  const day=req.query.date?dateCheck(req.query.date):(await pool.query("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).rows[0].day;
  const report=await pool.query("SELECT i.id,i.name,i.code,i.unit,i.quantity_on_hand,i.reorder_level,COALESCE(SUM(m.quantity_delta) FILTER(WHERE (m.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $2::date),0) AS since_open,COALESCE(SUM(m.quantity_delta) FILTER(WHERE (m.created_at AT TIME ZONE 'Asia/Kolkata')::date > $2::date),0) AS after_close,COALESCE(SUM(-m.quantity_delta) FILTER(WHERE m.reason='ORDER_CONSUMPTION' AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date=$2::date),0) AS consumed,COALESCE(SUM(m.quantity_delta) FILTER(WHERE m.reason='CANCEL_RESTORE' AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date=$2::date),0) AS restored,COALESCE(SUM(-m.quantity_delta) FILTER(WHERE m.reason='WASTE' AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date=$2::date),0) AS wastage,COALESCE(SUM(m.quantity_delta) FILTER(WHERE m.reason IN ('OPENING','PURCHASE') AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date=$2::date),0) AS stock_in FROM bbq_inventory_items i LEFT JOIN bbq_inventory_movements m ON m.inventory_item_id=i.id AND m.organization_id=i.organization_id WHERE i.organization_id=$1 GROUP BY i.id ORDER BY i.name",[id,day]);
  const movements=await pool.query("SELECT m.id,m.created_at,m.reason,m.quantity_delta,m.reference,i.name,i.unit FROM bbq_inventory_movements m JOIN bbq_inventory_items i ON i.id=m.inventory_item_id AND i.organization_id=m.organization_id WHERE m.organization_id=$1 AND (m.created_at AT TIME ZONE 'Asia/Kolkata')::date=$2::date ORDER BY m.id DESC LIMIT 150",[id,day]);
  res.json({date:day,timezone:'Asia/Kolkata',items:report.rows.map(i=>({...i,opening_quantity:(Number(i.quantity_on_hand)-Number(i.since_open)).toFixed(3),closing_quantity:(Number(i.quantity_on_hand)-Number(i.after_close)).toFixed(3),low_stock:Number(i.quantity_on_hand)<=Number(i.reorder_level)})),movements:movements.rows,note:'Stock balance reflects posted movements; physical count may differ until reconciled. Consumption is posted at paid checkout.'});
 }));
};
module.exports.consume=consume;
module.exports.handleCancellation=handleCancellation;
module.exports.milli=milli;
