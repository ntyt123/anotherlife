const text=v=>typeof v==='string'?v.trim():'',copy=v=>JSON.parse(JSON.stringify(v));
export const assetLabel=a=>text(a?.名称||a?.名字||a?.name);
const clean=s=>String(s||'').replace(/[\s·・,，。.、:：;；!！?？()（）【】\[\]《》<>"'“”‘’]/gu,'');
const SUFFIX=/(?:有限责任公司|股份有限公司|有限公司|股份公司|控股集团|集团公司|集团|公司|工作室|商行|商店|店铺|工厂|企业|中心|事务所|门店|分店)/gu;
const ownerOf=a=>text(a?.产权人||a?.归属||a?.owner);
export function assetOwnerNames(state,extra=[]){const names=[state?.protagonist?.姓名,...(Array.isArray(state?.npcs)?state.npcs.map(n=>n?.姓名):[]),...(Array.isArray(state?.实体资产)?state.实体资产.map(ownerOf):[]),...(Array.isArray(state?.虚拟资产)?state.虚拟资产.map(ownerOf):[]),...extra];return [...new Set(names.map(text).filter(Boolean))];}
export function assetCore(name,owners=[]){let s=clean(name);if(!s)return'';for(const o of owners.map(clean).filter(Boolean).sort((a,b)=>b.length-a.length))s=s.split(o).join('');return s.replace(/个人|独资|私营/gu,'').replace(SUFFIX,'');}
export function sameAssetEntity(a,b,owners=[]){
 const an=clean(assetLabel(a)),bn=clean(assetLabel(b));if(!an||!bn)return false;
 const ao=clean(ownerOf(a)),bo=clean(ownerOf(b));if(ao&&bo&&ao!==bo)return false;
 if(an===bn)return true;
 const ac=assetCore(an,owners),bc=assetCore(bn,owners);if(!ac||ac!==bc)return false;
 const strip=s=>{let x=s;for(const o of owners.map(clean).filter(Boolean))x=x.split(o).join('');return x;};
 const ax=strip(an),bx=strip(bn);return ax===bx||ax.includes(bx)||bx.includes(ax);
}
const richness=a=>Object.values(a||{}).filter(v=>v!=null&&v!==''&&!(Array.isArray(v)&&!v.length)).length;
const nameScore=n=>/公司|企业|工作室|商行|店铺|工厂/.test(clean(n))?100+(/个人/.test(clean(n))?-50:0):clean(n).length;
export function mergeAssetRecords(a,b,owners=[]){
 const base=richness(a)>=richness(b)?a:b,other=base===a?b:a,out=copy(base);
 for(const[k,v]of Object.entries(other||{}))if(v!=null&&v!==''&&(out[k]==null||out[k]===''||(Array.isArray(out[k])&&!out[k].length)))out[k]=copy(v);
 out.名称=[assetLabel(a),assetLabel(b)].sort((x,y)=>nameScore(y)-nameScore(x))[0]||assetLabel(base);
 return out;
}
export function mergeDuplicateAssets(list,owners=[]){
 const out=[];
 for(const a of Array.isArray(list)?list:[]){if(!a||typeof a!=='object'||Array.isArray(a))continue;const at=out.findIndex(b=>sameAssetEntity(a,b,owners));if(at<0)out.push(copy(a));else out[at]=mergeAssetRecords(out[at],a,owners);}
 return out;
}
const rightsSubject=r=>text(r?.权利标的)||text(r?.名称||r?.名字).replace(/(?:所有权权益|所有者权益|股权|权益)$/u,'');
const asEntity=r=>({名称:rightsSubject(r),产权人:text(r?.归属||r?.产权人)});
export function mergeDuplicateRights(list,owners=[]){
 const out=[];
 for(const r of Array.isArray(list)?list:[]){
  if(!r||typeof r!=='object'||Array.isArray(r))continue;
  const at=out.findIndex(x=>sameAssetEntity(asEntity(r),asEntity(x),owners));
  if(at<0){out.push(copy(r));continue;}
  const a=out[at],base=richness(a)>=richness(r)?a:r,other=base===a?r:a,merged=copy(base);
  for(const[k,v]of Object.entries(other||{}))if(v!=null&&v!==''&&(merged[k]==null||merged[k]===''))merged[k]=copy(v);
  merged.名称=[a,r].map(x=>text(x.名称||x.名字)).sort((x,y)=>y.length-x.length)[0]||text(merged.名称||merged.名字);
  if(!text(merged.权利标的))merged.权利标的=rightsSubject(a)||rightsSubject(r);
  out[at]=merged;
 }
 return out;
}
export function duplicateAssetSummary(state){
 const owners=assetOwnerNames(state),real=Array.isArray(state?.实体资产)?state.实体资产:[],rights=Array.isArray(state?.虚拟资产)?state.虚拟资产:[];
 const realMerged=mergeDuplicateAssets(real,owners),rightsMerged=mergeDuplicateRights(rights,owners);
 return {owners,real,rights,realMerged,rightsMerged,realDuplicates:real.length-realMerged.length,rightsDuplicates:rights.length-rightsMerged.length};
}

const BUSINESS_WORDS=['经纪','影视','传媒','文化','娱乐','工作室','唱片','广告','发行','制作','演出'];
function businessWordsOf(name){const s=clean(name);return BUSINESS_WORDS.filter(w=>s.includes(w));}
export function mergeSimilarCareers(list, owners=[]){
 const out=[];
 for(const item of Array.isArray(list)?list:[]){
  if(!item||typeof item!=='object'){continue;}
  const name=str2(item.名称||item.名字||item.name);
  const ownerHit=owners.some(o=>o&&clean(name).includes(clean(o)));
  const words=businessWordsOf(name);
  const hit=ownerHit&&words.length?out.find(x=>{const n2=str2(x.名称||x.名字);return clean(n2).includes(clean(owners.find(o=>clean(n2).includes(clean(o)))||''))&&businessWordsOf(n2).some(w=>words.includes(w));}):null;
  if(!hit){out.push(item);continue;}
  const keep=nameScore(name,owners)>=nameScore(str2(hit.名称||hit.名字),owners)?item:hit;
  const drop=keep===item?hit:item;
  const merged={...drop,...keep};
  for(const [k,v] of Object.entries(keep))if(v==null||v===''||(Array.isArray(v)&&!v.length))if(drop[k]!=null&&drop[k]!=='')merged[k]=drop[k];
  merged.名称=str2(keep.名称||keep.名字||merged.名称);
  const at=out.indexOf(hit);
  if(at>=0)out[at]=merged;else out.push(merged);
 }
 return out;
}
function str2(v){return String(v==null?'':v).trim();}

const DETAIL_WORDS=/(小区|花园|公寓|大厦|别墅|府|苑|庄|路|街|道|巷|号|层|室|弄|里)/;
function keyName(record){const v=record&&typeof record==='object'?(record.名称||record.名字||record.name||record.位置||''):record;return String(v==null?'':v).trim();}
function cityOf(name){const s=clean(name);const m=s.match(/^(.{2,4}?)(?:市|省|自治区|特别行政区)/);if(m)return m[1];const known=['上海','北京','广州','深圳','杭州','南京','成都','重庆','武汉','西安','苏州','天津','香港','澳门','台北'];return known.find(c=>s.includes(c))||s.slice(0,2);}
export function mergeHomes(list){
 const out=[];
 for(const item of Array.isArray(list)?list:[]){
  if(!item||typeof item!=='object'){out.push(item);continue;}
  const name=keyName(item),city=cityOf(name),detail=DETAIL_WORDS.test(name);
  const hit=out.find(x=>{const n2=keyName(x),c2=cityOf(n2);if(c2!==city)return false;if(!clean(n2)||!clean(name))return false;if(clean(n2)===clean(name))return true;if(clean(n2).includes(clean(name))||clean(name).includes(clean(n2)))return true;const d2=DETAIL_WORDS.test(n2);return detail&&d2?false:true;});
  if(!hit){out.push(item);continue;}
  const keep=name.length>=keyName(hit).length?item:hit;
  const drop=keep===item?hit:item;
  const merged={...drop,...keep};
  for(const [k,v] of Object.entries(keep))if(v==null||v===''||(Array.isArray(v)&&!v.length))if(drop[k]!=null&&drop[k]!=='')merged[k]=drop[k];
  merged.名称=keyName(keep)||keyName(drop);
  const at=out.indexOf(hit);if(at>=0)out[at]=merged;else out.push(merged);
 }
 return out;
}
export function mergeSameSkills(list){
 const out=[];
 for(const item of Array.isArray(list)?list:[]){
  if(!item||typeof item!=='object'){out.push(item);continue;}
  const name=clean(keyName(item));
  if(!name){out.push(item);continue;}
  const hit=out.find(x=>clean(keyName(x))===name);
  if(!hit){out.push(item);continue;}
  const keep=(keyName(item).length>=keyName(hit).length?item:hit);
  const drop=keep===item?hit:item;
  const merged={...drop,...keep};
  for(const [k,v] of Object.entries(keep))if(v==null||v==='')if(drop[k]!=null&&drop[k]!=='')merged[k]=drop[k];
  merged.名称=keyName(keep)||keyName(drop);
  const at=out.indexOf(hit);if(at>=0)out[at]=merged;else out.push(merged);
 }
 return out;
}
