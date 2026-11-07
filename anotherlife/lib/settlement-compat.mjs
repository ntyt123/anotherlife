import {assertSafeValue} from './runtime-core.mjs';
import {rejectedUpdateDetail} from './data-integrity.mjs';
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k),obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),copy=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const COMPAT_DAILY_FIELDS=['疾病与伤病','婚姻状况','配偶','子女','私人关系','隐患','收支','债务','凭证','事业','住所','交通'];
const daily=new Set([...COMPAT_DAILY_FIELDS,'物品']);
const pathRoots={主角:'protagonist',玩家:'protagonist',世界:'world',世界状态:'world',角色:'npcs',人物:'npcs',chars:'npcs',NPC:'npcs',人物关系:'relationships',关系:'relationships',rels:'relationships'};
const boxes={主角:'protagonist',玩家:'protagonist',世界:'world',世界状态:'world'};
const lists={角色:'chars',人物:'chars',npcs:'chars',NPC:'chars',人物关系:'relationships',关系:'relationships',rels:'relationships'};
const standard=new Set(['world','protagonist','chars','relationships','other','diffs','实体资产','虚拟资产','skills_items']);
const metadata=new Set(['summary','options','simulationUpdates','cpUpdates','CP动态','CP更新','粉丝动态','resetIncomeBaseline','固定资料变更依据','think','reasoning','analysis','检查清单','思考','导演笔记']);
const internal=new Set(['config','story','transcript','simulation','phone','gameId','phase']);
const decoded=v=>{if(typeof v!=='string'||!/^\s*[\[{]/.test(v))return v;try{const out=JSON.parse(v);assertSafeValue(out);return out;}catch{return v;}};
function location(s,key){if(daily.has(key))return ['protagonist',key];const p=own(s.protagonist,key),w=own(s.world,key);return p!==w?[p?'protagonist':'world',key]:null;}
function pathOf(s,value){
  let p=value;
  if(typeof p==='string'){
    const text=p.trim();
    if(text.startsWith('[')){try{p=JSON.parse(text);}catch{return value;}}
    else if(text.startsWith('/'))p=text.slice(1).split('/').map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));
    else p=text.replace(/\[(\d+)\]/g,'.$1').split('.');
    if(Array.isArray(p))p=p.map(x=>typeof x==='string'&&/^(?:0|[1-9]\d*)$/.test(x)&&Number.isSafeInteger(Number(x))?Number(x):x);
  }
  if(!Array.isArray(p)||!p.length)return p;
  p=p.slice();if(own(pathRoots,p[0]))p[0]=pathRoots[p[0]];
  else if(typeof p[0]==='string'){const root=location(s,p[0]);if(root)p=[...root,...p.slice(1)];}
  return p;
}
const homeName=v=>String(v?.名称||v?.名字||v?.name||'').trim(),homeId=v=>String(v?.id||v?.房屋编号||'').trim(),homeAddress=v=>String(v?.位置||v?.地址||v?.address||'').trim();
// 仅顶层兼容记录按精确标识增量写入；明确路径/规范容器保留旧替换语义。
function topHomes(s,value){
  value=decoded(value);const rows=Array.isArray(value)?value:obj(value)?[value]:null;if(!rows)throw Error('住所内容无法识别为房屋记录');if(!rows.length)return [];
  const out=copy(Array.isArray(s.protagonist?.住所)?s.protagonist.住所:[]);
  for(const row of rows){if(!obj(row))throw Error('住所条目不是房屋对象');const id=homeId(row),name=homeName(row),address=homeAddress(row);
    const hits=out.map((x,i)=>({x,i})).filter(({x})=>{const oldId=homeId(x);if(id&&oldId)return id===oldId;if(!name||homeName(x)!==name)return false;const oldAddress=homeAddress(x);return !address||!oldAddress||address===oldAddress;});
    if(hits.length>1)throw Error('房屋名称不能唯一定位，请提供房屋编号或完整位置');
    if(hits.length===1)out[hits[0].i]={...out[hits[0].i],...copy(row)};else out.push(copy(row));
  }return out;
}
export function normalizeSettlementUpdate(state,raw,diagnostics=[]){
  assertSafeValue(raw);const update={...raw},submitted=new Map();
  const key=(source,path)=>source+':'+JSON.stringify(path);
  const remember=(source,path,original)=>{const k=key(source,path);if(!submitted.has(k))submitted.set(k,[]);submitted.get(k).push(original);};
  const warn=(path,value,why)=>diagnostics.push({kind:'unmapped-update',source:'compatibility',path:Array.isArray(path)?path:[],why,...rejectedUpdateDetail({path,value})});
  const append=(source,row,original)=>{if(!Array.isArray(update[source]))update[source]=[];update[source].push(row);remember(source,row?.path,original);};
  for(const source of ['diffs','other'])if(Array.isArray(raw[source])){update[source]=[];for(const original of raw[source]){const row=obj(original)?{...original,path:pathOf(state,original.path)}:original;append(source,row,original);}}
  for(const root of ['world','protagonist'])if(own(raw,root)){const value=decoded(raw[root]);if(obj(value))update[root]={...value};else{warn([root],raw[root],'字段容器无法识别为对象，未应用');delete update[root];}}
  const put=(root,field,value,originalPath)=>{
    if(field.startsWith('_')){warn(originalPath,value,'不允许修改内部状态');return;}
    const box=update[root]||(update[root]={});
    if(own(box,field)&&!same(box[field],value)){
      append('other',{path:[root,field],value:box[field]},{path:[root,field],value:box[field]});
      append('other',{path:[root,field],value},{path:originalPath,value});delete box[field];
    }else box[field]=value;
  };
  for(const[k,value]of Object.entries(raw)){
    if(standard.has(k)||metadata.has(k))continue;
    if(own(boxes,k)){const root=boxes[k],box=decoded(value);if(!obj(box)){warn([k],value,'字段容器无法识别为对象，未应用');delete update[k];continue;}for(const[field,v]of Object.entries(box))put(root,field,v,[k,field]);delete update[k];continue;}
    if(own(lists,k)){const target=lists[k],parsed=decoded(value),rows=Array.isArray(parsed)?parsed:obj(parsed)?[parsed]:null;if(!rows)warn([k],value,'字段容器无法识别为人物或关系列表，未应用');else{const accepted=rows.flatMap((row,i)=>{if(!obj(row)){warn([k,i],row,'列表条目无法识别为人物或关系对象，未应用');return[];}const actors=Array.isArray(state.npcs)?state.npcs.filter(n=>row.actorId&&n.actorId===row.actorId):[];const name=String((target==='relationships'?row.对象:'')||row.姓名||row.名字||row.name||(actors.length===1?actors[0].姓名:'')||'').trim();if(!name){warn([k,i],row,'人物或关系条目无法确定姓名，未应用');return[];}return[{...row,[target==='chars'?'姓名':'对象']:name}];});update[target]=[...(Array.isArray(update[target])?update[target]:[]),...accepted];}delete update[k];continue;}
    if(internal.has(k)||k.startsWith('_')){warn([k],value,'不允许修改内部状态');delete update[k];continue;}
    const target=location(state,k);
    if(!target){warn([k],value,own(state.protagonist,k)&&own(state.world,k)?'字段同时存在于人物和世界，无法确定归属，未应用':'无法确定字段归属，未应用');delete update[k];continue;}
    try{put(target[0],target[1],k==='住所'?topHomes(state,value):value,[k]);}catch(error){warn([k],value,String(error.message||error));}
    delete update[k];
  }
  return {update,submittedFor:(row,source)=>{const rows=submitted.get(key(source,row?.path));return rows?.length?rows.shift():undefined;}};
}
