import {NEWS_MIN_EACH,cleanNewsContent} from './news-text.mjs';
import {MANAGEMENT_PROFILE_RULES,businessProfileSchema} from './management-profile.mjs';
import {createHash} from 'node:crypto';
import { assertSafeValue } from './runtime-core.mjs';
import { createManagement, normalizeManagement, executeManagement, previewManagement, recommendationSignature, applyRecommendations, money, quantity, createUnit, validateStaffAllocations } from './management-core.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const arr = value => Array.isArray(value) ? value : [];
const obj = value => !!value && typeof value === 'object' && !Array.isArray(value);
const str = value => typeof value === 'string' ? value.trim() : '';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const requiredId = value => { const s = str(value); if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(s) || ['__proto__','constructor','prototype'].includes(s)) throw new Error('通用标识无效'); return s; };
const decimalAdd = (a,b) => Math.round((Number(a)+Number(b))*100)/100;
export const SIMULATION_PROTOCOL = 1;
export const ROLE_LABELS=['职位','官职','职务','任职'];
export const ORG_LABELS=['组织','所属','学院'];
export const PROFILE_PRESETS = {
  modern: { name: '现代', roleLabel: '职位', organizationLabel: '组织', skillLabel: '技能', fields: [] },
  ancient: { name: '古代', roleLabel: '官职', organizationLabel: '所属', skillLabel: '技能', fields: [] },
  republican: { name: '民国', roleLabel: '职务', organizationLabel: '所属', skillLabel: '技能', fields: [] },
  academy: { name: '学院', roleLabel: '职务', organizationLabel: '学院', skillLabel: '技能', fields: [{ key:'houseName', label:'学院', type:'text' },{ key:'credits',label:'学分',type:'number' },{key:'courses',label:'课程',type:'list'}] },
  custom: { name: '自定义', roleLabel:'任职', organizationLabel:'组织', skillLabel:'技能', fields:[] },
};
const PROFILE_ALIASES={现代:'modern',当代:'modern',都市:'modern',近现代:'modern',现代都市:'modern',古代:'ancient',古装:'ancient',武侠:'ancient',仙侠:'ancient',民国:'republican',学院:'academy',校园:'academy',自定义:'custom'};
export function profileIdOf(value){const raw=str(value).trim();if(!raw)return'';if(PROFILE_PRESETS[raw])return raw;const lower=raw.toLowerCase();if(PROFILE_PRESETS[lower])return lower;return PROFILE_ALIASES[raw]||PROFILE_ALIASES[lower]||'';}
export function createSimulation() {
  return { version: 1, enabled: false, settings: { managementEnabled:false, boundSystemEnabled:false, worldNewsEnabled:true, worldNewsInterval:3 },
    profile: { id:'modern', ...copy(PROFILE_PRESETS.modern), description:'', careerTracks:[] }, actorRecords:{}, careers:[], skills:[],
    management:createManagement(), actorRefs:[], skillGrowthProcessed:[], careerGrowthProcessed:[], boundSystem:{ name:'',persona:'',guidance:'',level:1,xp:0,xpPerLevel:100,metrics:{},tasks:[],achievements:[],messages:[],rewardLog:[],processedEvents:[] },
    news:{items:[],lastAttemptTurn:0,lastSuccessTurn:0,error:'',basis:''}, operationLog:[] };
}
export function normalizeSimulation(raw) {
  assertSafeValue(raw || {}); const base=createSimulation(); if(!raw)return base;
  if(!obj(raw))throw new Error('通用模拟数据格式错误'); const out={...base,...copy(raw)};
  out.settings={...base.settings,...out.settings};
  out.settings.worldNewsInterval=Math.max(1,Math.min(1000,Math.floor(Number(out.settings.worldNewsInterval)||3)));
  out.profile={...base.profile,...out.profile};
  if(!obj(out.actorRecords))throw new Error('人物扩展资料格式错误');
  for(const k of ['careers','skills','operationLog'])if(!Array.isArray(out[k]))throw new Error('通用数据格式错误：'+k);
  out.management=normalizeManagement(out.management);for(const k of ['actorRefs','skillGrowthProcessed','careerGrowthProcessed'])if(!Array.isArray(out[k]))throw new Error('成长记录格式错误');
  out.boundSystem={...base.boundSystem,...out.boundSystem}; for(const k of ['tasks','achievements','messages','rewardLog','processedEvents'])if(!Array.isArray(out.boundSystem[k]))throw new Error('绑定系统数据格式错误');
  if(!obj(out.boundSystem.metrics))throw new Error('任务计数格式错误'); out.news={...base.news,...out.news}; if(!Array.isArray(out.news.items))throw new Error('世界动态数据格式错误'); return out;
}
export function updateSimulationSettings(raw, patch) {
  assertSafeValue(patch); const next=normalizeSimulation(raw); next.enabled=true;
  if(patch.settings)for(const k of ['managementEnabled','boundSystemEnabled','worldNewsEnabled'])if(typeof patch.settings[k]==='boolean')next.settings[k]=patch.settings[k];
  if(patch.settings?.worldNewsInterval!=null){const n=Number(patch.settings.worldNewsInterval);if(!Number.isInteger(n)||n<1||n>1000)throw new Error('更新间隔应为1至1000轮');next.settings.worldNewsInterval=n;}
  if(patch.profile){const p=patch.profile; const id=profileIdOf(p.id)||profileIdOf(p.name)||next.profile.id;next.profile=id===next.profile.id?{...copy(next.profile),id}:{id,...copy(PROFILE_PRESETS[id]),description:'',careerTracks:[]};if(p.description!==undefined)next.profile.description=str(p.description);if(p.careerTracks!==undefined)next.profile.careerTracks=arr(p.careerTracks);for(const k of ['name','roleLabel','organizationLabel','skillLabel'])if(str(p[k]))next.profile[k]=str(p[k]);const 预设列名=PROFILE_PRESETS[next.profile.id]||PROFILE_PRESETS.modern;if(p.roleLabel!==undefined)next.profile.roleLabel=ROLE_LABELS.includes(str(p.roleLabel))?str(p.roleLabel):预设列名.roleLabel;if(p.organizationLabel!==undefined)next.profile.organizationLabel=ORG_LABELS.includes(str(p.organizationLabel))?str(p.organizationLabel):预设列名.organizationLabel;if(Array.isArray(p.fields))next.profile.fields=copy(p.fields);for(const f of next.profile.fields){requiredId(f.key);if(!str(f.label))throw new Error('扩展资料需要显示名称');}}
  if(patch.boundSystem){for(const k of ['name','persona','guidance'])if(patch.boundSystem[k]!=null)next.boundSystem[k]=str(patch.boundSystem[k]);if(patch.boundSystem.xpPerLevel!=null)next.boundSystem.xpPerLevel=quantity(patch.boundSystem.xpPerLevel,'升级经验',false);}
  return next;
}
export function diffSimulation(before, after) {
  const a=before||{},b=after||{},out=[];for(const k of Object.keys(b))if(!same(a[k],b[k]))out.push({path:['simulation',k],to:copy(b[k])});return out;
}
function upsert(rows, raw, fields, prefix='record') {
  const id=requiredId(raw.id),scoped=fields.includes('actorId'),actorId=requiredId(str(raw.actorId)||'player'); const at=rows.findIndex(x=>x.id===id&&(!scoped||(x.actorId||'player')===actorId)),next={...(at>=0?rows[at]:{}),id,...(scoped?{actorId}:{})};for(const k of fields)if(raw[k]!==undefined)next[k]=copy(raw[k]);
  if(at<0)rows.push(next);else rows[at]=next;return next;
}
function recordCareer(list,raw,turn,setup,fields){
  const previous=list.find(x=>x.id===raw.id&&(x.actorId||'player')===(raw.actorId||'player')),next=upsert(list,raw,fields);
  if(previous&&!setup){next.history=copy(arr(previous.history));if(['title','organizationId','organizationName','rank'].some(key=>str(previous[key])!==str(next[key])))next.history.push({title:str(previous.title),organizationName:str(previous.organizationName),rank:str(previous.rank),grade:str(previous.grade),endedAt:str(raw.startedAt),toTitle:str(next.title),turn});}
  return next;
}
function numericLevel(xp, skill) {
  const thresholds=arr(skill.levelThresholds);if(thresholds.length){let previous=-1;for(const n of thresholds){if(!Number.isFinite(Number(n))||Number(n)<0||Number(n)<=previous)throw new Error('等级经验阈值应递增');previous=Number(n);}return 1+thresholds.filter(n=>xp>=Number(n)).length;}
  return 1+Math.floor(xp/quantity(skill.xpPerLevel||100,'技能升级经验',false));
}
function updateSkill(list, raw, setup=false) {
  const id=requiredId(raw.id),existing=list.find(x=>x.id===id&&(x.actorId||'player')===(raw.actorId||'player'));if(!str(raw.name||existing?.name))throw new Error('缺少技能名称');
  const mode=['narrative','numeric','fixed'].includes(raw.progressionMode)?raw.progressionMode:(existing?.progressionMode||'narrative');
  const safeRaw={...raw};if(existing&&!setup&&existing.progressionMode==='numeric')for(const k of ['xpPerLevel','levelThresholds','xpRules'])delete safeRaw[k];
  const next=upsert(list,{...safeRaw,progressionMode:mode},['actorId','name','category','description','source','progressionMode','status','levelLabel','effects','xpPerLevel','levelThresholds','xpRules']);next.actorId=str(next.actorId)||'player';
  if(existing?.progressionMode==='numeric'&&mode!=='numeric'&&!setup)throw new Error('数值技能不能由普通结算改成其他成长方式');
  if(mode==='numeric'){next.xp=setup&&raw.xp!=null?quantity(raw.xp,'技能经验'):existing?.xp??0;next.level=numericLevel(next.xp,next);next.levelLabel='';next.xpRules=arr(next.xpRules).map(x=>({id:requiredId(x.id),name:str(x.name),amount:quantity(x.amount,'成长经验')}));}
  return next;
}
function normalizeRewards(raw) {
  const out={};if(raw?.money!=null)out.money=money(raw.money);if(raw?.systemXp!=null)out.systemXp=quantity(raw.systemXp,'系统经验');
  if(raw?.skillXp)out.skillXp=arr(raw.skillXp).map(x=>({skillId:requiredId(x.skillId),actorId:str(x.actorId)||'player',amount:quantity(x.amount,'技能经验')}));
  if(raw?.items)out.items=arr(raw.items).map(x=>({name:str(x.name),quality:str(x.quality),description:str(x.description),quantity:quantity(x.quantity??1)})).filter(x=>x.name);
  if(raw?.unitStock)out.unitStock=arr(raw.unitStock).map(x=>({unitId:requiredId(x.unitId),resourceId:requiredId(x.resourceId),quantity:quantity(x.quantity)}));
  if(raw?.skills)out.skills=arr(raw.skills).map(x=>({id:requiredId(x.id),actorId:str(x.actorId)||'player',name:str(x.name),category:str(x.category),description:str(x.description),source:'systemReward',progressionMode:['numeric','fixed','narrative'].includes(x.progressionMode)?x.progressionMode:'narrative',xpPerLevel:x.xpPerLevel||100}));
  return out;
}
function publishTask(list, raw, system, achievement=false) {
  const id=requiredId(raw.id);if(list.some(x=>x.id===id))return;
  const countMode=raw.countMode||(achievement?'lifetime':'sincePublish');if(!['lifetime','sincePublish'].includes(countMode))throw new Error('任务累计方式无效');
  const task={id,countMode,metricStart:countMode==='lifetime'?0:Number(system.metrics[raw.metricKey]||0),name:str(raw.name),description:str(raw.description),kind:str(raw.kind)||'side',mode:raw.mode==='metric'?'metric':'narrative',status:'active',autoClaim:raw.autoClaim!==false,metricKey:str(raw.metricKey),target:raw.mode==='metric'?quantity(raw.target,'任务目标',false):0,rewards:normalizeRewards(raw.rewards),deadline:str(raw.deadline),evidence:'',completedAtTurn:null};
  if(!task.name)throw new Error('缺少任务名称');if(task.mode==='metric')requiredId(task.metricKey);list.push(task);
}
function payRewards(sim, task, turn) {
  const system=sim.boundSystem,key='reward:'+task.id;if(system.rewardLog.some(x=>x.id===key))return {money:0,items:[]};
  const reward=task.rewards||{};
  for(const r of arr(reward.skills))if(!sim.skills.some(x=>x.id===r.id&&(x.actorId||'player')===(r.actorId||'player')))updateSkill(sim.skills,r,true);
  for(const r of arr(reward.skillXp)){const skill=sim.skills.find(x=>x.id===r.skillId&&(x.actorId||'player')===(r.actorId||'player'));if(!skill||skill.progressionMode!=='numeric')throw new Error('奖励技能不存在或不是数值成长：'+r.skillId);}
  for(const r of arr(reward.unitStock))if(!sim.management.units.some(x=>x.id===r.unitId))throw new Error('奖励经营单位不存在');
  for(const r of arr(reward.skillXp)){const skill=sim.skills.find(x=>x.id===r.skillId&&(x.actorId||'player')===(r.actorId||'player'));skill.xp=quantity(skill.xp+r.amount,'技能经验');skill.level=numericLevel(skill.xp,skill);}
  for(const r of arr(reward.unitStock)){const unit=sim.management.units.find(x=>x.id===r.unitId);unit.stock[r.resourceId]=quantity((unit.stock[r.resourceId]||0)+r.quantity,'奖励库存');}
  system.xp=quantity(system.xp+(reward.systemXp||0),'系统经验');system.level=1+Math.floor(system.xp/quantity(system.xpPerLevel||100,'升级经验',false));
  system.rewardLog.push({id:key,taskId:task.id,name:task.name,turn,rewards:copy(reward)});task.status='claimed';
  return {money:reward.money||0,items:arr(reward.items)};
}
export function processBoundSystem(raw, event, turn=0, options={}) {
  const sim=normalizeSimulation(raw);if(!sim.settings.boundSystemEnabled)throw new Error('系统绑定未开启');assertSafeValue(event);
  const eventId=requiredId(event.id);if(sim.boundSystem.processedEvents.includes(eventId))return {simulation:sim,money:0,items:[]};
  const system=sim.boundSystem;let cash=0;const items=[];if(['publishTask','publishAchievement'].includes(event.type)){const other=event.type==='publishTask'?system.achievements:system.tasks;if(other.some(x=>x.id===event.task?.id))throw new Error('任务与成就标识重复');}
  if(event.type==='publishTask'||event.type==='publishAchievement')publishTask(event.type==='publishTask'?system.tasks:system.achievements,event.task,system,event.type==='publishAchievement');
  else if(event.type==='metric') { const key=requiredId(event.metricKey);system.metrics[key]=quantity((system.metrics[key]||0)+quantity(event.amount,'任务增量'),'任务进度'); }
  else if(event.type==='narrativeComplete'){const task=[...system.tasks,...system.achievements].find(x=>x.id===event.taskId);if(!task||task.mode!=='narrative')throw new Error('叙事任务不存在');if(!str(event.evidence))throw new Error('缺少任务达成依据');if(task.status==='active'){task.evidence=str(event.evidence);task.status='completed';task.completedAtTurn=turn;}}
  else if(event.type==='message'){if(!str(event.text))throw new Error('系统消息为空');system.messages.push({role:'assistant',content:str(event.text),source:'story',turn,eventId});}
  else if(['failTask','expireTask','cancelTask'].includes(event.type)){const task=[...system.tasks,...system.achievements].find(x=>x.id===event.taskId);if(!task)throw new Error('任务不存在');if(task.status==='claimed')throw new Error('已领取任务不能通过失败事件撤奖');if(!str(event.evidence))throw new Error('任务状态变化缺少依据');task.status=({failTask:'failed',expireTask:'expired',cancelTask:'cancelled'})[event.type];task.evidence=str(event.evidence);}
  else if(event.type==='claim'){const task=[...system.tasks,...system.achievements].find(x=>x.id===event.taskId);if(!task||!['completed','claimed'].includes(task.status))throw new Error('任务尚未完成');const reward=payRewards(sim,task,turn);cash=decimalAdd(cash,reward.money);items.push(...reward.items);}
  else throw new Error('不支持的系统事件');
  for(const task of [...system.tasks,...system.achievements]){
    if(task.status==='active'&&task.mode==='metric'&&Math.max(0,(system.metrics[task.metricKey]||0)-(task.metricStart||0))>=task.target){task.status='completed';task.completedAtTurn=turn;}
    if(task.status==='completed'&&task.autoClaim&&!options.deferRewards){const reward=payRewards(sim,task,turn);cash=decimalAdd(cash,reward.money);items.push(...reward.items);}
  }
  system.processedEvents.push(eventId);return {simulation:sim,money:cash,items};
}

