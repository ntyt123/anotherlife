import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './harness.mjs';
import {loadClient} from './client-harness.mjs';

const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach((n) => walk(n, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };

async function npcAge({scene, birthday = '1991-03-14', now = '2010年11月1日 12:00:00 星期一 晴'}) {
  const e = await createHarness();
  const state = e.api.defaultState();
  e.cleanup();
  state.gameId = 'test'; state.phase = 'play';
  state.world.当前日期时间 = now;
  state.world.叙事时间 = scene;
  state.npcs = [{actorId: 'npc:one', 姓名: '罗伊同学', 性别: '男', 生日: birthday, 年龄: 30}];
  const c = loadClient();
  c.render().functions.initLoaded(state);
  c.render().functions.openNpcByActorId('npc:one');
  const field = walk(c.render().functions.npcModalView()).find((n) => n.props?.label === '年龄');
  assert.ok(field, '应渲染年龄字段');
  return Number(String(field.props.value).replace(/[^\d]/g, ''));
}

test('角色年龄按叙事时间算，不按主线当前日期', async () => {
  assert.equal(await npcAge({scene: '2004年9月1日 10:00:00 星期三 晴'}), 13);
});

test('没有叙事时间时仍按当前日期算年龄', async () => {
  assert.equal(await npcAge({scene: ''}), 19);
});

test('结算提示要求回忆轮写叙事时间、不推进主线日期', async () => {
  const reply = (r) => (async function* () {
    const sy = String(r.system || '');
    if (sy.includes('后台变量结算器')) yield {type: 'text-delta', index: 0, text: '{"world":{"叙事时间":"2004年9月1日 10:00:00 晴"},"summary":"回忆。"}'};
    else yield {type: 'text-delta', index: 0, text: '他坐在教室里，窗外是二〇〇四年的秋天。'};
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
    await e.call('generateStory', {gameId: 'test', input: '回忆一下 2004 年，那年他十三岁。'});
    const sys = e.requests.map((r) => String(r.system || '')).join('\n');
    assert.match(sys, /回忆、闪回、倒叙不推进主线时间/);
    assert.match(sys, /world\.叙事时间/);
    assert.match(sys, /回到当下时把 `叙事时间` 写回空字符串/);
  } finally {
    e.cleanup();
  }
});

test('名册解析不再用当前年份反推生日', () => {
  const src = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
  assert.match(src, /禁止用「当前年份 − 年龄」反推生日/);
  assert.doesNotMatch(src, /按关系与身份反推一个合理的年份/);
});
