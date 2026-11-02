import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {BASIC_WEAR_KEYS} from '../lib/data-integrity.mjs';
import {inspectWardrobeResult} from '../lib/wardrobe-repair.mjs';
import {creationIssues} from '../lib/creation-flow.mjs';
import {dedupeStoryLists} from '../lib/description-hygiene.mjs';
const state={protagonist:{姓名:'罗伊'},npcs:[{姓名:'罗子强'}]};
const tasks=[{key:'protagonist',姓名:'罗伊',kind:'protagonist'},{key:'npc:罗子强',姓名:'罗子强',kind:'npc'}];
const slot=(物品,简介='')=>({物品,稀有度:物品?'N':'',状态:'',简介});
const full=(extra={})=>Object.fromEntries(BASIC_WEAR_KEYS.map(k=>[k,slot(k==='上衣'?'白衬衫':k==='下衣'?'牛仔裤':'',k==='上衣'||k==='下衣'?'日常穿的外衣':'')]));
test('空物品但残留了简介时自动清空，不再报“空槽包含残留信息”',()=>{const wear=full({内衣:{物品:'',稀有度:'',状态:'',简介:'贴身衣物，常换洗'},内裤:{物品:'',稀有度:'',状态:'',简介:'贴身衣物'}});const r=inspectWardrobeResult(state,[tasks[0]],{chars:[{姓名:'罗伊',穿着:wear}]},{keys:BASIC_WEAR_KEYS});assert.equal(r.missing.some(m=>/残留/.test(m.why)),false);const applied=r.update.protagonist.穿着||{};assert.equal(String(applied.内衣?.简介||''),'');});
test('穿着不是对象时只跳过该角色，不把整次核对判失败',()=>{const r=inspectWardrobeResult(state,tasks,{chars:[{姓名:'罗伊',穿着:full()},{姓名:'罗子强',穿着:'深色外套和长裤'}]},{keys:BASIC_WEAR_KEYS});assert.ok(r.missing.some(m=>m.姓名==='罗子强'&&/缺少穿着对象/.test(m.why)),JSON.stringify(r.missing));});
test('核对开局资料不再把衣着缺项当成阻断错误',()=>{const s={protagonist:{姓名:'罗伊',住所:[{名称:'家',位置:'上海'}],穿着:{}},npcs:[{姓名:'罗子强',与主角关系:'堂弟'}],实体资产:[],虚拟资产:[],relationships:[],simulation:{creation:{ready:false}}};const issues=creationIssues(s,{prepared:true}).join('；');assert.doesNotMatch(issues,/普通衣着未齐|未返回该角色服装|缺少穿着对象/);const blocked=creationIssues(s).join('；');assert.doesNotMatch(blocked,/普通衣着未齐/);});

test('衣物简介长短不再影响“已审”判定，只看部位与品级',async()=>{const {hasReviewedWear}=await import('../lib/data-integrity.mjs');const {BASIC_WEAR_KEYS}=await import('../lib/data-integrity.mjs');const make=(简介)=>({头部:{物品:'',稀有度:'',状态:'',简介:''},上衣:{物品:'白衬衫',稀有度:'N',状态:'',简介},下衣:{物品:'牛仔裤',稀有度:'N',状态:'',简介},袜子:{物品:'棉袜',稀有度:'N',状态:'',简介},鞋子:{物品:'皮鞋',稀有度:'N',状态:'',简介},饰品:{物品:'',稀有度:'',状态:'',简介:''}});assert.equal(hasReviewedWear(make('旧衬衫'),BASIC_WEAR_KEYS),true);assert.equal(hasReviewedWear(make('一件穿了很久的旧衬衫，袖口已经磨白'),BASIC_WEAR_KEYS),true);const bad=make('旧衬衫');bad.上衣.稀有度='SSS';assert.equal(hasReviewedWear(bad,BASIC_WEAR_KEYS),false);const empty=make('旧衬衫');empty.上衣.物品='';empty.下衣.物品='';assert.equal(hasReviewedWear(empty,BASIC_WEAR_KEYS),false);});
test('完全重复的隐患合并成一条，标题不同或知情者不同的仍保留',()=>{const st={protagonist:{隐患:[{事情:'与王玉雯的地下情人关系',知情者:'王玉雯'},{事情:'与王玉雯的地下情人关系',知情者:'王玉雯',危险度:'高'},{事情:'与王玉雯的地下情人关系',知情者:'田曦薇'},{事情:'公司账目问题',知情者:'王玉雯'}],债务:[{对象:'银行',内容:'房贷'},{对象:'银行',内容:'房贷'}],私人关系:[{对象:'王玉雯'},{对象:'王玉雯'}]}};const changed=dedupeStoryLists(st);assert.ok(changed>=3,'应至少合并三处');assert.equal(st.protagonist.隐患.length,3);assert.equal(st.protagonist.隐患[0].危险度,'高');assert.equal(st.protagonist.债务.length,1);assert.equal(st.protagonist.私人关系.length,1);});
test('读档重复隐患不改变其他字段，再次调用无变化',()=>{const st={protagonist:{姓名:'罗伊',金钱:1234,隐患:[{事情:'甲'},{事情:'甲'}],技能:[{名字:'时间暂停'},{名字:'时间暂停',等级:'精通'}]}};dedupeStoryLists(st);assert.equal(st.protagonist.隐患.length,1);assert.equal(st.protagonist.技能.length,1);assert.equal(st.protagonist.技能[0].等级,'精通');assert.equal(st.protagonist.金钱,1234);assert.equal(dedupeStoryLists(st),0);});

test('读档链路已接入去重，且顺序在读档清理之后',()=>{const src=fs.readFileSync(new URL('../index.mjs',import.meta.url),'utf8');const calls=(src.match(/dedupeStoryLists\(s\);/g)||[]).length;assert.ok(calls>=2,'读档与状态返回都应去重，实际 '+calls);assert.match(src,/cleanSkillAndItemNotes\(s\);\r?\n\s*dedupeStoryLists\(s\);/);assert.match(src,/import \{[^}]*dedupeStoryLists[^}]*\} from '\.\/lib\/description-hygiene\.mjs'/);});
