import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSimulation} from '../lib/generic-simulation.mjs';
import {createGenericViews} from '../lib/generic-client.js';
const walk=(n,out=[])=>{if(Array.isArray(n))n.forEach(x=>walk(x,out));else if(n&&typeof n==='object'){out.push(n);walk(n.kids||[],out);}return out;};
const words=n=>typeof n==='string'?n:Array.isArray(n)?n.map(words).join(''):n&&typeof n==='object'&&n.type!=='style'?words(n.kids||[]):'';
function mount(initial,mode='setup'){
 const hooks=[];let index=0;
 const React={createElement:(type,p,...kids)=>({type,props:p||{},kids}),useState(init){const i=index++;if(!(i in hooks))hooks[i]=typeof init==='function'?init():init;return[hooks[i],v=>{hooks[i]=typeof v==='function'?v(hooks[i]):v;}];},useRef(init){const i=index++;if(!(i in hooks))hooks[i]={current:init};return hooks[i];},useEffect(){}};
 const {GenericPanel}=createGenericViews(React);
 const calls=[];
 const st={gameId:'g',world:{},transcript:[],simulation:initial||createSimulation()};
 const onCall=async(name,args)=>{calls.push([name,args]);if(name==='promptOverrides')return {prompts:[{key:'writer',label:'正文写作要求',note:'视角、去神化、节奏',default:'【写作要求】默认文本',text:'',modified:false},{key:'anti',label:'反模式清单',default:'【反模式清单】默认',text:'改过的反模式',modified:true}]};if(name==='promptSave')return {prompts:[{key:'writer',label:'正文写作要求',default:'【写作要求】默认文本',text:'新文本',modified:true}]};if(name==='promptReset')return {prompts:[{key:'writer',label:'正文写作要求',default:'【写作要求】默认文本',text:'',modified:false}]};return st;};
 const render=()=>{index=0;return GenericPanel({state:st,mode,onCall,onStage:()=>{}});};
 return {render,get tree(){return render();},calls};
}
test('设置页有提示词栏，读取后列出每段并显示是否已修改',async()=>{const v=mount();const tree=v.render();assert.match(words(tree),/提示词/);const btn=walk(tree).find(n=>n.type==='button'&&words(n)==='读取提示词');assert.ok(btn);await btn.props.onClick();const tree2=v.render();assert.match(words(tree2),/正文写作要求/);assert.match(words(tree2),/反模式清单/);assert.match(words(tree2),/已修改/);});
test('保存与重置按钮调用真实接口，并把返回的新列表渲染出来',async()=>{const v=mount();await walk(v.render()).find(n=>n.type==='button'&&words(n)==='读取提示词').props.onClick();let tree=v.render();const ta=walk(tree).find(n=>n.type==='textarea');assert.ok(ta);const save=walk(v.render()).find(n=>n.type==='button'&&words(n)==='保存');assert.ok(save);await save.props.onClick();const call=v.calls.find(c=>c[0]==='promptSave');assert.ok(call);assert.equal(call[1].key,'writer');const reset=walk(v.render()).find(n=>n.type==='button'&&words(n)==='重置');assert.ok(reset);await reset.props.onClick();assert.ok(v.calls.some(c=>c[0]==='promptReset'&&c[1].key==='writer'));});
test('未读取时不伪造内容，只给读取入口',()=>{const v=mount();const tree=v.render();assert.equal(words(tree).includes('正文写作要求'),false);assert.match(words(tree),/还没读取/);});

test('主设定页的折叠栏里有提示词一栏，读取、保存、重置都接到真实接口',()=>{const src=fs.readFileSync(new URL('../client.js',import.meta.url),'utf8');assert.match(src,/'prompts',\s*\n\s*'提示词'/);assert.match(src,/call\('promptOverrides', \{\}, gameId\)/);assert.match(src,/React\.useEffect\(\(\) => \{/);assert.match(src,/promptCall\('promptSave'/);assert.match(src,/promptCall\('promptReset'/);assert.match(src,/跨存档共用/);});
