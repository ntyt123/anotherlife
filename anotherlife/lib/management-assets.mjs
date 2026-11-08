import {assetLabel,mergeAssetRecords} from './asset-identity.mjs';
const rows=v=>Array.isArray(v)?v:[],text=v=>typeof v==='string'?v.trim():'',copy=v=>JSON.parse(JSON.stringify(v));
const ownerText=a=>text(a?.产权人||a?.归属||a?.owner);
const ownerNames=a=>ownerText(a).split(/[、,，;；/|]/u).map(x=>x.replace(/[（(]\s*\d+(?:\.\d+)?\s*[%％]\s*[）)]/gu,'').trim()).filter(Boolean);
const subset=(a,b)=>a.every(v=>b.includes(v));
const unitLinks=a=>[...new Set([a?.managementUnitId,a?.unitId,a?.经营账户?.managementUnitId,a?.经营账户?.unitId].map(text).filter(Boolean))];
const unitLink=a=>unitLinks(a).length===1?unitLinks(a)[0]:'';

// 事业补种只认明确的同名主体与产权成员，不扩大通用资产/权益的模糊匹配。
export function careerBusinessRepresented(assets,career,owner){
 const name=assetLabel(career),who=text(owner),id=unitLink(career);
 if(!name||!who)return false;
 return rows(assets).some(a=>assetLabel(a)===name&&(!id||!unitLink(a)||unitLink(a)===id)&&ownerNames(a).includes(who));
}
function resolveUnit(asset,units){
 if(unitLinks(asset).length>1)return null;
 const kind=text(asset?.类型||asset?.类别||asset?.kind).toLowerCase();
 if(['房产','房屋','住宅','土地','股权','权益','基金','定存','property','realestate','equity'].includes(kind))return null;
 const id=unitLink(asset),name=assetLabel(asset);
 const hits=units.filter(u=>id?text(u.id)===id:name&&text(u.name)===name);
 if(hits.length!==1)return null;
 const unit=hits[0],owners=ownerNames(asset),known=rows(unit.shareholders).map(h=>text(h.name)).filter(Boolean);
 if(owners.length&&known.length&&!subset(owners,known))return null;
 return unit;
}
function mergeable(a,b,unit){
 if(assetLabel(a)!==assetLabel(b))return false;
 const left=ownerNames(a),right=ownerNames(b),known=rows(unit.shareholders).map(h=>text(h.name)).filter(Boolean);
 if(!left.length||!right.length||subset(left,right)||subset(right,left))return true;
 return known.length>0&&subset(left,known)&&subset(right,known);
}
function mergedAsset(a,b){
 const out=mergeAssetRecords(a,b),left=ownerNames(a),right=ownerNames(b);
 if(left.length&&right.length){out.产权人=subset(right,left)?ownerText(a):subset(left,right)?ownerText(b):[...new Set([...left,...right])].join('、');}
 return out;
}

// 仅返回投影差分，不记交易、不改变个人资金、不扫描或保存任何存档。
export function managementAssetDiffs(state,simulation=state?.simulation){
 if(!simulation?.enabled||!simulation.settings?.managementEnabled||!Array.isArray(state?.实体资产))return[];
 const units=rows(simulation.management?.units),out=[],linked=[];
 for(const original of state.实体资产){
  const unit=resolveUnit(original,units);
  if(!unit){out.push(copy(original));linked.push(null);continue;}
  const at=out.findIndex((a,i)=>linked[i]?.id===unit.id&&mergeable(a,original,unit));
  const asset=at<0?copy(original):mergedAsset(out[at],original);
  asset.managementUnitId=unit.id;
  if(unit.balanceKnown===true&&typeof unit.balance==='number'&&Number.isFinite(unit.balance)&&unit.balance>=0){
   const old=asset.经营账户;
   const account=old&&typeof old==='object'&&!Array.isArray(old)?copy(old):typeof old==='string'&&old.trim()?{简介:old}:{};
   asset.经营账户={...account,归属:text(unit.name),余额:unit.balance,币种:text(unit.currency)||text(account.币种),计入个人现金:false};
  }
  if(at<0){out.push(asset);linked.push(unit);}else out[at]=asset;
 }
 return JSON.stringify(out)===JSON.stringify(state.实体资产)?[]:[{path:['实体资产'],to:out}];
}
export const MANAGEMENT_ASSET_RULES='【经营资产与账户】同一经营主体的实体资产按显式managementUnitId/unitId或精确唯一全名关联，勿为股东或事业描述重复建同名公司。经营余额以managementOperations正常记账后的单位主账为准，实体资产中的经营账户是其资料投影，不是第二个可独立加钱的账户；收入、支出、转账仍按原经营协议提交，不通过改资产卡余额代替交易。不把注册资本、估值、股权或个人现金当经营余额。不同单位ID、不同产权人或名称歧义不猜测合并。';
