import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {createSimulation,updateSimulationSettings} from '../lib/generic-simulation.mjs';
const profile={表性格:'待人平和有礼，交流时会认真倾听对方',里性格:'重视承诺与生活秩序，做决定时先考虑家人的需要',背景:'在普通家庭生活中成长，成年后通过日常工作结识主角，已有职业和关系保持原样。'};
const text=v=>(async function*(){yield{type:'text-delta',index:0,text:typeof v==='string'?v:JSON.stringify(v)};yield{type:'finish',reason:{kind:'stop'}};})();
function initial(e){const s=e.api.defaultState();s.gameId='test';s.phase='character';s.config.settle={provider:'test',model:'test-model'};s.world.世界观类型='现代';s.world.当前日期时间='2026年1月1日';Object.assign(s.protagonist,{姓名:'样本主角',性别:'男',生日:'1990-01-01',身份:'普通职员',金钱:1234,人物关系:'父亲样本父亲，退休在家。'});s.simulation=updateSimulationSettings(createSimulation(),{});s.npcs=[];return s;}
async function run(castResponse){
 const e=await createHarness({stream:o=>{const n=(o.tools||[]).map(x=>x.name);if(n.includes('emit_parsed_json'))return text(castResponse);if(n.includes('complete_records'))return text({chars:[],profiles:[]});return text({});}});
 const s=initial(e);e.seed('test',s);
 let result=null,error=null;
 try{result=await e.call('prepareCreation',{gameId:'test',sourceText:'主角与父亲同住。',discover:true});}catch(err){error=err;}
 return {e,result,error,s};
}
test('名册用 npcs／chars／人物 等别名返回时照常建档，不再报“尚未解析成功”',async()=>{for(const key of ['npcs','chars','人物']){const {e,error}=await run({[key]:[{姓名:'样本父亲',性别:'男',与主角关系:'父亲',...profile}]});try{assert.equal(error,null,error&&error.message);const st=e.getState('test');assert.equal(st.npcs.some(n=>n.姓名==='样本父亲'),true,key);}finally{e.cleanup();}}});
test('名册为空数组但仍缺少已声明亲属时，明确报缺项而不是笼统失败',async()=>{const {e,result}=await run({角色:[]});try{const creation=result?.simulation?.creation||{},warnings=(creation.warnings||[]).join('；');assert.ok(warnings,'应有非阻断缺项提醒');assert.doesNotMatch(warnings,/尚未解析成功/);assert.match(warnings,/父亲/);assert.doesNotMatch((creation.issues||[]).join('；'),/缺少关联角色资料：父亲/);}finally{e.cleanup();}});
test('名册只回无法解析的文本时给出可区分的原因，不冒充成功',async()=>{const {e,result}=await run('父亲退休在家，偶尔来住几天。');try{const issues=((result&&result.simulation&&result.simulation.creation&&result.simulation.creation.issues)||[]).join('；');assert.ok(issues,'应有失败原因');assert.match(issues,/无法解析的文本|没有返回人物数组/);}finally{e.cleanup();}});
