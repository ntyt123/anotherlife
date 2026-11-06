import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './harness.mjs';
import {loadClient} from './client-harness.mjs';

const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach((n) => walk(n, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const words = (n) => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.kids || []) : '';

test('结算规则把自察改成私念：由头＋念头，保留未成年留空', () => {
  const src = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  assert.match(src, /自察：她一个人的时候，脑子里的念头和身体上的反应/);
  assert.match(src, /由头：具体的那件事/);
  assert.match(src, /念头：她想了什么、身体怎么反应/);
  assert.match(src, /未满 10 岁的角色这一条留空/);
  assert.doesNotMatch(src, /她私下确认自己的身体（洗澡时摸到/);
});

test('过期参数放宽到 7 天、最多 8 条', () => {
  const src = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  assert.match(src, /SELFCHECK_MAX = 8/);
  assert.match(src, /SELFCHECK_TTL = 168/);
  assert.match(src, /自察 7 天、最多 8 条/);
});

test('角色面板同时显示新的私念条目和旧的身体自察条目', async () => {
  const e = await createHarness();
  const state = e.api.defaultState();
  e.cleanup();
  state.gameId = 'test'; state.phase = 'play';
  state.npcs = [{actorId: 'npc:one', 姓名: '苏清越', 性别: '女', 年龄: 19,
    自察: [{时刻: '昨晚熄灯后', 由头: '刚洗完澡', 念头: '手指放上去的时候想起白天他扶过这里'},
           {时刻: '前天早上', 部位: '小腹', 感觉: '摸到一小块硬的'}]}];
  const c = loadClient();
  c.render().functions.initLoaded(state);
  c.render().functions.openNpcByActorId('npc:one');
  const text = words(c.render().functions.npcModalView());
  assert.match(text, /刚洗完澡/);
  assert.match(text, /小腹/);
});

test('结算请求带上新的自察规则', async () => {
  const reply = (r) => (async function* () {
    const sy = String(r.system || '');
    if (sy.includes('后台变量结算器')) yield {type: 'text-delta', index: 0, text: '{"world":{},"summary":"x"}'};
    else yield {type: 'text-delta', index: 0, text: '门开了。'};
    yield {type: 'finish', reason: {kind: 'stop'}};
  })();
  const e = await createHarness({stream: reply});
  try {
    const s = e.api.defaultState();
    s.gameId = 'test'; s.phase = 'play'; s.simulation = {enabled: false};
    s.protagonist.姓名 = '样本'; s.npcs = []; s.world.当前日期时间 = '2010年11月1日 12:00:00 晴';
    s.config.body = {provider: 'test', model: 'test'}; s.config.bodyMinWords = 4000;
    s.config.settle = {provider: 'test', model: 'test'}; s.config.toolMode = false;
    s.story.current_message_index = 1;
    s.story.dataCompletion = {wardrobes: {[JSON.stringify(['protagonist', '样本'])]: true}, attempted: {}};
    s.transcript = [{seq: 0, role: 'assistant', body: '开局。', diffs: [], issues: [], options: []}];
    e.seed('test', s);
    await e.call('generateStory', {gameId: 'test', input: '继续。'});
    const sys = e.requests.map((r) => String(r.system || '')).join('\n');
    assert.match(sys, /由头：具体的那件事/);
  } finally {
    e.cleanup();
  }
});
