import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewFolds } from '../lib/view-folds.js';
const toggle = (props, open) => { const node = { open }; props.onToggle({ currentTarget: node, target: node }); };
test('默认展开或收起取自调用方，手动选择覆盖默认',()=>{const fold=createViewFolds();assert.equal(fold('a','list',true).open,true);toggle(fold('a','list'),false);assert.equal(fold('a','list',true).open,false);assert.equal(fold('a','archive',false).open,false);toggle(fold('a','archive',false),true);assert.equal(fold('a','archive',false).open,true);});
test('存档和分区独立，不因分隔符或危险键名碰撞',()=>{const fold=createViewFolds();toggle(fold('a:b','c'),false);assert.equal(fold('a','b:c').open,true);assert.equal(fold('b','c').open,true);toggle(fold('a','__proto__'),false);assert.equal(fold('a','__proto__').open,false);assert.equal({}.polluted,undefined);});
test('内层toggle冒泡不会写外层展开选择',()=>{const fold=createViewFolds(),parent={open:false},child={open:true};fold('a','outer').onToggle({currentTarget:parent,target:child});assert.equal(fold('a','outer',true).open,true);});
test('无效事件不写状态，新工厂不继承上次页面会话',()=>{const fold=createViewFolds();for(const event of [null,{}, {currentTarget:{}},{currentTarget:{open:'false'}}])fold('a','list').onToggle(event);assert.equal(fold('a','list').open,true);toggle(fold('a','list'),false);assert.equal(createViewFolds()('a','list').open,true);});
test('返回仅有原生details属性，不写任何存档数据',()=>{const fold=createViewFolds(),props=fold('a','section');assert.deepEqual(Object.keys(props).sort(),['onToggle','open']);toggle(props,false);assert.equal(fold('a','section').open,false);});
