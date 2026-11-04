import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {loadClient} from './client-harness.mjs';
import {createSimulation,updateSimulationSettings} from '../lib/generic-simulation.mjs';
const walk=(node,out=[])=>{if(Array.isArray(node))node.forEach(n=>walk(n,out));else if(node&&typeof node==='object'){out.push(node);walk(node.kids||[],out);}return out;};
const words=node=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(words).join(''):node&&typeof node==='object'?words(node.kids||[]):'';
const basic=tree=>walk(tree).find(n=>n.props?.className==='sim-panel'&&n.kids?.some(k=>k?.props?.className==='sim-panel-h'&&words(k)==='👤 基本信息'));
async function fixture({enabled=true}={}){
 const e=await createHarness(),state=e.api.defaultState();e.cleanup();
 state.gameId='test';state.phase='play';state.protagonist.姓名='样本主角';
 state.npcs=[{actorId:'npc:one',姓名:'样本角色',性别:'男',年龄:30,身份:'教师',种族:'汉族',联系方式:{电话:'13810007919'}},{actorId:'npc:two',姓名:'另一角色',性别:'男',年龄:35,身份:'医生'}];
 state.simulation=updateSimulationSettings(createSimulation(),{});state.simulation.enabled=enabled;
 state.simulation.profile.roleLabel='职业';
 state.simulation.careers=[{id:'one',actorId:'npc:one',title:'教师',organizationName:'样本学校',duties:'教学工作',history:[{title:'助教',organizationName:'旧学校'}]},{id:'two',actorId:'npc:two',title:'医生',organizationName:'样本医院'}];
 const client=loadClient();client.render().functions.initLoaded(state);client.render().functions.openNpcByActorId('npc:one');return client;
}
test('职业标题与列表合并进角色基本信息，顶部不再重复显示',async()=>{
 const c=await fixture(),tree=c.render().functions.npcModalView(),panel=basic(tree);assert.ok(panel);
 const careers=walk(tree).filter(n=>n.props?.mode==='careers');assert.equal(careers.length,1);assert.ok(walk(panel).includes(careers[0]));assert.equal(careers[0].props.actorId,'npc:one');
 const heading=walk(panel).find(n=>n.props?.className==='sim-career-heading');assert.ok(heading);assert.equal(words(heading),'职业');
 assert.ok(words(panel).includes('13810007919'));assert.equal(walk(tree).filter(n=>n.props?.mode==='records').length,1);
});
test('切换角色后职业仍在对应基本信息内，读取不修改角色数据',async()=>{
 const c=await fixture(),before=JSON.stringify(c.render().functions.getState());c.render().functions.openNpcByActorId('npc:two');const f=c.render().functions,tree=f.npcModalView(),careers=walk(basic(tree)).filter(n=>n.props?.mode==='careers');
 assert.equal(careers.length,1);assert.equal(careers[0].props.actorId,'npc:two');assert.equal(JSON.stringify(f.getState()),before);
});
test('编辑角色时职业仍在基本信息内且只有一份',async()=>{
 const c=await fixture();const tree=c.render().functions.npcModalView();walk(tree).find(n=>n.props?.title==='修改这个角色的设定').props.onClick();const edited=c.render().functions.npcModalView();assert.equal(walk(edited).filter(n=>n.props?.mode==='careers').length,1);assert.equal(walk(basic(edited)).filter(n=>n.props?.mode==='careers').length,1);
});
test('通用系统关闭时不额外显示职业区，基本身份仍保留',async()=>{
 const c=await fixture({enabled:false}),tree=c.render().functions.npcModalView();assert.ok(basic(tree));assert.equal(walk(tree).some(n=>n.props?.mode==='careers'),false);assert.equal(walk(tree).some(n=>n.props?.className==='sim-career-heading'),false);
});

test('职位紧跟种族，位于头像左侧双列字段区而不是外貌下方',async()=>{
 const c=await fixture(),tree=c.render().functions.npcModalView(),panel=basic(tree);const grid=walk(panel).find(n=>n.props?.className==='sim-grid'&&walk(n).some(x=>x.props?.mode==='careers'));assert.ok(grid);const fields=grid.kids.flat(Infinity),raceIndex=fields.findIndex(n=>n?.props?.label==='种族');assert.ok(raceIndex>=0);assert.equal(fields[raceIndex+1].props.className,'sim-field sim-basic-careers');assert.equal(walk(fields[raceIndex+1]).filter(n=>n.props?.mode==='careers').length,1);
});
test('没有种族字段时职位追加在基础字段末尾，仍不重复',async()=>{
 const c=await fixture(),state=JSON.parse(JSON.stringify(c.render().functions.getState()));delete state.npcs[0].种族;c.render().functions.initLoaded(state);c.render().functions.openNpcByActorId('npc:one');const tree=c.render().functions.npcModalView(),grid=walk(basic(tree)).find(n=>n.props?.className==='sim-grid'&&walk(n).some(x=>x.props?.mode==='careers'));assert.ok(grid);assert.equal(grid.kids.flat(Infinity).at(-1).props.className,'sim-field sim-basic-careers');assert.equal(walk(tree).filter(n=>n.props?.mode==='careers').length,1);
});
