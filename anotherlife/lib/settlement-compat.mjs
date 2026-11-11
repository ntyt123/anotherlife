import {assertSafeValue} from './runtime-core.mjs';
import {rejectedUpdateDetail} from './data-integrity.mjs';
const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k),obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v),copy=v=>JSON.parse(JSON.stringify(v)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const COMPAT_DAILY_FIELDS=['疾病与伤病','婚姻状况','配偶','子女','私人关系','隐患','收支','债务','凭证','事业','住所','交通'];
const currentLocationAliases={current_location:'当前地点',currentLocation:'当前地点',当前位置:'当前地点'};
const worldLocationField=key=>own(currentLocationAliases,key)?currentLocationAliases[key]:key;
const daily=new Set([...COMPAT_DAILY_FIELDS,'物品']);
const pathRoots={主角:'protagonist',玩家:'protagonist',世界:'world',世界状态:'world',角色:'npcs',人物:'npcs',chars:'npcs',NPC:'npcs',人物关系:'relationships',关系:'relationships',rels:'relationships'};
const boxes={主角:'protagonist',玩家:'protagonist',世界:'world',世界状态:'world'};
const lists={角色:'chars',人物:'chars',npcs:'chars',NPC:'chars',人物关系:'relationships',关系:'relationships',rels:'relationships'};
const standard=new Set(['world','protagonist','chars','relationships','other','diffs','实体资产','虚拟资产','skills_items']);
const metadata=new Set(['intimacyEvents','phoneEvents','summary','options','simulationUpdates','cpUpdates','CP动态','CP更新','粉丝动态','resetIncomeBaseline','固定资料变更依据','think','reasoning','analysis','检查清单','思考','导演笔记']);
const internal=new Set(['config','story','transcript','simulation','phone','gameId','phase']);
const decoded=v=>{if(typeof v!=='string'||!/^\s*[\[{]/.test(v))return v;try{const out=JSON.parse(v);assertSafeValue(out);return out;}catch{return v;}};
function location(s,key){if(daily.has(key))return ['protagonist',key];const field=worldLocationField(key),p=own(s.protagonist,key)||own(s.protagonist,field),w=own(s.world,field);if(field==='当前地点'&&!p)return ['world',field];return p!==w?[p?'protagonist':'world',p?(own(s.protagonist,key)?key:field):field]:null;}
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
  if(p[0]==='world'&&p.length>1)p[1]=worldLocationField(p[1]);
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
  const fanGroups=[];
  const collectFans=(value,path)=>{fanGroups.push({value:decoded(value),path});};
  if(own(raw,'粉丝动态'))collectFans(raw.粉丝动态,['粉丝动态']);
  for(const source of ['diffs','other'])if(Array.isArray(raw[source])){
    update[source]=[];
    for(const original of raw[source]){
      const eventPath=obj(original)?pathOf({protagonist:{},world:{}},original.path):null;
      if(Array.isArray(eventPath)&&eventPath.length===1&&eventPath[0]==='粉丝动态'){
        if(own(original,'to')||own(original,'value'))collectFans(own(original,'to')?original.to:original.value,eventPath);
        else warn(eventPath,original,'粉丝动态缺少事件新值，未累计');
        continue;
      }
      const row=obj(original)?{...original,path:pathOf(state,original.path)}:original;if(Array.isArray(row?.path)&&row.path.length===1&&row.path[0]==='intimacyEvents')continue;append(source,row,original);
    }
  }
  for(const root of ['world','protagonist'])if(own(raw,root)){const value=decoded(raw[root]);if(obj(value))update[root]={...value};else{warn([root],raw[root],'字段容器无法识别为对象，未应用');delete update[root];}}
  const put=(root,field,value,originalPath)=>{
    if(field.startsWith('_')){warn(originalPath,value,'不允许修改内部状态');return;}
    const box=update[root]||(update[root]={});
    if(own(box,field)&&!same(box[field],value)){
      append('other',{path:[root,field],value:box[field]},{path:[root,field],value:box[field]});
      append('other',{path:[root,field],value},{path:originalPath,value});delete box[field];
    }else box[field]=value;
  };
  if(obj(update.world))for(const[field,value]of Object.entries(update.world)){
    const canonical=worldLocationField(field);if(canonical===field)continue;
    delete update.world[field];put('world',canonical,value,['world',field]);
  }
  for(const[k,value]of Object.entries(raw)){
    if(standard.has(k)||metadata.has(k))continue;
    if(own(boxes,k)){const root=boxes[k],box=decoded(value);if(!obj(box)){warn([k],value,'字段容器无法识别为对象，未应用');delete update[k];continue;}for(const[field,v]of Object.entries(box))put(root,root==='world'?worldLocationField(field):field,v,[k,field]);delete update[k];continue;}
    if(own(lists,k)){const target=lists[k],parsed=decoded(value),rows=Array.isArray(parsed)?parsed:obj(parsed)?[parsed]:null;if(!rows)warn([k],value,'字段容器无法识别为人物或关系列表，未应用');else{const accepted=rows.flatMap((row,i)=>{if(!obj(row)){warn([k,i],row,'列表条目无法识别为人物或关系对象，未应用');return[];}const actors=Array.isArray(state.npcs)?state.npcs.filter(n=>row.actorId&&n.actorId===row.actorId):[];const name=String((target==='relationships'?row.对象:'')||row.姓名||row.名字||row.name||(actors.length===1?actors[0].姓名:'')||'').trim();if(!name){warn([k,i],row,'人物或关系条目无法确定姓名，未应用');return[];}return[{...row,[target==='chars'?'姓名':'对象']:name}];});update[target]=[...(Array.isArray(update[target])?update[target]:[]),...accepted];}delete update[k];continue;}
    if(internal.has(k)||k.startsWith('_')){warn([k],value,'不允许修改内部状态');delete update[k];continue;}
    const target=location(state,k);
    if(!target){warn([k],value,own(state.protagonist,k)&&own(state.world,k)?'字段同时存在于人物和世界，无法确定归属，未应用':'无法确定字段归属，未应用');delete update[k];continue;}
    try{put(target[0],target[1],k==='住所'?topHomes(state,value):value,[k]);}catch(error){warn([k],value,String(error.message||error));}
    delete update[k];
  }
  if(fanGroups.length){
    const candidates=[],identities=new Map(),layers=new Set(['唯粉','CP粉','路人盘','黑粉']);
    for(const [group,g] of fanGroups.entries()){
      const rows=Array.isArray(g.value)?g.value:obj(g.value)?[g.value]:null;
      if(!rows){warn(g.path,g.value,'粉丝动态内容不是事件列表，未累计');continue;}
      for(const [index,c] of rows.entries()){
        const name=String(c?.姓名??'').trim(),layer=String(c?.圈层??'').trim();
        const v=typeof c?.增减==='string'?c.增减.replace(/[,，\s]/g,''):c?.增减,delta=Number(v);
        if(!obj(c)||!name||!layers.has(layer)||!['number','string'].includes(typeof v)||v===''||!Number.isFinite(delta)){warn(g.path.concat(index),c,'粉丝事件需明确姓名、有效圈层和数值增减，未累计');continue;}
        const row={...c,姓名:name,圈层:layer,增减:delta};
        const identity=JSON.stringify([name,layer,String(c.原因||''),String(c.eventId??c.事件ID??c.id??'')]);
        const entry={row,group,identity,path:g.path.concat(index)};candidates.push(entry);
        if(!identities.has(identity))identities.set(identity,new Map());
        const groups=identities.get(identity);if(!groups.has(group))groups.set(group,new Set());groups.get(group).add(delta);
      }
    }
    const conflicts=new Set();
    for(const [identity,groups] of identities){
      const variants=new Set([...groups.values()].map(values=>JSON.stringify([...values].sort((a,b)=>a-b))));
      if(variants.size>1){conflicts.add(identity);warn(['粉丝动态'],candidates.filter(c=>c.identity===identity).map(c=>c.row),'同一粉丝事件跨容器提交不同增减，未累计；请区分事件依据');}
    }
    const seen=new Set();update.粉丝动态=[];
    for(const c of candidates){const key=c.identity+'|'+c.row.增减;if(conflicts.has(c.identity)||seen.has(key))continue;seen.add(key);update.粉丝动态.push(c.row);}
  }
  return {update,submittedFor:(row,source)=>{const rows=submitted.get(key(source,row?.path));return rows?.length?rows.shift():undefined;}};
}
