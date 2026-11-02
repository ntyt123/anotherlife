import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';

const reply = async function* (value) {
  yield {type: 'text-delta', index: 0, text: JSON.stringify(value)};
  yield {type: 'finish', reason: {kind: 'stop'}};
};

const WORLD = {
  世界观类型: '古代（唐代宫廷权谋）',
  时代与年份: '公元682年，唐高宗弘道元年',
  当前日期时间: '682年3月15日 09:00:00',
  起始地点: '长安城大明宫',
  权力结构: '二圣临朝',
};

async function seedWorld(withWorld = true) {
  const e = await createHarness({stream: () => reply({姓名: '李玄策', 性别: '男', 角色: [{姓名: '罗卫平', 与主角关系: '父亲'}]})});
  const s = e.api.defaultState();
  s.gameId = 'test';
  s.phase = 'character';
  if (withWorld) s.world = {...s.world, ...WORLD};
  e.seed('test', s);
  return e;
}

const userTextOf = (request) => [
  String(request.system || ''),
  ...(request.messages || []).map((m) => (typeof m.content === 'string'
    ? m.content
    : (m.content || []).map((c) => (c && c.text) || '').join(''))),
].join('\n');

test('主角解析请求带上已选定的世界', async () => {
  const e = await seedWorld();
  try {
    await e.call('parseNatural', {gameId: 'test', target: 'character', text: '李玄策，三皇子。'});
    const request = e.requests.find((r) => userTextOf(r).includes('李玄策，三皇子'));
    assert.ok(request, '应发出主角解析请求');
    const text = userTextOf(request);
    assert.match(text, /【已选定的世界/);
    assert.ok(text.includes('公元682年，唐高宗弘道元年'));
    assert.ok(text.includes('长安城大明宫'));
    assert.match(text, /不得另立朝代或年号/);
  } finally {
    e.cleanup();
  }
});

test('名册解析同样带上世界，并保留主角关系原文', async () => {
  const e = await seedWorld();
  try {
    await e.call('parseNatural', {gameId: 'test', target: 'cast', text: '父亲罗卫平。'});
    const request = e.requests.find((r) => userTextOf(r).includes('父亲罗卫平'));
    assert.ok(request, '应发出名册解析请求');
    const text = userTextOf(request);
    assert.match(text, /【已选定的世界/);
    assert.ok(text.includes('公元682年，唐高宗弘道元年'));
  } finally {
    e.cleanup();
  }
});

test('没有世界时不塞入空的已选世界块', async () => {
  const e = await seedWorld(false);
  try {
    await e.call('parseNatural', {gameId: 'test', target: 'character', text: '李玄策，三皇子。'});
    const request = e.requests.find((r) => userTextOf(r).includes('李玄策，三皇子'));
    assert.ok(request);
    assert.equal(userTextOf(request).includes('【已选定的世界'), false);
  } finally {
    e.cleanup();
  }
});
