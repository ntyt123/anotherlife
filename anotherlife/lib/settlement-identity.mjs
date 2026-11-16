import {assertSafePath,assertSafeValue} from './runtime-core.mjs';
import {rejectedUpdateDetail,cleanGeneratedValue} from './data-integrity.mjs';
const own=(o,k)=>o!=null&&Object.prototype.hasOwnProperty.call(o,k);
const obj=v=>v!=null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'?v.trim():'';
const copy=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const selectorKeys=new Set(['姓名','名字','name','actorId','id','kind','role','isProtagonist','旧名','原名','别名','与主角关系','最近出场','重要','曾用名','固定资料变更依据']);
const protectedFields=new Set(['cpState','cpEpoch','intimacyHistory','是否艺人','表性格','里性格','性格','背景','人物背景','个人经历','surface_personality','inner_personality','background','标签','当前想法']);
const selfNames=new Set(['主角','本人','自己','我','玩家','protagonist']);
function blend(a,b){
  if(same(a,b))return{ok:true,value:copy(a)};
  if(!obj(a)||!obj(b))return{ok:false};
  const out=copy(a);
  for(const[k,v]of Object.entries(b)){if(!own(out,k)){out[k]=copy(v);continue;}const r=blend(out[k],v);if(!r.ok)return{ok:false};out[k]=r.value;}
  return{ok:true,value:out};
}
// 只整理人物归属，不修改存档或推断剧情。专用衣物任务仍由原验收器分流。
export function routeSettlementIdentity(state,input,diagnostics=[],originalFor=()=>undefined){
  const out={...input},hero=state.protagonist||{},heroName=text(hero.姓名||hero.名字),heroId=text(hero.actorId),npcs=Array.isArray(state.npcs)?state.npcs:[];
  if(obj(out.protagonist))out.protagonist=copy(out.protagonist);
  for(const source of ['other','diffs'])if(Array.isArray(input[source]))out[source]=[];
  const submitted=new Map(),conflicts=new Map(),invalidLists=new Set();
  const key=(source,path)=>source+':'+JSON.stringify(path);
  const warn=(original,why)=>diagnostics.push({kind:'ambiguous-actor-update',source:'actor-ownership',path:Array.isArray(original?.path)?original.path:[],why,...rejectedUpdateDetail(original)});
  function append(source,row,original){
    if(!Array.isArray(out[source])){
      if(own(input,source)&&!invalidLists.has(source)){invalidLists.add(source);warn({path:[source],value:input[source]},'变更列表类型不符，原始提交已保留在诊断');}
      out[source]=[];
    }
    out[source].push(row);const k=key(source,row?.path);if(!submitted.has(k))submitted.set(k,[]);submitted.get(k).push(original);
  }
  function owner(row){
    const name=text(row?.姓名||row?.名字||row?.name),id=text(row?.actorId||row?.id),alias=text(row?.旧名||row?.原名||row?.别名);
    const explicitSelf=selfNames.has(name)||/[（(](?:主角|玩家|本人)[）)]$/.test(name)||row?.kind==='protagonist'||row?.role==='protagonist'||row?.isProtagonist===true||['自己','本人','主角','我'].includes(text(row?.与主角关系));
    const explicitNPC=row?.kind==='npc'||row?.role==='npc'||row?.isProtagonist===false;
    const known=id?npcs.filter(n=>n?.actorId===id):[];
    if(known.length>1||known.length&&id===heroId)return'conflict';
    if(known.length)return explicitSelf||heroName&&name===heroName&&text(known[0].姓名)!==heroName&&alias!==text(known[0].姓名)?'conflict':'npc';
    if(id&&heroId&&id===heroId)return explicitNPC?'conflict':'protagonist';
    const byName=Boolean(heroName&&(name===heroName||alias===heroName));
    if(explicitSelf)return explicitNPC||id&&heroId&&id!==heroId?'conflict':'protagonist';
    if(explicitNPC)return byName&&!['性别','生日'].some(k=>text(row?.[k])&&text(hero[k])&&text(row[k])!==text(hero[k]))?'conflict':'npc';
    if(!byName)return'npc';
    if(id&&heroId&&id!==heroId||npcs.some(n=>text(n?.姓名||n?.名字)===heroName))return'conflict';
    if(['性别','生日'].some(k=>text(row?.[k])&&text(hero[k])&&text(row[k])!==text(hero[k])))return'conflict';
    if(text(row?.与主角关系)&&!selfNames.has(text(row.与主角关系)))return'conflict';
    return'protagonist';
  }
  function put(field,value,original){
    if(['性别','生日','身份','出生地','种族','外貌','身高','体重'].includes(field)&&text(hero[field])){
      const v=cleanGeneratedValue(value);
      if(v==null||v===0||v===''||Array.isArray(v)&&!v.length||obj(v)&&!Object.keys(v).length){warn(original,'误投主角的空身份资料与已确认值冲突，原值保留');return;}
    }
    if(field.startsWith('_')||protectedFields.has(field)){warn(original,'该主角字段不能从NPC通道自动改写，原值保留');return;}
    const path=['protagonist',field],box=out.protagonist||(out.protagonist={});
    if(conflicts.has(field)){conflicts.get(field).push({value:copy(value),original});return;}
    if(!own(box,field)){box[field]=copy(value);return;}
    const merged=blend(box[field],value);
    if(merged.ok){box[field]=merged.value;return;}
    conflicts.set(field,[{value:copy(box[field]),original:{path,value:copy(box[field])}},{value:copy(value),original}]);delete box[field];
  }
  function mainRecord(row,original,forcedRename=false){
    const name=text(row.姓名||row.名字||row.name),alias=text(row.旧名||row.原名||row.别名),id=text(row.actorId||row.id);
    if(name&&name!==heroName&&!selfNames.has(name)&&(forcedRename||id&&id===heroId||alias===heroName))put('姓名',name,original);
    for(const[k,value]of Object.entries(row))if(!selectorKeys.has(k))put(k,value,{...original,path:[...(Array.isArray(original?.path)?original.path:[]),k],value});
  }
  function character(row,original){
    if(!obj(row))return row;
    const kind=owner(row);
    if(kind==='conflict'){warn(original,'人物身份或主角同名信息存在冲突，未合并或新增，请明确actorId或NPC身份');return null;}
    if(kind==='protagonist'){mainRecord(row,original);return null;}
    const id=text(row.actorId||row.id),known=id?npcs.filter(n=>n?.actorId===id):[],name=text(row.姓名||row.名字||row.name)||(known.length===1?text(known[0].姓名):'');
    return name?{...row,姓名:name}:row;
  }
  if(Array.isArray(input.chars))out.chars=input.chars.flatMap((row,i)=>{const accepted=character(row,{path:['chars',i],value:row});return accepted==null?[]:[accepted];});
  for(const source of ['other','diffs'])for(const row of Array.isArray(input[source])?input[source]:[]){
    const original=originalFor(row,source)||row,p=row?.path,value=own(row,'to')?row.to:row?.value;
    if(!Array.isArray(p)||p[0]!=='npcs'||!own(row,'to')&&!own(row,'value')){append(source,row,original);continue;}
    try{assertSafePath(p);assertSafeValue(value);}catch{append(source,row,original);continue;}
    if(p.length===1&&Array.isArray(value)){
      // 原NPC整表保护继续生效；只救回其中明确误投的主角字段。
      for(let i=0;i<value.length;i++)if(obj(value[i])){
        const kind=owner(value[i]);if(kind==='protagonist')mainRecord(value[i],{path:[...p,i],value:value[i]});else if(kind==='conflict')warn(original,'NPC整表中有人物身份冲突，原名单保留');
      }
      append(source,row,original);continue;
    }
    if(typeof p[1]==='number'){
      if(p.length===2&&obj(value)){
        const kind=owner(value);
        if(kind==='protagonist'){
          if(npcs[p[1]])warn(original,'NPC槽位与主角身份冲突，原主角和原NPC均保留');else mainRecord(value,original);
          continue;
        }
        if(kind==='conflict'){warn(original,'NPC槽位的人物归属存在冲突，原值保留');continue;}
      }
      append(source,row,original);continue;
    }
    const ref=text(p[1]),kind=owner({姓名:ref,...(ref===heroId?{actorId:ref}:{})});
    if(kind==='conflict'){warn(original,'命名人物路径不能唯一确定主角或NPC，原值保留');continue;}
    if(kind!=='protagonist'){append(source,row,original);continue;}
    if(p.length===2){if(obj(value))mainRecord(value,original,true);else warn(original,'主角条目需要人物对象，原值保留');continue;}
    const field=p[2];
    if(typeof field!=='string'||selectorKeys.has(field)){warn(original,'不能从NPC命名路径修改主角身份元数据');continue;}
    if(p.length===3){put(field,value,original);continue;}
    // 深层误投也保留主角其他已有字段；仍用原路径安全校验。
    let patch=copy(hero[field]);if(!patch||typeof patch!=='object')patch=typeof p[3]==='number'?[]:{};
    let at=patch;
    for(let i=3;i<p.length-1;i++){if(!obj(at[p[i]])&&!Array.isArray(at[p[i]]))at[p[i]]=typeof p[i+1]==='number'?[]:{};at=at[p[i]];}
    at[p.at(-1)]=copy(value);put(field,patch,original);
  }
  for(const[field,values]of conflicts)for(const entry of values)append('other',{path:['protagonist',field],value:entry.value},entry.original);
  return{update:out,submittedFor:(row,source)=>{const queue=submitted.get(key(source,row?.path));return queue?.length?queue.shift():undefined;}};
}
