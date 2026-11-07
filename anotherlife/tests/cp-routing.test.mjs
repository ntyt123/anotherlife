import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettlementUpdate } from '../lib/settlement-compat.mjs';
import { cpPayload } from '../lib/cp-core.mjs';
import { createHarness, clone } from './harness.mjs';
const keys=['cpUpdates','CP动态','CP更新'];
const body='主角甲和女演员乙合作后，观众为他们成立了CP应援群。';
const update=()=>({partner:'女演员乙',type:'create',evidence:'观众为他们成立了CP应援群。',title:'成立CP党',delta:600,estimated:true,topics:[{title:'合作表现引发关注',comments:[{stance:'CP粉',text:'关注两人的合作。'},{stance:'作品粉',text:'先看作品本身。'},{stance:'路人',text:'粉丝配对不等于恋情。'}]}]});
const state=()=>({protagonist:{姓名:'主角甲',是否艺人:true},world:{},npcs:[]});
test('空CP结果及中文别名登记为专用元数据，不产生归属诊断',()=>{
 for(const key of keys){const s=state(),raw={[key]:[],summary:'日常继续。'},before=clone(raw),diagnostics=[];const out=normalizeSettlementUpdate(s,raw,diagnostics);assert.deepEqual(diagnostics,[],key);assert.deepEqual(out.update[key],[]);assert.deepEqual(raw,before);assert.equal(s.protagonist.cpState,undefined);}
});
test('非空CP结果保留给专用通道，普通资料仍正常归一',()=>{
 for(const key of keys){const raw={[key]:[update()],protagonist:{当前状态:'日常工作'},summary:'合作继续。'},diagnostics=[];const out=normalizeSettlementUpdate(state(),raw,diagnostics);assert.deepEqual(diagnostics,[]);assert.deepEqual(cpPayload(out.update),raw[key]);assert.equal(out.update.protagonist.当前状态,'日常工作');}
});
test('只登记合法CP键，拼错或真正未知的字段仍保留拒绝诊断',()=>{
 const diagnostics=[];const raw={cpUpdatez:[],完全未知的资料:'原始值'};normalizeSettlementUpdate(state(),raw,diagnostics);assert.equal(diagnostics.length,2);assert.ok(diagnostics.some(d=>JSON.stringify(d).includes('cpUpdatez')));assert.ok(diagnostics.some(d=>JSON.stringify(d).includes('完全未知的资料')));
});
const reply=value=>(async function*(){yield{type:'text-delta',index:0,text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}};})();
async function rig({key='cpUpdates',payload=[],story='主角甲继续整理日常工作资料。',extra={}}={}){
 const e=await createHarness({stream:r=>String(r.system).includes('后台变量结算器')?reply({world:{当前日期时间:'2026年11月6日 13:00'},[key]:payload,summary:'公开活动继续。',...extra}):reply(story)});
 const s=e.api.defaultState();s.gameId='test';s.phase='play';s.simulation={enabled:false};s.config.toolMode=false;s.config.scentByAI=false;s.config.settle={provider:'test',model:'test'};s.protagonist.姓名='主角甲';s.protagonist.性别='男';s.protagonist.年龄=30;s.protagonist.是否艺人=true;s.world.当前日期时间='2026年11月6日 12:00';s.npcs=[{actorId:'b',姓名:'女演员乙',性别:'女',年龄:29,身份:'演员',外貌:'日常外貌',表性格:'直率',里性格:'认真',背景:'从事表演工作',穿着:{}}];s.story.current_message_index=0;s.transcript=[];e.seed('test',s);return e;
}
const latest=s=>s.transcript.filter(t=>t.role==='assistant').at(-1);
const noRoutingWarning=entry=>{assert.ok(!(entry.issues||[]).some(i=>i.step==='资料'&&/资料更新已跳过|无法确定字段归属/.test(i.why)),JSON.stringify(entry.issues));assert.ok(!JSON.stringify(entry).includes('无法确定字段归属'));};
test('实际首轮返回cpUpdates空数组，不再保存资料跳过误报',async()=>{
 const e=await rig();try{await e.call('generateStory',{gameId:'test',input:'继续'});const s=e.getState('test');noRoutingWarning(latest(s));assert.equal(s.protagonist.cpState,undefined);}finally{e.cleanup();}
});
test('实际主结算三种CP字段均可应用人数及话题，且无资料误报',async()=>{
 for(const key of keys){const e=await rig({key,payload:[update()],story:body});try{await e.call('generateStory',{gameId:'test',input:'继续'});const s=e.getState('test');noRoutingWarning(latest(s));assert.equal(s.protagonist.cpState.pairs[0].count,600);assert.equal(s.protagonist.cpState.pairs[0].events[0].topics.length,1);assert.equal(e.requests.filter(r=>String(r.system).includes('后台变量结算器')).length,1);}finally{e.cleanup();}}
});
test('实际变量重算仍应用CP且不再新增归属误报',async()=>{
 const e=await rig({payload:[update()],story:body});try{await e.call('generateStory',{gameId:'test',input:'继续'});await e.call('regenerateLatestVars',{gameId:'test'});const s=e.getState('test');noRoutingWarning(latest(s));assert.equal(s.protagonist.cpState.pairs[0].count,600);assert.equal(s.protagonist.cpState.pairs[0].events.length,1);}finally{e.cleanup();}
});
test('CP格式错误仍由专用通道提示，不能因去掉误报而吞掉真实错误',async()=>{
 const e=await rig({payload:{bad:true}});try{await e.call('generateStory',{gameId:'test',input:'继续'});const s=e.getState('test');noRoutingWarning(latest(s));assert.ok(latest(s).issues.some(i=>i.step==='CP'&&i.why.includes('格式不可识别')));assert.equal(s.protagonist.cpState,undefined);}finally{e.cleanup();}
});
test('有效CP与未知资料同时提交时，仅未知资料告警，CP继续应用',async()=>{
 const e=await rig({payload:[update()],story:body,extra:{完全未知的资料:'保留诊断'}});try{await e.call('generateStory',{gameId:'test',input:'继续'});const s=e.getState('test'),entry=latest(s),serialized=JSON.stringify(entry);assert.equal(s.protagonist.cpState.pairs[0].count,600);assert.ok(entry.issues.some(i=>i.step==='资料'));assert.ok(serialized.includes('完全未知的资料'));assert.ok(!serialized.includes('cpUpdates'));}finally{e.cleanup();}
});