export function growSkill(raw,event){
  const sim=normalizeSimulation(raw);assertSafeValue(event);const id=requiredId(event.id);if(sim.skillGrowthProcessed.includes((event.actorId||'player')+':'+id))return sim;
  const skill=sim.skills.find(x=>x.id===event.skillId&&(x.actorId||'player')===(event.actorId||'player'));if(!skill||skill.progressionMode!=='numeric')throw new Error('数值技能不存在');
  const rule=arr(skill.xpRules).find(x=>x.id===event.ruleId);if(!rule)throw new Error('技能成长规则未登记');
  const amount=quantity(rule.amount,'成长经验')*quantity(event.count??1,'成长次数',false);skill.xp=quantity((skill.xp||0)+amount,'技能经验');skill.level=numericLevel(skill.xp,skill);sim.skillGrowthProcessed.push((event.actorId||'player')+':'+id);return sim;
}
export function previewSimulationActions(raw, actions, turn=0) {
  let simulation=normalizeSimulation(raw),personalDelta=0;const reports=[],items=[];
  for(const action of arr(actions)){
    if(action.type==='claimTask'){const result=processBoundSystem(simulation,{id:action.id,type:'claim',taskId:action.taskId},turn);simulation=result.simulation;personalDelta=decimalAdd(personalDelta,result.money);items.push(...result.items);reports.push({actionId:action.id,type:'claimTask'});}
    else {if(!simulation.settings.managementEnabled)throw new Error('经营未开启');const result=executeManagement(simulation.management,action);simulation.management=result.management;personalDelta=decimalAdd(personalDelta,result.personalDelta);reports.push(result.report);}
  }
  return {simulation,personalDelta,reports,items};
}
export function applySimulationUpdates(raw, update, turn=0, setup=false) {
  assertSafeValue(update||{});let sim=normalizeSimulation(raw);if(!sim.enabled||!obj(update))return {simulation:sim,personalDelta:0,items:[],issues:[]};
  let cash=0;const items=[],issues=[];
  const guard=(fn,label='')=>{const previous=copy(sim),beforeCash=cash,beforeItems=items.length;try{fn();}catch(error){sim=previous;cash=beforeCash;items.splice(beforeItems);issues.push((label?label+'：':'')+String(error.message||error));}};
  if(setup){if(Array.isArray(update.removeSkillIds))sim.skills=sim.skills.filter(x=>(x.actorId||'player')!==(update.removalActorId||'player')||!update.removeSkillIds.includes(x.id));if(Array.isArray(update.removeCareerIds))sim.careers=sim.careers.filter(x=>(x.actorId||'player')!==(update.removalActorId||'player')||!update.removeCareerIds.includes(x.id));}
  if(update.profile)guard(()=>{const patched=updateSimulationSettings(sim,{profile:update.profile});sim.profile=patched.profile;});
  for(const row of arr(update.actorRecords))guard(()=>{const actorId=requiredId(row.actorId||'player');if(!obj(row.values))throw new Error('扩展资料格式错误');const values={...(sim.actorRecords[actorId]||{})};for(const[k,v]of Object.entries(row.values)){requiredId(k);values[k]=copy(v);}sim.actorRecords[actorId]=values;});
  for(const row of arr(update.careers))guard(()=>{if(!str(row.title))throw new Error('缺少任职名称');recordCareer(sim.careers,row,turn,setup,['actorId','organizationId','organizationName','title','rank','duties','startedAt','endedAt','status','salaryRuleId','description']);});
  for(const row of arr(update.skills))guard(()=>{const next=copy(sim.skills);updateSkill(next,row,setup);sim.skills=next;});
  for(const[index,event]of arr(update.skillEvents).entries())guard(()=>{sim=growSkill(sim,{...event,id:event.id||'skillEvent:'+turn+':'+index});});
  if(sim.settings.managementEnabled)for(const [index,operation]of arr(update.managementOperations).entries())guard(()=>{
    if(!obj(operation))throw new Error('格式错误，应提交操作对象');
    if(typeof operation.type!=='string'||!operation.type.trim())throw new Error('缺少操作类型 type，请按经营工具结构提交');
    if(!MANAGEMENT_OPERATION_TYPES.includes(operation.type))throw new Error('不支持操作类型 '+operationTypeLabel(operation.type)+'，请使用工具列出的 type');
    if(setup&&operation.type==='createUnit'){
      const raw=operation.unit||{},previous=sim.management.units.find(x=>x.id===raw.id),combined={...previous,...raw};
      if(Object.prototype.hasOwnProperty.call(raw,'balance')&&!Object.prototype.hasOwnProperty.call(raw,'balanceKnown'))combined.balanceKnown=raw.balance!==''&&raw.balance!=null;
      if(previous&&previous.balanceKnown!==false){combined.balance=previous.balance;combined.balanceKnown=true;combined.currency=previous.currency;}
      const normalized=createUnit(combined);
      if(previous){for(const key of Object.keys(raw))previous[key]=Object.prototype.hasOwnProperty.call(normalized,key)?copy(normalized[key]):copy(raw[key]);previous.balanceKnown=normalized.balanceKnown;previous.revision=(previous.revision||0)+1;}
      else sim.management.units.push(normalized);
      validateStaffAllocations(sim.management);return;
    }
    const action={...operation,id:operation.id||'model:'+turn+':'+index};
    if(MANAGEMENT_OPERATION_TYPES.includes(action.type)){
      const result=executeManagement(sim.management,action);sim.management=result.management;cash=decimalAdd(cash,result.personalDelta);
    }else throw new Error('不支持操作类型 '+operationTypeLabel(action.type));
  },'经营指令第'+(index+1)+'条');
  if(sim.settings.boundSystemEnabled){
    if(update.systemPersona!=null&&(!setup||!sim.boundSystem.persona))sim.boundSystem.persona=str(update.systemPersona);if(update.systemGuidance!=null&&(!setup||!sim.boundSystem.guidance))sim.boundSystem.guidance=str(update.systemGuidance);
    for(const[index,event]of arr(update.systemEvents).entries())guard(()=>{const result=processBoundSystem(sim,{...event,id:event.id||'system:'+turn+':'+index},turn);sim=result.simulation;cash=decimalAdd(cash,result.money);items.push(...result.items);});
  }
  return {simulation:sim,personalDelta:cash,items,issues};
}
export function currentNews(state,simulation){const key=worldNewsKey(state,simulation);return arr(simulation.news?.items).filter(x=>(!x.worldKey||x.worldKey===key)&&(!x.sourceTextVersion||arr(state.transcript).some(t=>t.role==='assistant'&&Number(t.seq)===Number(x.sourceSeq)&&t.textVersion===x.sourceTextVersion)));}
export function worldNewsKey(state,simulation){return JSON.stringify([state.world?.['世界观类型']||'',state.world?.['时代与年份']||'',simulation.profile?.id||'',simulation.profile?.description||'']);}
export function simulationBasis(state,simulation){const anchor=arr(state.transcript).filter(x=>x.role==='assistant').at(-1);return createHash('sha256').update(JSON.stringify([state.gameId||'',state.world||{},state.story?.current_message_index||0,anchor?.textVersion||'',simulation.profile?.id||'',simulation.profile?.description||''])).digest('hex');}
export function backgroundTasks(state, simulation, turnCount, force=false, requestedUnitId='') {
  const sim=normalizeSimulation(simulation);if(!sim.enabled)return {news:false,units:[],basis:''};
  const news=!!sim.settings.worldNewsEnabled&&(force||turnCount-sim.news.lastAttemptTurn>=sim.settings.worldNewsInterval);
  const units=sim.settings.managementEnabled?sim.management.units.filter(x=>(!requestedUnitId||x.id===requestedUnitId)&&(force||x.recommendationAttempt!==recommendationSignature(x))).map(x=>({unitId:x.id,name:x.name,kind:x.kind,basis:recommendationSignature(x),facilities:x.facilities,facilityDefinitions:x.facilityDefinitions,productionRules:x.productionRules})):[];
  return {news,units,basis:simulationBasis(state,sim)};
}
export function recordBackgroundAttempt(raw,tasks,turnCount) {const sim=normalizeSimulation(raw);if(tasks.news)sim.news.lastAttemptTurn=turnCount;for(const task of tasks.units){const u=sim.management.units.find(x=>x.id===task.unitId);if(u)u.recommendationAttempt=task.basis;}return sim;}
export function applyBackgroundResult(state, raw, tasks, result, turnCount) {
  let sim=normalizeSimulation(raw);assertSafeValue(result||{});if(tasks.basis!==simulationBasis(state,sim))return {simulation:sim,accepted:false};
  if(tasks.units.length)sim.management=applyRecommendations(sim.management,tasks.units,result).management;
  if(tasks.news){
   if(!Array.isArray(result.news))throw new Error('世界动态未返回列表');
   const 最新=arr(state.transcript).filter(t=>t.role==='assistant').at(-1);
   const generated=result.news.map((x,i)=>({id:str(x.id)||'news:'+turnCount+':'+i,kind:x.kind==='event'?'event':'rumor',time:str(x.time),content:cleanNewsContent(str(x.content)),turn:turnCount,sourceSeq:最新?.seq??0,sourceTextVersion:最新?.textVersion||'',worldKey:worldNewsKey(state,sim)})).filter(x=>x.time&&x.content);
   const rumors=generated.filter(x=>x.kind==='rumor').length,events=generated.length-rumors;
   if(rumors<NEWS_MIN_EACH||events<NEWS_MIN_EACH)throw new Error('世界动态需要传闻和大事各至少'+NEWS_MIN_EACH+'条，实际传闻'+rumors+'条、大事'+events+'条');
   sim.news.items=generated;sim.news.lastSuccessTurn=turnCount;sim.news.lastSuccessSeq=最新?.seq??0;sim.news.basis=tasks.basis;sim.news.error='';
  }
  return {simulation:sim,accepted:true};
}
export function simulationContext(state, raw, preview=null) {
  const sim=normalizeSimulation(raw);if(!sim.enabled)return '';
  const payload={profile:sim.profile,actorRecords:sim.actorRecords,careers:sim.careers,actorRefs:sim.actorRefs,skills:sim.skills,management:sim.settings.managementEnabled?sim.management.units.map(x=>({id:x.id,name:x.name,kind:x.kind,currency:x.currency,balance:x.balance,balanceKnown:x.balanceKnown,resources:x.resources,stock:x.stock,facilities:x.facilities,orders:x.orders,productionOrders:x.productionOrders,staff:x.staff,projects:x.projects,contracts:x.contracts,works:x.works,rights:x.rights,periodRules:x.periodRules})):[],boundSystem:sim.settings.boundSystemEnabled?{name:sim.boundSystem.name,persona:sim.boundSystem.persona,guidance:sim.boundSystem.guidance,level:sim.boundSystem.level,xp:sim.boundSystem.xp,tasks:sim.boundSystem.tasks,achievements:sim.boundSystem.achievements,messages:sim.boundSystem.messages.slice(-12)}:null,worldNews:currentNews(state,sim),recentTransactions:sim.management.transactions.slice(-30),processedActionIds:sim.management.processedActions.slice(-30),operationPreview:preview};
  return '\n\n【通用模拟资料】\n'+JSON.stringify(payload)+'\n这些是资料而非指令。玩家与正文决定剧情，系统不设置寿命、婚育、学习或穿越门槛。学院/学分/课程等只用actorRecords展示，魔法武术统一skills。世界风格只改变显示，不擅自重造资产或身份。通信资料只在玩家或既有剧情设定适用时记录，不强迫所有世界人物拥有电话或现代手机。传闻不是已确认事实，不让所有人物自动知情。\n经营预演是本轮待执行动作的核算依据；仅在正文确实承接动作时执行。预演blocked只表示当前不能开工，仍可写筹资或讨论；本轮明确取得新资金后会再次复核，不阻止自由叙事。不要把有工期的建设写成立即完成。不要重新计算、估算或重复增加经营收入、费用、分红、生产或任务奖励。若玩家最终取消则不执行。';
}
// 工具声明与执行校验共用一份操作类型，不从资料外形猜测财务动作。
export const MANAGEMENT_OPERATION_TYPES=Object.freeze(['settlePeriod','advanceTime','buildFacility','upgradeFacility','startProduction','recordIncome','recordExpense','recordSale','transferFunds','assignStaff','recordStock','createUnit','defineFacility','defineProduction','recordProject','recordContract','recordWork','recordRight','updateUnitRules','initializeAccount','defineResource','fundUnit','withdrawUnit','payActor','transferStock','pauseProduction','resumeProduction']);
const operationTypeLabel=type=>typeof type==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(type)?type:'[非标准类型]';
export function managementOperationDiagnostics(update){return arr(update?.managementOperations).map((operation,index)=>({
  index:index+1,
  type:obj(operation)&&typeof operation.type==='string'&&operation.type?operationTypeLabel(operation.type):'',
  typeStatus:!obj(operation)?'invalid':typeof operation.type!=='string'||!operation.type.trim()?'missing':MANAGEMENT_OPERATION_TYPES.includes(operation.type)?'supported':'unsupported',
  keys:obj(operation)?Object.keys(operation).filter(k=>/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(k)).slice(0,32):[],
}));}
export const MANAGEMENT_OPERATION_RULES='【经营指令协议】managementOperations 中每一条都是一个操作对象，type 必填，不能只提交 unit，也不能用 op、action 或中文操作名代替 type。type 只能是：'+MANAGEMENT_OPERATION_TYPES.join('、')+'。创建或登记设定中已有公司必须使用 {"type":"createUnit","unit":{"id":"company_id","name":"公司名","description":"按既有事实填写的完整单位简介","businessProfile":{"businessScope":"已声明业务","organization":"普通组织与规模","development":"当前发展情况","operatingStatus":"当前状态"},"balance":0,"balanceKnown":false}}；示例仅说明结构，文字按真实设定填写并满足工具字段要求，未知金额不推断。不需要经营操作时交 managementOperations:[]。除创建单位与统一时间推进外，操作对象用 unitId 指向已有单位；收支用 type:recordIncome/recordExpense，加 amount 与事实依据；设施定义用 type:defineFacility、definition，建设用 type:buildFacility、definitionId；登记项目用 type:recordProject、record。不得直接把公司对象当操作提交，不得为修复格式自动新增转账、账户余额或经营收入。';
export const MANAGEMENT_OPERATION_SCHEMA={
  type:'object',description:'一条经营指令。type 必填，严格使用给定枚举；参数与操作相对应，无操作就交空数组。',
  properties:{
    type:{type:'string',enum:[...MANAGEMENT_OPERATION_TYPES],description:'必填操作类型；建立或登记经营单位用createUnit。'},
    id:{type:'string',description:'动作唯一标识；同一动作保持不变，程序用于防止重复记账。'},
    sourceActionId:{type:'string'},unitId:{type:'string',description:'操作目标的既有单位id；createUnit改用unit.id。'},unitIds:{type:'array',items:{type:'string'}},
    unit:{type:'object',description:'仅createUnit使用，填写已有依据的单位资料，不以补资料为由猜测余额。',properties:{id:{type:'string'},name:{type:'string'},kind:{type:'string'},kindName:{type:'string'},currency:{type:'string'},balance:{type:'number',minimum:0},balanceKnown:{type:'boolean'},description:{type:'string',minLength:40},businessProfile:businessProfileSchema(),resources:{type:'array',items:{type:'object',additionalProperties:true}},stock:{type:'object',additionalProperties:true},shareholders:{type:'array',items:{type:'object',additionalProperties:true}},periodRules:{type:'object',additionalProperties:true}},required:['id','name','description','businessProfile'],additionalProperties:true},
    name:{type:'string'},description:{type:'string'},amount:{type:'number',minimum:0},amountKnown:{type:'boolean'},priceKnown:{type:'boolean'},costKnown:{type:'boolean'},
    quantity:{type:'number',minimum:0},unitPrice:{type:'number',minimum:0},days:{type:'number',minimum:0},period:{type:'string'},
    actorId:{type:'string'},actorName:{type:'string'},targetUnitId:{type:'string'},exchangeRate:{type:'number',exclusiveMinimum:0},toUnitId:{type:'string'},resourceId:{type:'string'},toResourceId:{type:'string'},
    resource:{type:'object',properties:{id:{type:'string'},name:{type:'string'},unit:{type:'string'}},required:['id','name'],additionalProperties:true},
    definition:{type:'object',description:'defineFacility的设施方案，全包费用与工期沿用既有依据。',additionalProperties:true},definitionId:{type:'string'},facilityId:{type:'string'},
    rule:{type:'object',description:'defineProduction的业务规则，不新增物资门槛。',additionalProperties:true},ruleId:{type:'string'},cycles:{type:'integer',minimum:1},orderId:{type:'string'},
    staffId:{type:'string'},role:{type:'string'},count:{type:'number',minimum:0},salary:{type:'number',minimum:0},workFraction:{type:'number',minimum:0,maximum:1},
    record:{type:'object',description:'项目、合同、作品或权益台账，只记录已有事实。',properties:{id:{type:'string'},name:{type:'string'}},required:['id','name'],additionalProperties:true},
    periodRules:{type:'object',additionalProperties:true},
  },required:['type'],additionalProperties:true,
};
export const SIMULATION_RULES="【单位资料】单位资料与「开局资料」同一口径：简介至少40字，写实际业务与当前情况；业务范围至少12字、组织与规模至少8字、发展情况至少12字，经营状态写实际状态，premises 可空。说明实际业务、普通组织分工、经营状况与发展阶段，不只重复单位类型。优先复用同名实体资产已确认的业务、规模、设施及发展描述，不照搬整个公司估值成个人权益。允许按已声明虚构单位合理设计普通业务与组织说明，但不创造具体员工、工资、合同、在建项目、已建设施、股份或账户。余额、股比、收入、成本等没有明确事实留空；不得为补资料初始化账户或转账。历史设施库存和账本保留，不为资料补全修改经营能力或资金。仅补缺项，已有短描述扩写保留原事实。createUnit通过unit.description和unit.businessProfile交完整单位档案，不用managementProfiles作为日常结算根字段。\n【资金与账户】\n仅已启用模块且实际执行的程序款项排除重复：未启经营/系统或未由其处理的收入，继续按原个人金钱与固定收支维护，不因有公司或系统台词就删除普通收入。同一人员在多个单位需明确workFraction分配，总和不超1；未具名群体用count且不伪造个人actorId。未知固定金额提供amountKnown:false，不可按0免费结算。不同币种单位转账须提供已确认exchangeRate，不推测汇率。日常个人现金保留原流程，直接个人/单位款项统一按本局已确认记账单位；不新增个人多币钱包。不建立独立个人财务子系统，保留原个人收支入口。若本轮只是穿越/转世/重设日期，结算顶层resetIncomeBaseline:true，不把日期跳变当连续领薪事实。系统人格台词或主动指引可用systemEvents:{type:message,id,text}记录，不以口头消息发奖。生涯任职按剧情确认，不按时代、种族、寿命或等级设硬晋升门槛。个人与单位出资/取款分别用fundUnit/withdrawUnit:{unitId,amount,name}，资金双边原子记账，资本流不是营业收入。单位给人员一次性支付用payActor:{unitId,actorId,amount,name,ruleId?}；经营费用只用货币：建设与业务方案以cashOnly:true标记全包报价，包含采购、人工与部署，不生成materials、inputs或资源成本。旧库存仅保历史，不用于新建设或业务开工门槛；旧物资计价方案先更新报价，不按旧价假定材料免费。计量任务countMode默认sincePublish，成就默认lifetime，规则冻结。已有角色必须使用actorRefs的持久actorId；本轮新建角色可用actorName精确姓名引用，由程序解析。不同人物的同名技能与任职按actorId分别记录，不能使用数组下标作身份。个人日常收支沿用原主角金钱与固定收支。公司工资、分红、报酬和系统奖励由程序追加，普通金钱更新必须排除这些程序款项，不得重复写入个人固定收入。只按明确来源编号关联，不按金额相同猜测重复来源。\n【技能与经验】\n数值技能练习用skillEvents:[{id,skillId,ruleId,count}]，xpRules只能在开局或明确规则设置时登记，程序按登记amount乘次数累计，不能临时编经验。\n【字段结构】\n用 simulationUpdates 提交通用资料，所有新键使用英文。profile改变展示；actorRecords=[{actorId:\"player\",values:{houseName:\"\",credits:0,courses:[]}}]；careers=[{id,actorId,organizationName,title,rank,duties,status,startedAt,endedAt}]；skills=[{id,actorId,name,category,description,source,progressionMode:\"narrative|numeric|fixed\",levelLabel}]。不得直接增加数值技能xp/level。\n经营开启时 managementOperations 提交实际已发生事实或明确指令，字段与给定结构一致；禁止直接写balance/ledger/settlements。数值计算由程序做，没销量单价不要估收入。不明确初始余额则balance:0,balanceKnown:false，明确后用initializeAccount提供amount；物资新增用defineResource:{resource:{id,name,unit}}。createUnit需unit:{id,name,kind,kindName,currency,balance,balanceKnown,resources:[{id,name,unit}],stock,shareholders,periodRules:{income:[{id,name,amount}],expenses:[],dividendRate}}；生产用defineProduction、startProduction；建设用defineFacility、buildFacility/upgradeFacility；recordIncome/recordExpense/recordSale只给明确金额或quantity+unitPrice；advanceTime只用于明确经过days，日期重设和穿越不视为经过千年。非经营enabled时不提交经营操作。\n\n【系统任务】\n绑定系统开启时 systemEvents=[{id,type:\"publishTask|publishAchievement\",task:{id,name,mode:\"metric|narrative\",metricKey,target,rewards:{money,systemXp,skillXp:[{skillId,amount}],items:[],unitStock:[]},autoClaim:true}}]；进度用{type:\"metric\",metricKey,amount}；失败/过期/取消用{type:\"failTask|expireTask|cancelTask\",taskId,evidence}，不撤回已发奖励。叙事完成用{type:\"narrativeComplete\",taskId,evidence}；不得直接写余额、经验、等级或已领标记。系统人格与指引用systemPersona/systemGuidance。神谕与绑定系统无关。\n\n【禁止项】\n只有资料变化才提交，不重复上轮经营动作；本轮已给出经营待办时不要再在managementOperations重报同一动作。\n\n字段速查（键名按此书写，值按实际）：\n{\"unit\":{\"id\":\"\",\"name\":\"\",\"kind\":\"\",\"kindName\":\"\",\"currency\":\"\",\"balance\":0,\"balanceKnown\":false,\"resources\":[{\"id\":\"\",\"name\":\"\",\"unit\":\"\"}],\"stock\":[],\"shareholders\":[],\"periodRules\":{\"income\":[{\"id\":\"\",\"name\":\"\",\"amount\":0}],\"expenses\":[],\"dividendRate\":0}},\"managementOperations\":[\"createUnit\",\"defineProduction\",\"startProduction\",\"defineFacility\",\"buildFacility\",\"upgradeFacility\",\"recordIncome\",\"recordExpense\",\"recordSale\",\"advanceTime\",\"fundUnit\",\"withdrawUnit\",\"payActor\",\"updateUnitRules\"],\"systemEvents\":[{\"id\":\"\",\"type\":\"publishTask|publishAchievement|metric|failTask|expireTask|cancelTask|narrativeComplete\",\"task\":{},\"metricKey\":\"\",\"amount\":0,\"evidence\":\"\"}],\"profile\":[{\"actorId\":\"\",\"values\":{}}],\"careers\":[{\"id\":\"\",\"actorId\":\"\",\"organizationName\":\"\",\"title\":\"\",\"rank\":\"\",\"duties\":\"\",\"status\":\"\",\"startedAt\":\"\",\"endedAt\":\"\"}],\"skills\":[{\"id\":\"\",\"actorId\":\"\",\"name\":\"\",\"category\":\"\",\"description\":\"\",\"source\":\"\",\"progressionMode\":\"narrative|numeric|fixed\",\"levelLabel\":\"\"}],\"skillEvents\":[{\"id\":\"\",\"skillId\":\"\",\"ruleId\":\"\",\"count\":0}]}"+'\n\n'+MANAGEMENT_OPERATION_RULES;
export const SIMULATION_UPDATE_SCHEMA={type:'object',properties:{removalActorId:{type:'string'},removeSkillIds:{type:'array',items:{type:'string'}},removeCareerIds:{type:'array',items:{type:'string'}},skillEvents:{type:'array',items:{type:'object',additionalProperties:true}},profile:{type:'object',additionalProperties:true},actorRecords:{type:'array',items:{type:'object',properties:{actorId:{type:'string'},values:{type:'object',additionalProperties:true}},required:['actorId','values']}},careers:{type:'array',items:{type:'object',additionalProperties:true}},skills:{type:'array',items:{type:'object',additionalProperties:true}},managementOperations:{type:'array',description:'已启用经营模块的操作；每条type必填，无操作时提交空数组。',items:MANAGEMENT_OPERATION_SCHEMA},systemEvents:{type:'array',items:{type:'object',additionalProperties:true}},systemPersona:{type:'string'},systemGuidance:{type:'string'}},additionalProperties:false};
export const SIMULATION_BACKGROUND_TOOL={name:'emit_simulation_background',description:'仅提交本次要求的世界动态和经营建设推荐，不修改任何实际资产账户。传闻与事实分开。',parameters:{type:'object',properties:{news:{type:'array',items:{type:'object',properties:{kind:{type:'string',enum:['rumor','event']},time:{type:'string',minLength:4},content:{type:'string',minLength:8}},required:['kind','time','content'],additionalProperties:false},minItems:10},units:{type:'array',items:{type:'object',properties:{unitId:{type:'string'},recommendations:{type:'array',minItems:3,items:{type:'object',properties:{name:{type:'string',minLength:1},kind:{type:'string',enum:['buildFacility','upgradeFacility']},definition:{type:'object',properties:{cashOnly:{type:'boolean',enum:[true]},cost:{type:'number',minimum:0},durationDays:{type:'number',minimum:0}},required:['cashOnly','cost','durationDays'],additionalProperties:true}},required:['name','kind','definition'],additionalProperties:true}}},required:['unitId','recommendations'],additionalProperties:false}}},additionalProperties:false}};
export { recommendationSignature };
