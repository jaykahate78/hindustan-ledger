'use strict';
module.exports=function linkSalesDispatch(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{console.error('Sales dispatch failed',e.message);res.status(e.status||500).json({error:e.status?e.message:'Sales dispatch failed'})});
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const org=async db=>{const r=await db.query("SELECT id FROM organizations WHERE name='Hindustan Pipes'");if(!r.rowCount)throw fail('Hindustan Pipes not configured',503);return r.rows[0].id};
 router.get('/pipes/sales-dispatch/availability',wrap(async(req,res)=>{const id=await org(pool);const r=await pool.query(`SELECT b.id AS bundle_id,b.bundle_code,b.pipe_quantity,p.id AS product_id,p.diameter_mm,p.end_type,z.name AS zone
 FROM warehouse_bundles b
 JOIN warehouse_lots w ON w.id=b.lot_id AND w.organization_id=b.organization_id
 JOIN production_batches pb ON pb.id=w.batch_id AND pb.organization_id=w.organization_id
 JOIN pipe_products p ON p.id=pb.product_id AND p.organization_id=pb.organization_id
 JOIN warehouse_zones z ON z.id=w.zone_id AND z.organization_id=w.organization_id
 LEFT JOIN warehouse_bundle_dispatches d ON d.bundle_id=b.id AND d.organization_id=b.organization_id
 WHERE b.organization_id=$1 AND d.id IS NULL ORDER BY b.id DESC LIMIT 250`,[id]);res.json(r.rows)}));
 router.get('/pipes/sales-dispatch/status',wrap(async(req,res)=>{const id=await org(pool);const r=await pool.query(`SELECT o.id AS sales_order_id,o.order_number,o.customer_name,o.status,l.id AS line_id,l.product_id,p.diameter_mm,p.end_type,l.quantity AS ordered_quantity,l.unit_rate,
 COALESCE(SUM(a.quantity) FILTER(WHERE ret.id IS NULL OR ret.status<>'ACCEPTED'),0)::int AS delivered_quantity,
 GREATEST(l.quantity-COALESCE(SUM(a.quantity) FILTER(WHERE ret.id IS NULL OR ret.status<>'ACCEPTED'),0),0)::int AS remaining_quantity
 FROM pipe_sales_orders o JOIN pipe_sales_order_lines l ON l.sales_order_id=o.id AND l.organization_id=o.organization_id
 JOIN pipe_products p ON p.id=l.product_id AND p.organization_id=l.organization_id
 LEFT JOIN pipe_sales_dispatch_links a ON a.sales_order_line_id=l.id AND a.organization_id=l.organization_id
 LEFT JOIN warehouse_bundle_returns ret ON ret.dispatch_id=a.dispatch_id AND ret.organization_id=a.organization_id
 WHERE o.organization_id=$1 GROUP BY o.id,l.id,p.id ORDER BY o.id DESC,l.id LIMIT 200`,[id]);res.json(r.rows)}));
 router.post('/pipes/sales-dispatch',wrap(async(req,res)=>{
 const orderId=Number(req.body.sales_order_id),ids=req.body.bundle_ids,vehicle=String(req.body.vehicle_number||'').trim(),reference=String(req.body.delivery_reference||'').trim(),notes=String(req.body.notes||'').trim();
 if(!Number.isSafeInteger(orderId)||orderId<=0||!Array.isArray(ids)||ids.length<1||ids.length>50||!ids.every(n=>Number.isSafeInteger(n)&&n>0)||new Set(ids).size!==ids.length)throw fail('Choose an order and 1–50 unique bundles');
 if(vehicle.length>40||reference.length>100||notes.length>500)throw fail('Dispatch fields too long');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');const id=await org(db);
  const ord=await db.query("SELECT id,customer_name FROM pipe_sales_orders WHERE id=$1 AND organization_id=$2 AND status='OPEN' FOR UPDATE",[orderId,id]);
  if(!ord.rowCount)throw fail('Open sales order not found',404);
  const lines=await db.query('SELECT id,product_id,quantity FROM pipe_sales_order_lines WHERE organization_id=$1 AND sales_order_id=$2 ORDER BY id',[id,orderId]);
  if(!lines.rowCount)throw fail('Sales order has no products');
  const b=await db.query(`SELECT wb.id,wb.bundle_code,wb.pipe_quantity,p.id AS product_id
   FROM warehouse_bundles wb JOIN warehouse_lots wl ON wl.id=wb.lot_id AND wl.organization_id=wb.organization_id
   JOIN production_batches pb ON pb.id=wl.batch_id AND pb.organization_id=wl.organization_id
   JOIN pipe_products p ON p.id=pb.product_id AND p.organization_id=pb.organization_id
   WHERE wb.organization_id=$1 AND wb.id=ANY($2::bigint[]) ORDER BY wb.id FOR UPDATE OF wb`,[id,ids]);
  if(b.rowCount!==ids.length)throw fail('Unknown or wrong-business bundle',404);
  const used=await db.query('SELECT bundle_id FROM warehouse_bundle_dispatches WHERE bundle_id=ANY($1::bigint[])',[ids]);if(used.rowCount)throw fail('Bundle already dispatched',409);
  const prior=await db.query(`SELECT a.sales_order_line_id,COALESCE(SUM(a.quantity) FILTER(WHERE ret.id IS NULL OR ret.status<>'ACCEPTED'),0)::int AS sent
   FROM pipe_sales_dispatch_links a LEFT JOIN warehouse_bundle_returns ret ON ret.dispatch_id=a.dispatch_id AND ret.organization_id=a.organization_id
   WHERE a.organization_id=$1 AND a.sales_order_id=$2 GROUP BY a.sales_order_line_id`,[id,orderId]);
  const sent=new Map(prior.rows.map(x=>[Number(x.sales_order_line_id),Number(x.sent)]));
  const demand=new Map(lines.rows.map(l=>[Number(l.product_id),{id:l.id,limit:Number(l.quantity),sent:sent.get(Number(l.id))||0}]));
  for(const bundle of b.rows){const line=demand.get(Number(bundle.product_id));if(!line)throw fail('Selected pipe type is not present in sales order');line.sent+=Number(bundle.pipe_quantity);if(line.sent>line.limit)throw fail('Bundles exceed remaining sales order quantity',409)}
  const code='DSP-SO-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
  for(const bundle of b.rows){const line=demand.get(Number(bundle.product_id));const dispatched=await db.query('INSERT INTO warehouse_bundle_dispatches(organization_id,bundle_id,dispatch_code,recipient,vehicle_number,delivery_reference,notes,dispatched_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[id,bundle.id,code+'-'+bundle.id,ord.rows[0].customer_name,vehicle||null,reference||null,notes||null,req.user?.id||null]);await db.query('INSERT INTO pipe_sales_dispatch_links(organization_id,sales_order_id,sales_order_line_id,dispatch_id,bundle_id,quantity) VALUES($1,$2,$3,$4,$5,$6)',[id,orderId,line.id,dispatched.rows[0].id,bundle.id,bundle.pipe_quantity])}
  await db.query('COMMIT');res.status(201).json({dispatch_reference:code,sales_order_id:orderId,bundles:b.rowCount,pipes:b.rows.reduce((sum,x)=>sum+Number(x.pipe_quantity),0)});
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
 }));
};