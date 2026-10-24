'use strict';
// Read-only restaurant operations dashboard. Aggregations are specific to BBQ, in IST.
module.exports=function attachBbqAdmin(router,pool){
 const wrap=fn=>(req,res)=>Promise.resolve(fn(req,res)).catch(err=>{
  console.error('BBQ daily report error',err.message);
  res.status(500).json({error:'Unable to load daily report'});
 });
 router.get('/pos/admin/daily-report',wrap(async(req,res)=>{
  const raw=String(req.query.date||'');
  if(raw&&!/^\d{4}-\d{2}-\d{2}$/.test(raw))return res.status(400).json({error:'Use YYYY-MM-DD date'});
  const org=await pool.query("SELECT id FROM organizations WHERE name='BBQ Pav Bhaji Chain'");
  if(!org.rowCount)return res.status(503).json({error:'BBQ business unavailable'});
  const orgId=org.rows[0].id,params=[orgId,raw||null];
  const dayExpr="COALESCE(o.completed_at,o.updated_at) AT TIME ZONE 'Asia/Kolkata'";
  const [daily,orders,history]=await Promise.all([
   pool.query(`SELECT COUNT(*)::int AS completed_orders,
    COALESCE(SUM(o.total_amount),0)::numeric(14,2) AS recorded_sales,
    COALESCE(SUM(o.total_amount) FILTER(WHERE o.payment_method='CASH'),0)::numeric(14,2) AS cash_sales,
    COALESCE(SUM(o.total_amount) FILTER(WHERE o.payment_method='UPI'),0)::numeric(14,2) AS upi_sales,
    COALESCE(SUM(o.total_amount) FILTER(WHERE o.payment_method='CARD'),0)::numeric(14,2) AS card_sales,
    COUNT(DISTINCT o.cashier_user_id)::int AS cashiers
    FROM pos_orders o WHERE o.organization_id=$1 AND o.status='COMPLETED'
    AND (${dayExpr})::date=COALESCE($2::date,(now() AT TIME ZONE 'Asia/Kolkata')::date)`,params),
   pool.query(`SELECT o.id,o.order_no,o.channel,o.table_label,o.status,o.total_amount,o.payment_method,
    o.payment_reference,o.created_at,COALESCE(o.completed_at,o.updated_at) AS completed_at,
    COALESCE(u.username,'Legacy / unknown') AS cashier,
    COALESCE(json_agg(json_build_object('name',i.name_snapshot,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)
      ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::json) AS items
    FROM pos_orders o LEFT JOIN app_users u ON u.id=o.cashier_user_id
    LEFT JOIN pos_order_items i ON i.order_id=o.id AND i.organization_id=o.organization_id
    WHERE o.organization_id=$1 AND o.status='COMPLETED'
    AND (${dayExpr})::date=COALESCE($2::date,(now() AT TIME ZONE 'Asia/Kolkata')::date)
    GROUP BY o.id,u.username ORDER BY completed_at DESC,o.id DESC LIMIT 500`,params),
   pool.query(`SELECT (${dayExpr})::date AS day,COUNT(*)::int AS orders,
    COALESCE(SUM(o.total_amount),0)::numeric(14,2) AS recorded_sales
    FROM pos_orders o WHERE o.organization_id=$1 AND o.status='COMPLETED'
    AND (${dayExpr})::date >= (now() AT TIME ZONE 'Asia/Kolkata')::date-29
    GROUP BY day ORDER BY day DESC`,[orgId])
  ]);
  const reportDate=raw||(await pool.query("SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).rows[0].day;
  res.json({date:reportDate,timezone:'Asia/Kolkata',summary:daily.rows[0],orders:orders.rows,
    recent_days:history.rows,note:'Recorded completed-order sales only; cashier-confirmed payments are not bank reconciled. Legacy records use updated_at as approximate completion time.'});
 }));
};
