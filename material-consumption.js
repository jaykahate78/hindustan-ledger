'use strict';
// An explicitly supplied actual-consumption sheet must cover every recipe material.
// We never silently substitute an unverified recipe for operator-provided quantities.
const round3=x=>Math.round(x*1000)/1000;
function consumption(recipe,actual,quantity){
 if(!Number.isSafeInteger(Number(quantity))||quantity<1||quantity>1000)throw Error('Invalid batch quantity');
 if(!Array.isArray(recipe)||!recipe.length)throw Error('Configure a verified recipe');
 if(actual!==undefined&&(!Array.isArray(actual)||actual.length!==recipe.length))throw Error('Actual materials must cover every recipe item');
 const overrides=new Map();
 if(actual!==undefined)for(const item of actual){
  const id=Number(item.raw_material_id),qty=Number(item.quantity_used);
  if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(qty)||qty<=0||qty>1000000||Math.abs(qty*1000-Math.round(qty*1000))>1e-6||overrides.has(id))throw Error('Invalid or duplicate actual material');
  overrides.set(id,qty);
 }
 const allowed=new Set(recipe.map(r=>Number(r.raw_material_id)));
 if([...overrides.keys()].some(id=>!allowed.has(id)))throw Error('Unknown material in actual consumption');
 return recipe.map(r=>{
  const id=Number(r.raw_material_id);
  const estimated=round3(Number(r.qty_per_pipe)*quantity);
  const used=actual===undefined?estimated:overrides.get(id);
  if(!Number.isFinite(estimated)||estimated<=0||!Number.isFinite(used)||used<=0||used>1000000)throw Error('Invalid consumption quantity');
  return {raw_material_id:id,estimated_quantity:estimated,actual_quantity:used};
 });
}
module.exports={consumption,round3};
