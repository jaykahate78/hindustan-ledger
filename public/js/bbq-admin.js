'use strict';
const el=id=>document.getElementById(id);
const money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const node=(tag,value)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=String(value);return x};
const fmt=ts=>new Date(ts).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
function notice(msg,error=false){const box=el('error');box.className=msg?'notice'+(error?' error':''):'';box.textContent=msg}
async function api(path){const r=await fetch('/api/operations/'+path,{credentials:'same-origin'});const data=await r.json().catch(()=>({error:'Server response error'}));if(!r.ok)throw Error(data.error||'Request failed');return data}
let rows=[];
function showOrder(order){
 const target=el('details');target.replaceChildren();
 const block=node('section');block.className='detail';
 block.appendChild(node('h3','Order '+order.order_no));
 for(const s of ['Cashier: '+order.cashier,'Payment: '+order.payment_method+(order.payment_reference?' · '+order.payment_reference:''),'Created: '+fmt(order.created_at),'Completed: '+fmt(order.completed_at)])block.appendChild(node('p',s));
 const list=node('table'),head=node('thead'),headRow=node('tr');
 for(const label of ['Item','Qty','Rate','Amount'])headRow.appendChild(node('th',label));
 head.appendChild(headRow);list.appendChild(head);const body=node('tbody');
 for(const item of order.items||[]){const tr=node('tr');for(const value of [item.name,item.quantity,money(item.unit_price),money(item.line_total)])tr.appendChild(node('td',value));body.appendChild(tr)}
 list.appendChild(body);block.append(list,node('strong','Total: '+money(order.total_amount)));target.appendChild(block);
 target.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function render(data){
 rows=data.orders||[];el('date').value=data.date;el('reportLabel').textContent='Business date: '+data.date+' · IST';
 const s=data.summary||{};el('completed').textContent=s.completed_orders||0;
 el('sales').textContent=money(s.recorded_sales);el('cash').textContent=money(s.cash_sales);
 el('digital').textContent=money(Number(s.upi_sales||0)+Number(s.card_sales||0));
 for(const [key,value] of [['cashDetail',s.cash_sales],['upi',s.upi_sales],['card',s.card_sales]])el(key).textContent=money(value);
 const orders=el('orders');orders.replaceChildren();el('details').replaceChildren();
 for(const o of rows){const tr=node('tr');for(const value of [o.order_no,fmt(o.completed_at),o.channel+(o.table_label?' / '+o.table_label:''),o.cashier,o.payment_method,money(o.total_amount)])tr.appendChild(node('td',value));const td=node('td');td.className='row-actions';const btn=node('button','Details');btn.type='button';btn.addEventListener('click',()=>showOrder(o));td.appendChild(btn);tr.appendChild(td);orders.appendChild(tr)}
 if(!rows.length){const tr=node('tr'),td=node('td','No completed orders on this date.');td.colSpan=7;tr.appendChild(td);orders.appendChild(tr)}
 const history=el('history');history.replaceChildren();for(const row of data.recent_days||[]){const tr=node('tr');const day=String(row.day).slice(0,10);for(const value of [day,row.orders,money(row.recorded_sales)])tr.appendChild(node('td',value));const td=node('td');td.className='row-actions';const btn=node('button','View');btn.type='button';btn.onclick=()=>load(day);td.appendChild(btn);tr.appendChild(td);history.appendChild(tr)}
 if(!history.children.length)history.appendChild(node('tr',''));
 if(rows.length>=500)notice('Showing first 500 completed orders. Export/pagination is not configured.',false);else notice('');
}
async function load(date){try{notice('Loading report…');const query=date?'?date='+encodeURIComponent(date):'';render(await api('pos/admin/daily-report'+query))}catch(err){notice(err.message,true)}}
el('load').addEventListener('click',()=>load(el('date').value));
el('today').addEventListener('click',()=>load(''));
api('pos/session').then(session=>{if(!session.can_report||session.view!=='admin'){window.location.replace('/bbq-access.html');return}return load('')}).catch(e=>notice('Admin login required: '+e.message,true));
