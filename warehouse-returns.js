'use strict';
module.exports=function attachReturns(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(err=>{console.error('Return operation failed',err.message);res.status(err.status||500).json({error:err.status?err.message:'Return operation failed'})});
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const org=async db=>{const r=await db.query("SELECT id FROM organizations WHERE name='Hindustan Pipes'");if(!r.rowCount)throw fail('Business missing',503);return r.rows[0].id};
 router.get('/pipes/returns',wrap(async(req,res)=>{const id=await org(pool);const r=await pool.query(`SELECT r.id,r.return_code,r.status,r.reason,r.inspection_note,r.received_at,r.inspected_at,
 d.dispatch_code,d.recipient,b.bundle_code,b.pipe_quantity,p.diameter_mm,p.end_type,
 rb.bundle_code AS restocked_bundle
 FROM warehouse_bundle_returns r
 JOIN warehouse_bundle_dispatches d ON d.id=r.dispatch_id AND d.organization_id=r.organization_id
 JOIN warehouse_bundles b ON b.id=d.bundle_id AND b.organization_id=r.organization_id
 JOIN warehouse_lots l ON l.id=b.lot_id
 JOIN production_batches pb ON pb.id=l.batch_id
 JOIN pipe_products p ON p.id=pb.product_id
 LEFT JOIN warehouse_bundles rb ON rb.id=r.restock_bundle_id
 WHERE r.organization_id=$1 ORDER BY r.id DESC LIMIT 200`,[id]);res.json(r.rows)}));
 router.get('/pipes/returns/eligible',wrap(async(req,res)=>{const id=await org(pool);const r=await pool.query(`SELECT d.id AS dispatch_id,d.dispatch_code,d.recipient,b.bundle_code,b.pipe_quantity,p.diameter_mm,p.end_type FROM warehouse_bundle_dispatches d JOIN warehouse_bundles b ON b.id=d.bundle_id JOIN warehouse_lots l ON l.id=b.lot_id JOIN production_batches pb ON pb.id=l.batch_id JOIN pipe_products p ON p.id=pb.product_id LEFT JOIN warehouse_bundle_returns r ON r.dispatch_id=d.id WHERE d.organization_id=$1 AND r.id IS NULL ORDER BY d.id DESC LIMIT 200`,[id]);res.json(r.rows)}));
 router.post('/pipes/returns',wrap(async(req,res)=>{const dispatchId=Number(req.body.dispatch_id),reason=String(req.body.reason||'').trim();if(!Number.isSafeInteger(dispatchId)||dispatchId<1)throw fail('Valid dispatched bundle required');if(reason.length<3||reason.length>500)throw fail('Return reason must be 3-500 characters');const db=await pool.connect();try{await db.query('BEGIN');const id=await org(db);const d=await db.query('SELECT id FROM warehouse_bundle_dispatches WHERE id=$1 AND organization_id=$2 FOR UPDATE',[dispatchId,id]);if(!d.rowCount)throw fail('Dispatch not found',404);const existing=await db.query('SELECT id FROM warehouse_bundle_returns WHERE dispatch_id=$1',[dispatchId]);if(existing.rowCount)throw fail('A return already exists for this dispatched bundle',409);const code='RET-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();const result=await db.query('INSERT INTO warehouse_bundle_returns(organization_id,dispatch_id,return_code,reason,received_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,dispatchId,code,reason,req.user?.id||null]);await db.query('COMMIT');res.status(201).json(result.rows[0])}catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}}));
 router.post('/pipes/returns/:id/inspect',wrap(async(req,res)=>{if(!req.user?.is_owner)return res.status(403).json({error:'Owner approval is required for return inspection'});const status=String(req.body.status||'').toUpperCase(),note=String(req.body.inspection_note||'').trim();if(!['ACCEPTED','REJECTED'].includes(status)||note.length<3||note.length>500)throw fail('Choose accepted/rejected and provide inspection notes (3-500 chars)');const db=await pool.connect();try{await db.query('BEGIN');const id=await org(db);
 const q=await db.query(`SELECT r.*,d.bundle_id,b.lot_id,b.pipe_quantity FROM warehouse_bundle_returns r JOIN warehouse_bundle_dispatches d ON d.id=r.dispatch_id JOIN warehouse_bundles b ON b.id=d.bundle_id WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r`,[req.params.id,id]);const row=q.rows[0];if(!row)throw fail('Return not found',404);if(row.status!=='PENDING')throw fail('Return is already inspected',409);
 let restockId=null;
 if(status==='ACCEPTED'){
 const lot=await db.query('SELECT id,lot_code FROM warehouse_lots WHERE id=$1 AND organization_id=$2 FOR UPDATE',[row.lot_id,id]);if(!lot.rowCount)throw fail('Warehouse lot not found',404);
 const index=await db.query('SELECT COALESCE(MAX(bundle_index),0)::int+1 AS next FROM warehouse_bundles WHERE lot_id=$1',[row.lot_id]);
 const nextIndex=index.rows[0].next;
 const code=lot.rows[0].lot_code+'-R'+String(nextIndex).padStart(3,'0');
 const inserted=await db.query('INSERT INTO warehouse_bundles(organization_id,lot_id,bundle_code,bundle_index,pipe_quantity,is_partial) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[id,row.lot_id,code,nextIndex,row.pipe_quantity,true]);
 restockId=inserted.rows[0].id;
 }
 await db.query('UPDATE warehouse_bundle_returns SET status=$1,inspection_note=$2,inspected_by=$3,inspected_at=now(),restock_bundle_id=$4 WHERE id=$5',[status,note,req.user.id,restockId,row.id]);await db.query('COMMIT');res.json({return_id:row.id,status,restocked:restockId!==null});
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}}));
};