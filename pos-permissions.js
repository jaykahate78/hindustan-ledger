'use strict';
// BBQ roles are explicit. OPERATOR is cashier; KITCHEN can only advance kitchen tickets.
// OWNER and ADMIN may operate both and configure the menu.
function canPos(method,path,role){
 if(role==='OWNER')return true;
 if(!['ADMIN','OPERATOR','KITCHEN'].includes(role))return false;
 if(method==='GET'&&path==='/pos/session')return true;
 if(method==='GET'&&path==='/pos/admin/daily-report')return role==='ADMIN';
 if(method==='GET'&&path==='/pos/kitchen-orders')return role==='KITCHEN'||role==='ADMIN';
 if(method==='PATCH'&&/^\/pos\/orders\/\d+\/status$/.test(path))return role==='KITCHEN'||role==='ADMIN';
 if(role==='KITCHEN')return false;
 if(method==='GET'&&(path==='/pos/orders'||path==='/pos/menu'||/^\/pos\/orders\/\d+\/receipt$/.test(path)))return true;
 if(method==='POST'&&path==='/pos/orders')return true;
 if(method==='PATCH'&&/^\/pos\/orders\/\d+\/payment$/.test(path))return true;
 if(role==='ADMIN'){
  if(method==='POST'&&path==='/pos/menu')return true;
  if(method==='PUT'&&/^\/pos\/menu\/\d+\/availability$/.test(path))return true;
 }
 return false;
}
function posCapabilities(role){
 return {view:role==='KITCHEN'?'kitchen':['ADMIN','OWNER'].includes(role)?'admin':'cashier',can_report:role==='OWNER'||role==='ADMIN',can_bill:['OWNER','ADMIN','OPERATOR'].includes(role),can_kitchen:['OWNER','ADMIN','KITCHEN'].includes(role),can_manage_menu:['OWNER','ADMIN'].includes(role)};
}
module.exports={canPos,posCapabilities};
