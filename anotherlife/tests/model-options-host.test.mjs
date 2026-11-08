import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
const stream=()=> (async function*(){yield{type:'text-delta',index:0,text:'{"ok":true}'};yield{type:'finish',reason:{kind:'stop'}};})();
test('宿主全部辅助槽实际请求继承正文high，覆盖明确单槽设置',async()=>{
 const e=await createHarness({stream});try{
  const s=e.api.defaultState();s.gameId='reasoning-test';s.config.reasoning={body:'high',phone:'low'};
  const slots=['retrieve','settle','summary','weibo','phone','assistant','misc'];
  for(const slot of slots)s.config[slot]={provider:'test',model:'test-model'};
  e.seed(s.gameId,s);
  for(const slot of slots){await e.api.callSlot(s,slot,[{role:'user',content:'普通辅助请求'}],{maxTokens:1024});assert.equal(e.requests.at(-1).reasoningEffort,slot==='phone'?'low':'high');assert.equal(e.requests.at(-1).model,'test-model');}
 }finally{e.cleanup();}
});
test('思考档部分保存与配置保存后不丢辅助设置，直连请求也取共用档位',async()=>{
 const e=await createHarness({stream});try{
  const s=e.api.defaultState();s.gameId='reasoning-save';e.seed(s.gameId,s);
  await e.call('saveReasoning',{gameId:s.gameId,reasoning:{body:'high',phone:'low'}});
  await e.call('saveReasoning',{gameId:s.gameId,reasoning:{retrieve:'medium'}});
  await e.call('saveConfig',{gameId:s.gameId,config:{recentRounds:4}});
  const next=e.getState(s.gameId);assert.equal(next.config.reasoning.body,'high');assert.equal(next.config.reasoning.phone,'low');assert.equal(next.config.reasoning.retrieve,'medium');
  await e.api.callMainModel([{role:'user',content:'独立资料请求'}],{});assert.equal(e.requests.at(-1).reasoningEffort,'high');
 }finally{e.cleanup();}
});

test('旧式自填API请求体同样传递思考档，未设置时不伪造参数',async()=>{const bodies=[];const e=await createHarness({fetchImpl:async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'回复'}}]})};}});try{const s=e.api.defaultState();s.gameId='legacy-reason';s.config.phone={baseURL:'https://example.invalid/v1',model:'legacy-model'};s.config.reasoning={body:'high'};e.seed(s.gameId,s);await e.api.callSlot(s,'phone',[{role:'user',content:'测试'}],{});assert.equal(bodies.at(-1).reasoning_effort,'high');assert.equal(bodies.at(-1).model,'legacy-model');s.config.reasoning.body='';await e.api.callSlot(s,'phone',[{role:'user',content:'测试'}],{});assert.ok(!Object.hasOwn(bodies.at(-1),'reasoning_effort'));}finally{e.cleanup();}});
