'use strict';
module.exports=function finance(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(e=>{console.error('Finance action error',e.message);res.status(e.status||500).json({error:e.status?e.message:'Finance operation failed'})});
 const fail=(message,status=400)=>Object.assign(new Error(message),{status});
 const org=async db=>(await db.query("SELECT id FROM organizations WHERE name='Hindustan Pipes'")).rows[0]?.id;
 router.get('/pipes/finance/report',wrap(async(req,res)=>{
 const id=await org(pool);if(!id)throw fail('Missing business',503);
 const [purchases,expenses,payables]=await Promise.all([
 pool.query("SELECT s.name AS supplier,COALESCE(SUM(l.received_quantity*l.unit_rate),0)::numeric(14,2) AS received_value,COALESCE(SUM(l.ordered_quantity*l.unit_rate),0)::numeric(14,2) AS order_value FROM pipe_suppliers s LEFT JOIN pipe_purchase_orders po ON po.supplier_id=s.id AND po.organization_id=s.organization_id LEFT JOIN pipe_purchase_order_lines l ON l.po_id=po.id AND l.organization_id=po.organization_id WHERE s.organization_id=$1 GROUP BY s.id ORDER BY s.name",[id]),
 pool.query("SELECT category,COALESCE(SUM(amount),0)::numeric(14,2) AS amount,COUNT(*)::int AS entries FROM pipe_factory_expenses WHERE organization_id=$1 GROUP BY category ORDER BY category",[id]),
 pool.query("SELECT id,account_code,name,account_type,sub_type FROM accounts WHERE organization_id=$1 ORDER BY name",[id])
 ]);
 res.json({supplier_purchase_summary:purchases.rows,expense_summary:expenses.rows,accounts:payables.rows,note:'Purchase receipt value is not an unpaid balance. Supplier payments are not reconciled yet.'});
 }));
 router.get('/pipes/finance/unposted',wrap(async(req,res)=>{
 const id=await org(pool);const [receipts,expenses]=await Promise.all([
 pool.query("SELECT r.id,'PURCHASE_RECEIPT' AS source_type,r.receipt_number AS reference,r.received_at AS entry_date,s.name AS party,m.name AS description,(r.quantity*l.unit_rate)::numeric(14,2) AS amount,fp.voucher_id FROM pipe_purchase_receipts r JOIN pipe_purchase_order_lines l ON l.id=r.po_line_id AND l.organization_id=r.organization_id JOIN pipe_purchase_orders po ON po.id=l.po_id AND po.organization_id=l.organization_id JOIN pipe_suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id JOIN raw_materials m ON m.id=l.raw_material_id AND m.organization_id=l.organization_id LEFT JOIN pipe_finance_postings fp ON fp.source_type='PURCHASE_RECEIPT' AND fp.source_id=r.id AND fp.organization_id=r.organization_id WHERE r.organization_id=$1 ORDER BY r.id DESC LIMIT 100",[id]),
 pool.query("SELECT e.id,'FACTORY_EXPENSE' AS source_type,e.reference,e.expense_date AS entry_date,NULL::text AS party,e.category AS description,e.amount,fp.voucher_id FROM pipe_factory_expenses e LEFT JOIN pipe_finance_postings fp ON fp.source_type='FACTORY_EXPENSE' AND fp.source_id=e.id AND fp.organization_id=e.organization_id WHERE e.organization_id=$1 ORDER BY e.id DESC LIMIT 100",[id])
 ]);res.json([...receipts.rows,...expenses.rows])}));
 router.post('/pipes/finance/post',wrap(async(req,res)=>{
 if(!req.user?.is_owner)throw fail('Owner approval required',403);
 const sourceType=String(req.body.source_type||''),sourceId=Number(req.body.source_id),debitId=Number(req.body.debit_account_id),creditId=Number(req.body.credit_account_id);
 if(!['PURCHASE_RECEIPT','FACTORY_EXPENSE'].includes(sourceType)||![sourceId,debitId,creditId].every(x=>Number.isSafeInteger(x)&&x>0)||debitId===creditId)throw fail('Valid source and two different accounts required');
 const db=await pool.connect();
 try{
 await db.query('BEGIN');const id=await org(db);
 const already=await db.query('SELECT id FROM pipe_finance_postings WHERE organization_id=$1 AND source_type=$2 AND source_id=$3',[id,sourceType,sourceId]);
 if(already.rowCount)throw fail('Source already posted',409);
 const ac=await db.query('SELECT id,account_type,sub_type FROM accounts WHERE organization_id=$1 AND id=ANY($2::bigint[]) FOR SHARE',[id,[debitId,creditId]]);
 if(ac.rowCount!==2)throw fail('Accounts must belong to Hindustan Pipes');
 const debit=ac.rows.find(x=>Number(x.id)===debitId),credit=ac.rows.find(x=>Number(x.id)===creditId);
 if(sourceType==='PURCHASE_RECEIPT'&&(debit.account_type!=='ASSET'||debit.sub_type!=='INVENTORY'||credit.account_type!=='LIABILITY'))throw fail('Purchase: debit inventory and credit a supplier liability account');
 if(sourceType==='FACTORY_EXPENSE'&&(debit.account_type!=='EXPENSE'||credit.account_type!=='ASSET'||!['CASH','BANK'].includes(credit.sub_type)))throw fail('Expense: debit an expense account and credit cash/bank');
 let source;
 if(sourceType==='PURCHASE_RECEIPT'){
 const q=await db.query('SELECT r.id,r.receipt_number,r.received_at,(r.quantity*l.unit_rate)::numeric(14,2) AS amount FROM pipe_purchase_receipts r JOIN pipe_purchase_order_lines l ON l.id=r.po_line_id AND l.organization_id=r.organization_id WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r',[sourceId,id]);source=q.rows[0];
 }else{
 const q=await db.query('SELECT id,reference,expense_date AS received_at,amount FROM pipe_factory_expenses WHERE id=$1 AND organization_id=$2 FOR UPDATE',[sourceId,id]);source=q.rows[0];
 }
 if(!source)throw fail('Source record not found',404);
 const amount=Number(source.amount);if(!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>.000001||amount<=0)throw fail('Invalid source value; review source before posting');
 const code='AUTO-'+sourceType+'-'+sourceId,day=new Date(source.received_at).toISOString().slice(0,10);
 const v=await db.query("INSERT INTO vouchers(organization_id,voucher_type,voucher_number,voucher_date,reference_number,narration,total_amount) VALUES($1,'JOURNAL',$2,$3,$4,$5,$6) RETURNING id",[id,code,day,String(source.receipt_number||source.reference||'').slice(0,120),'Owner-approved '+sourceType+' #'+sourceId,amount]);
 for(const [accountId,dr,cr] of [[debitId,amount,0],[creditId,0,amount]])await db.query('INSERT INTO journal_lines(organization_id,voucher_id,account_id,debit_amount,credit_amount,line_narration) VALUES($1,$2,$3,$4,$5,$6)',[id,v.rows[0].id,accountId,dr,cr,code]);
 await db.query('INSERT INTO pipe_finance_postings(organization_id,source_type,source_id,voucher_id,posted_by) VALUES($1,$2,$3,$4,$5)',[id,sourceType,sourceId,v.rows[0].id,req.user.id]);
 await db.query('COMMIT');res.status(201).json({voucher_id:v.rows[0].id,voucher_number:code,amount});
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release()}
 }));
};