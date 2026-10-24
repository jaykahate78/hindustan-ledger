'use strict';

// Read-only draft receivables. Age is measured from draft creation, not legal due date.
module.exports=function attachReceivables(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(err=>{
  console.error('Receivables report failed',err.message);
  res.status(500).json({error:'Unable to load receivables'});
 });
 const org=async()=>{const r=await pool.query("SELECT id FROM organizations WHERE name=$1",['Hindustan Pipes']);return r.rows[0]?.id};
 const balances=`WITH paid AS (
   SELECT organization_id,invoice_id,SUM(amount) AS amount
   FROM pipe_customer_payments WHERE organization_id=$1 GROUP BY organization_id,invoice_id
 ), balances AS (
   SELECT i.id,i.invoice_number,i.customer_name,i.created_at,i.subtotal,
          COALESCE(p.amount,0) AS received,i.subtotal-COALESCE(p.amount,0) AS due
   FROM pipe_customer_invoices i
   LEFT JOIN paid p ON p.organization_id=i.organization_id AND p.invoice_id=i.id
   WHERE i.organization_id=$1 AND i.status='DRAFT'
 )`;
 router.get('/pipes/billing/receivables',wrap(async(req,res)=>{
  const id=await org();if(!id)return res.status(503).json({error:'Business not configured'});
  const query=balances+` SELECT customer_name,COUNT(*)::int AS invoice_count,
   SUM(subtotal)::numeric(16,2) AS invoiced,SUM(received)::numeric(16,2) AS received,
   SUM(due)::numeric(16,2) AS outstanding,
   COALESCE(SUM(due) FILTER(WHERE created_at>=now()-interval '30 days'),0)::numeric(16,2) AS age_0_30,
   COALESCE(SUM(due) FILTER(WHERE created_at<now()-interval '30 days' AND created_at>=now()-interval '60 days'),0)::numeric(16,2) AS age_31_60,
   COALESCE(SUM(due) FILTER(WHERE created_at<now()-interval '60 days' AND created_at>=now()-interval '90 days'),0)::numeric(16,2) AS age_61_90,
   COALESCE(SUM(due) FILTER(WHERE created_at<now()-interval '90 days'),0)::numeric(16,2) AS age_90_plus
   FROM balances GROUP BY customer_name HAVING SUM(due)>0
   ORDER BY SUM(due) DESC,customer_name`;
  const result=await pool.query(query,[id]);
  res.json({customers:result.rows,as_of:new Date().toISOString(),basis:'Draft invoice age, not payment due date. Unreconciled operational report.'});
 }));
 router.get('/pipes/billing/receivables/invoices',wrap(async(req,res)=>{
  const id=await org();if(!id)return res.status(503).json({error:'Business not configured'});
  const customer=String(req.query.customer||'');
  if(!customer||customer.length>200)return res.status(400).json({error:'Valid customer name required'});
  const query=balances+` SELECT invoice_number,created_at,subtotal::numeric(16,2),
   received::numeric(16,2),due::numeric(16,2)
   FROM balances WHERE customer_name=$2 AND due>0 ORDER BY created_at,id LIMIT 250`;
  const result=await pool.query(query,[id,customer]);
  res.json({invoices:result.rows,limit:250});
 }));
};
