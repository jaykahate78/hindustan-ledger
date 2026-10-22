'use strict';
module.exports=function attachDispatch(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(err=>{console.error('Dispatch failed',err.message);res.status(err.status||500).json({error:err.status?err.message:'Dispatch failed'})});
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const org=async db=>{const r=await db.query("SELECT id FROM organizations WHERE name='Hindustan Pipes'");if(!r.rowCount)throw fail('Business missing',503);return r.rows[0].id};
 router.get('/pipes/dispatch/availability',wrap(async(req,res)=>{
  const id=await org(pool);
  const q=await pool.query(`SELECT b.id AS bundle_id,b.bundle_code,b.pipe_quantity,b.is_partial,w.lot_code,z.name AS zone,p.diameter_mm,p.end_type,
  (d.id IS NOT NULL) AS dispatched FROM warehouse_bundles b
  JOIN warehouse_lots w ON w.id=b.lot_id AND w.organization_id=b.organization_id
  JOIN warehouse_zones z ON z.id=w.zone_id AND z.organization_id=w.organization_id
  JOIN production_batches pb ON pb.id=w.batch_id AND pb.organization_id=w.organization_id
  JOIN pipe_products p ON p.id=pb.product_id AND p.organization_id=pb.organization_id
  LEFT JOIN warehouse_bundle_dispatches d ON d.bundle_id=b.id AND d.organization_id=b.organization_id
  WHERE b.organization_id=$1 ORDER BY b.id DESC LIMIT 400`,[id]);res.json(q.rows);
 }));
 router.get('/pipes/dispatch/history',wrap(async(req,res)=>{
  const id=await org(pool);
  const q=await pool.query(`SELECT d.dispatch_code,d.recipient,d.vehicle_number,d.delivery_reference,d.notes,d.dispatched_at,
  b.bundle_code,b.pipe_quantity,p.diameter_mm,p.end_type,w.lot_code
  FROM warehouse_bundle_dispatches d JOIN warehouse_bundles b ON b.id=d.bundle_id
  JOIN warehouse_lots w ON w.id=b.lot_id
  JOIN production_batches pb ON pb.id=w.batch_id JOIN pipe_products p ON p.id=pb.product_id
  WHERE d.organization_id=$1 ORDER BY d.id DESC LIMIT 200`,[id]);res.json(q.rows);
 }));
 router.get('/pipes/dispatch/stock-summary',wrap(async(req,res)=>{
  const id=await org(pool);
  const r=await pool.query(`SELECT w.id AS lot_id,w.lot_code,p.diameter_mm,p.end_type,z.name AS zone,w.quantity AS received,
  COALESCE((SELECT SUM(b.pipe_quantity) FROM warehouse_bundles b JOIN warehouse_bundle_dispatches d ON d.bundle_id=b.id WHERE b.lot_id=w.id),0)::int AS dispatched,
  (w.quantity-COALESCE((SELECT SUM(b.pipe_quantity) FROM warehouse_bundles b JOIN warehouse_bundle_dispatches d ON d.bundle_id=b.id WHERE b.lot_id=w.id),0)+COALESCE((SELECT SUM(rb.pipe_quantity) FROM warehouse_bundle_returns r JOIN warehouse_bundles rb ON rb.id=r.restock_bundle_id WHERE rb.lot_id=w.id AND r.status='ACCEPTED'),0))::int AS available
  FROM warehouse_lots w JOIN warehouse_zones z ON z.id=w.zone_id JOIN production_batches pb ON pb.id=w.batch_id JOIN pipe_products p ON p.id=pb.product_id
  WHERE w.organization_id=$1 ORDER BY w.id DESC`,[id]);res.json(r.rows);
 }));
 router.post('/pipes/dispatch',wrap(async(req,res)=>{
  const ids=req.body.bundle_ids,recipient=String(req.body.recipient||'').trim();
  if(!Array.isArray(ids)||ids.length<1||ids.length>50||!ids.every(Number.isSafeInteger)||ids.some(x=>x<1)||new Set(ids).size!==ids.length)throw fail('Choose 1 to 50 unique bundles');
  if(recipient.length<2||recipient.length>120)throw fail('Recipient must be 2-120 characters');
  const vehicle=String(req.body.vehicle_number||'').trim(),reference=String(req.body.delivery_reference||'').trim(),notes=String(req.body.notes||'').trim();
  if(vehicle.length>40||reference.length>100||notes.length>500)throw fail('Dispatch details too long');
  const db=await pool.connect();
  try{
   await db.query('BEGIN');const organizationId=await org(db);
   // Serialize concurrent dispatches on the same org to prevent double-dispatch and partial writes.
   const bundles=await db.query(`SELECT b.id,b.bundle_code,b.pipe_quantity FROM warehouse_bundles b WHERE b.organization_id=$1 AND b.id=ANY($2::bigint[]) ORDER BY b.id FOR UPDATE`,[organizationId,ids]);
   if(bundles.rowCount!==ids.length)throw fail('One or more bundle IDs do not exist',404);
   const claimed=await db.query('SELECT bundle_id FROM warehouse_bundle_dispatches WHERE organization_id=$1 AND bundle_id=ANY($2::bigint[])',[organizationId,ids]);
   if(claimed.rowCount)throw fail('One or more bundles have already been dispatched',409);
   const dispatchCode='DSP-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
   for(const b of bundles.rows)await db.query('INSERT INTO warehouse_bundle_dispatches(organization_id,bundle_id,dispatch_code,recipient,vehicle_number,delivery_reference,notes,dispatched_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[organizationId,b.id,dispatchCode+'-'+b.id,recipient,vehicle||null,reference||null,notes||null,req.user?.id||null]);
   await db.query('COMMIT');res.status(201).json({dispatch_reference:dispatchCode,bundles:bundles.rowCount,pipes:bundles.rows.reduce((sum,b)=>sum+Number(b.pipe_quantity),0)});
  }catch(err){await db.query('ROLLBACK');throw err}finally{db.release()}
 }));
};
