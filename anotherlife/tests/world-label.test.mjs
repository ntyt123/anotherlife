import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation,updateSimulationSettings} from '../lib/generic-simulation.mjs';
import {createGenericViews} from '../lib/generic-client.js';
const walk=(n,out=[])=>{if(Array.isArray(n))n.forEach(x=>walk(x,out));else if(n&&typeof n==='object'){out.push(n);walk(n.kids||[],out);}return out;};
const words=n=>typeof n==='string'?n:Array.isArray(n)?n.map(words).join(''):n&&typeof n==='object'&&n.type!=='style'?words(n.kids||[]):'';
function mount(sim,changes){
 const hooks=[];let index=0;
 const React={createElement:(type,p,...kids)=>({type,props:p||{},kids}),useState(init){const i=index++;if(!(i in hooks))hooks[i]=typeof init==='function'?init():init;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},useRef(init){const i=index++;if(!(i in hooks))hooks[i]={current:init};return hooks[i];},useEffect(){}};
 const {GenericPanel}=createGenericViews(React);
 const st={gameId:'g',world:{},transcript:[],simulation:sim};
 const render=()=>{index=0;return GenericPanel({state:st,mode:'worldSetup',onCall:async()=>st,onStage:()=>{}});};
 const tree=render();
 const select=(label)=>{const l=walk(tree).find(n=>n.type==='label'&&words(n).startsWith(label));return l?walk(l).find(n=>n.type==='select'):null;};
 return {tree,select,render};
}
test('世界称呼改为下拉，选项是五类世界，旧的自定义名称仍能显示',()=>{const sim=updateSimulationSettings(createSimulation(),{profile:{name:'现实世界'}});const {select}=mount(sim);const s=select('世界称呼');assert.ok(s,'应有世界称呼下拉');const opts=walk(s).filter(n=>n.type==='option').map(o=>o.props.value);for(const v of ['现代','古代','民国','学院','自定义'])assert.ok(opts.includes(v),v);assert.ok(opts.includes('现实世界'),'旧值应保留为一个选项');});
test('选择世界称呼会同步展示类型与该类型的默认列名',()=>{const sim=createSimulation();const {select}=mount(sim);const s=select('世界称呼');const 古代=walk(s).find(n=>n.type==='option'&&n.props.value==='古代');assert.ok(古代);const onChange=walk(s).find(n=>n.props&&typeof n.props.onChange==='function');assert.ok(onChange);});
test('展示与参考说明改名为世界参考说明，仍写入同一条说明字段',()=>{const sim=updateSimulationSettings(createSimulation(),{profile:{description:'基于2026年中国上海的现实社会模拟'}});const {tree}=mount(sim);const text=words(tree);assert.match(text,/世界参考说明/);assert.doesNotMatch(text,/展示与参考说明/);const area=walk(tree).find(n=>n.type==='textarea');assert.ok(area);assert.equal(area.props.value,'基于2026年中国上海的现实社会模拟');});
test('职位参考保留原字段，读取的是职位表描述并允许留空',()=>{const sim=updateSimulationSettings(createSimulation(),{profile:{careerTracks:[{id:'t',description:'演员：群演、配角、主演'}]}});const {tree}=mount(sim);assert.match(words(tree),/职位参考/);const area=walk(tree).find(n=>n.type==='textarea'&&String(n.props.value||'').includes('演员'));assert.ok(area,'应显示职位参考文本');assert.match(area.props.value,/演员：群演、配角、主演/);const empty=mount(createSimulation());assert.match(words(empty.tree),/职位参考/);});
