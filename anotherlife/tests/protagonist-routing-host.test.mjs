import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {createSimulation,updateSimulationSettings} from '../lib/generic-simulation.mjs';
const reply=value=>(async function*(){yield{type:'text-delta',index:0,text:typeof value==='string'?value:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}};})();
const tool=(name,value)=>(async function*(){yield{type:'tool-call-delta',id:name,index:0,name,argumentsDelta:JSON.stringify(value)};yield{type:'finish',reason:{kind:'tool-calls'}};})();
const wear=Object.fromEntries(['头部','上衣','下衣','袜子','鞋子','饰品'].map(k=>[k,{物品:k+'日常用品',稀有度:'N',状态:'整齐',简介:'平日里一直使用的普通物品'}]));
async function rig({structured=false,simulation=false,payload={chars:[{姓名:'林原',当前状态:'读完留言'}]}}={}){
 let update=payload;
 const e=await createHarness({stream:request=>{
  if(String(request.system).includes('后台变量结算器'))return structured?tool('emit_state_update',{summary:'查看留言后留在原地。',...update}):reply({summary:'查看留言后留在原地。',...update});
  if((request.tools||[]).some(t=>t.name==='complete_records'))return tool('complete_records',{chars:[{姓名:'林原',穿着:wear}],profiles:[]});
  if((request.tools||[]).some(t=>t.name==='game'))return tool('game',{game_content:'林原读完留言，仍坐在桌旁。',think:'',summary:'',options:[]});
  return reply('林原读完留言，仍坐在桌旁。');
 }});
 const s=e.api.defaultState();s.gameId='test';s.phase='play';s.config.toolMode=structured;s.config.scentByAI=false;s.config.settle={provider:'test',model:'test'};
 Object.assign(s.protagonist,{姓名:'林原',性别:'男',年龄:26,是否艺人:false,当前状态:'原状态',金钱:1000,穿着:JSON.parse(JSON.stringify(wear))});
 s.world.当前日期时间='2026年11月16日 12:00';s.world.当前地点='住所';s.npcs=[];s.relationships=[];
 s.simulation=simulation?updateSimulationSettings(createSimulation(),{settings:{worldNewsEnabled:false,managementEnabled:false,boundSystemEnabled:false}}):{enabled:false};s.simulation.setupReady=true;
 s.story.current_message_index=1;s.transcript=[{seq:0,role:'assistant',body:'开局。',diffs:[],options:[],issues:[]}];e.seed('test',s);return{e,set:p=>{update=p;}};
}
for(const structured of[false,true])test('正式'+(structured?'工具':'JSON')+'结算不新增主角NPC，状态归主角',async()=>{const{e}=await rig({structured});try{const s=await e.call('generateStory',{gameId:'test',input:'查看留言。'});assert.equal(s.protagonist.当前状态,'读完留言');assert.equal(s.npcs.length,0);assert.equal(s.protagonist.金钱,1000);assert.match(s.transcript.at(-1).body,/林原读完留言/);const calls=e.requests.filter(r=>String(r.system).includes('后台变量结算器'));assert.equal(calls.length,1);assert.match(calls[0].tools[0].parameters.properties.chars.description,/仅NPC/);assert.ok(s.transcript.at(-1).diffs.some(d=>d.path?.join('.')==='protagonist.当前状态'));assert.ok(!s.transcript.at(-1).diffs.some(d=>d.path?.[0]==='npcs'));}finally{e.cleanup();}});
for(const simulation of[false,true])test((simulation?'资料重核':'普通重算')+'误投主角反复执行不建副卡，正文与资金保留',async()=>{const{e,set}=await rig({simulation,payload:{protagonist:{当前状态:'首轮状态'}}});try{const first=await e.call('generateStory',{gameId:'test',input:'查看留言。'}),body=first.transcript.at(-1).body;set({chars:[{姓名:'林原',当前状态:'重算状态'}]});await e.call('regenerateLatestVars',{gameId:'test'});const once=e.getState('test').transcript.at(-1).diffs.filter(d=>d.path?.join('.')==='protagonist.当前状态').length;await e.call('regenerateLatestVars',{gameId:'test'});const s=e.getState('test');assert.equal(s.protagonist.当前状态,'重算状态');assert.equal(s.npcs.length,0);assert.equal(s.protagonist.金钱,1000);assert.equal(s.transcript.at(-1).body,body);assert.equal(s.transcript.at(-1).diffs.filter(d=>d.path?.join('.')==='protagonist.当前状态').length,once);if(!simulation)assert.equal(once,1);}finally{e.cleanup();}});
test('正式结算角色别名误投主角同样归位',async()=>{const{e}=await rig({payload:{人物:[{姓名:'林原',当前状态:'别名归位'}]}});try{const s=await e.call('generateStory',{gameId:'test',input:'查看留言。'});assert.equal(s.protagonist.当前状态,'别名归位');assert.equal(s.npcs.length,0);}finally{e.cleanup();}});
test('正式结算主角两通道冲突时不覆盖原状态，合法其他字段仍保存',async()=>{const{e}=await rig({payload:{protagonist:{当前状态:'甲值'},chars:[{姓名:'林原',当前状态:'乙值',健康状况:'正常活动'}]}});try{const s=await e.call('generateStory',{gameId:'test',input:'查看留言。'});assert.equal(s.protagonist.当前状态,'原状态');assert.equal(s.protagonist.健康状况,'正常活动');assert.equal(s.npcs.length,0);assert.ok(s.transcript.at(-1).issues.some(i=>/同一路径|不同值/.test(i.why)));}finally{e.cleanup();}});

test('资料重核误投分流与规范主角回包的可逆差分链一致',async()=>{const results=[];for(const canonical of[false,true]){const{e,set}=await rig({simulation:true,payload:{protagonist:{当前状态:'首轮状态'}}});try{await e.call('generateStory',{gameId:'test',input:'查看留言。'});set(canonical?{protagonist:{当前状态:'重核状态'}}:{chars:[{姓名:'林原',当前状态:'重核状态'}]});await e.call('regenerateLatestVars',{gameId:'test'});await e.call('regenerateLatestVars',{gameId:'test'});const s=e.getState('test');results.push({state:s.protagonist.当前状态,npcs:s.npcs.length,diffs:s.transcript.at(-1).diffs.filter(d=>d.path?.join('.')==='protagonist.当前状态').map(d=>({path:d.path,to:d.to,previous:d._prev,had:d._had}))});}finally{e.cleanup();}}assert.deepEqual(results[0],results[1]);assert.equal(results[0].diffs.length,2);});
