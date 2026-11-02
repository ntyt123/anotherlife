import {randomUUID} from 'node:crypto';
import {assertSafeValue} from './runtime-core.mjs';
const rows=x=>Array.isArray(x)?x:[],name=x=>String(x?.姓名||x?.name||'').trim();
const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_.:-]{1,160}$/.test(id)&&!['player','__proto__','prototype','constructor'].includes(id);
const aliases=x=>[name(x),...rows(x?.别名),...rows(x?.aliases)].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim());
export function planActorIdentities(state,previousNPCs=state.npcs){
  const current=rows(state.npcs),oldRefs=rows(state.simulation?.actorRefs),previous=rows(previousNPCs),used=new Set(['player']),diffs=[],refs=[{actorId:'player',name:name(state.protagonist),archived:false}];
  const candidates=[...previous.filter(x=>valid(x.actorId)).map(x=>({actorId:x.actorId,names:aliases(x)})),...oldRefs.filter(x=>valid(x.actorId)&&!x.archived).map(x=>({actorId:x.actorId,names:[x.name,...rows(x.aliases)]}))];
  for(const[n,npc]of current.entries()){
    assertSafeValue(npc);if(!npc||typeof npc!=='object'||Array.isArray(npc))throw new Error('人物条目格式错误');let id=valid(npc.actorId)&&!used.has(npc.actorId)?npc.actorId:'';
    if(!id){const found=[...new Set(candidates.filter(x=>x.names.some(v=>aliases(npc).includes(v))).map(x=>x.actorId))].filter(x=>!used.has(x));if(found.length===1)id=found[0];}
    if(!id)id='actor:'+randomUUID();used.add(id);
    if(npc.actorId!==id)diffs.push({path:['npcs',n,'actorId'],to:id});
    const old=oldRefs.find(x=>x.actorId===id),allAliases=[...new Set([...rows(old?.aliases),old?.name,...aliases(npc)].filter(x=>typeof x==='string'&&x&&x!==name(npc)))];
    refs.push({actorId:id,name:name(npc),aliases:allAliases,archived:false});
  }
  for(const ref of oldRefs)if(ref.actorId!=='player'&&!used.has(ref.actorId))refs.push({...ref,archived:true});
  return {diffs,refs};
}
export function resolveActorReferences(raw,state){
  const update=JSON.parse(JSON.stringify(raw||{})),refs=rows(state.simulation?.actorRefs);
  const resolve=row=>{
    if(!row||typeof row!=='object')return;
    if(row.actorName){const matches=refs.filter(x=>x.name===String(row.actorName).trim()||rows(x.aliases).includes(String(row.actorName).trim()));if(matches.length!==1)throw new Error('人物名称不能唯一对应，请使用已登记actorId：'+row.actorName);row.actorId=matches[0].actorId;}
    if(!row.actorId)row.actorId='player';
    if(refs.length&&!refs.some(x=>x.actorId===row.actorId))throw new Error('人物标识未登记：'+row.actorId);
    delete row.actorName;
  };
  for(const key of ['skills','careers','actorRecords','skillEvents'])for(const row of rows(update[key]))resolve(row);
  for(const action of rows(update.managementOperations)){
    if(action.type==='assignStaff'&&action.actorName)resolve(action);
    if(action.type==='createUnit')for(const staff of rows(action.unit?.staff))if(staff.actorName)resolve(staff);
  }
  for(const event of rows(update.systemEvents)){
    for(const row of rows(event.task?.rewards?.skills))if(row.actorName)resolve(row);
    for(const row of rows(event.task?.rewards?.skillXp))if(row.actorName)resolve(row);
  }
  return update;
}
