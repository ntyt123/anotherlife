import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
const marker='测试用衣料纹理参考标记';
const reference='【衣物详情】\n'+marker+'，只用于普通衣物简介。\n【气味文案】\n测试用气息参考标记，不改数值。';
const card={character_book:{entries:[{comment:'[模拟器参考] 鞋袜详情写作',content:reference},{comment:'[模拟器参考] 不相关资料',content:'不应进入详情的另一本书标记'}]}};
const textOf=v=>typeof v==='string'?v:Array.isArray(v)?v.map(p=>p.text||'').join(''):'';
async function env(customCard){
 const e=await createHarness({card:customCard,stream:req=>(async function*(){
  const user=(req.messages||[]).filter(m=>m.role==='user').at(-1),input=JSON.parse(textOf(user?.content)||'{}');
  const value={items:(input.items||[]).map(x=>({id:x.id,text:'衣料已有穿着痕迹，留下清晰的织物气息。'}))};
  yield{type:'text-delta',index:0,text:JSON.stringify(value)};yield{type:'finish',reason:{kind:'stop'}};
 })()});
 const s=e.api.defaultState();s.phase='play';s.config.scentByAI=true;s.config.settle={provider:'test',model:'test'};s.world.当前日期时间='2026年11月6日 12:00';
 Object.assign(s.protagonist,{姓名:'主角',性别:'男',年龄:30,生日:'1996-01-01'});
 s.npcs=[{actorId:'wear-peer',姓名:'文员甲',性别:'女',年龄:30,生日:'1996-01-01',穿着:Object.fromEntries(['袜子','内衣','内裤'].map(k=>[k,{物品:'棉质'+k,材质:'棉',气味:'旧的衣物记录。',气味强度:69,穿着小时:23}]))}];
 s.transcript=[{role:'assistant',seq:0,body:'文员甲来取资料。',diffs:[],issues:[]}];s.story.current_message_index=1;e.seed('test',s);return e;
}
test('独立气味同步实际请求能读插件自带物性参考且仍只调用一次',async()=>{const e=await env();try{await e.call('refreshScentText',{gameId:'test'});assert.equal(e.requests.length,1);const request=JSON.stringify(e.requests[0]);assert.ok(request.includes('受压后的纤维'));assert.ok(request.includes('不做性癖化描写'));const s=e.getState('test');for(const k of['袜子','内衣','内裤']){assert.equal(s.npcs[0].穿着[k].气味强度,69);assert.equal(s.npcs[0].穿着[k].穿着小时,23);}}finally{e.cleanup();}});
test('专用世界书优先于默认资料且不带入其他书',async()=>{const e=await env(card);try{await e.call('refreshScentText',{gameId:'test'});const req=JSON.stringify(e.requests[0]);assert.ok(req.includes(marker));assert.ok(req.includes('测试用气息参考标记'));assert.ok(!req.includes('受压后的纤维'));assert.ok(!req.includes('不应进入详情的另一本书标记'));assert.equal(e.requests.length,1);}finally{e.cleanup();}});
test('主结算获取详情参考而正文提示不包含它',async()=>{const e=await env(card);try{const s=e.getState('test');const settle=await e.api.settleSystemPrompt(s,'test','文员甲来取资料。');assert.ok(settle.includes(marker));const story=await e.api.storySystemPrompt(s,'文员甲来取资料。',{all:true});assert.ok(!String(story).includes(marker));assert.equal(e.requests.length,0);}finally{e.cleanup();}});
test('未成年不因接入物性参考而进入独立气味生成',async()=>{const e=await env(card);try{const s=e.getState('test');s.npcs[0].年龄=16;s.npcs[0].生日='2010-01-01';e.seed('test',s);await e.call('refreshScentText',{gameId:'test'});assert.equal(e.requests.length,0);assert.equal(e.getState('test').npcs[0].穿着.袜子.气味,'旧的衣物记录。');}finally{e.cleanup();}});
test('年龄未知不被参考内容当作成年',async()=>{const e=await env(card);try{const s=e.getState('test');delete s.npcs[0].年龄;delete s.npcs[0].生日;e.seed('test',s);await e.call('refreshScentText',{gameId:'test'});assert.equal(e.requests.length,0);}finally{e.cleanup();}});
