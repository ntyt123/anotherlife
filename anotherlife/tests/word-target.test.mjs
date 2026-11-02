import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';

const reply = () => (async function* () {
  yield {type: 'text-delta', index: 0, text: '门开了。\n\n他站在门口。'};
  yield {type: 'finish', reason: {kind: 'stop'}};
})();

async function rig({min = 4000, tokens = 8000} = {}) {
  const e = await createHarness({stream: () => reply()});
  const s = e.api.defaultState();
  s.gameId = 'test';
  s.phase = 'play';
  s.simulation = {enabled: false};
  s.protagonist.姓名 = '样本主角';
  s.npcs = [];
  s.world.当前日期时间 = '2026年11月1日 10:00';
  s.config.body = {provider: 'test', model: 'test'};
  s.config.bodyMinWords = min;
  s.config.tokens = {story: tokens};
  s.config.settle = {model: ''};
  s.config.toolMode = false;
  s.story.current_message_index = 1;
  s.story.dataCompletion = {wardrobes: {[JSON.stringify(['protagonist', '样本主角'])]: true}, attempted: {}};
  s.transcript = [{seq: 0, role: 'assistant', body: '普通开局。', diffs: [], issues: [], options: []}];
  e.seed('test', s);
  return e;
}

const bodyRequest = (e) => e.requests.find((r) => String(r.system || '').includes('【正文长度】'));
const run = (e, input) => e.call('generateStory', {gameId: 'test', input});

test('没有字数要求时按设置走', async () => {
  const e = await rig();
  try {
    await run(e, '他推门进来。');
    const r = bodyRequest(e);
    assert.ok(r);
    assert.match(String(r.system), /不少于 4000 字/);
    assert.equal(r.maxTokens, 8000);
    assert.match(String(r.system), /「写足」不等于「走完」/);
    assert.equal(String(r.system).includes('点名要长篇'), false);
  } finally {
    e.cleanup();
  }
});

test('输入写了 20000 字就按 20000，并抬高 token 上限', async () => {
  const e = await rig();
  try {
    await run(e, '本次输出字数大于20000，无需描写另一个人。');
    const r = bodyRequest(e);
    assert.ok(r);
    assert.match(String(r.system), /不少于 20000 字/);
    assert.equal(r.maxTokens, 36000);
    assert.match(String(r.system), /点名要长篇/);
    assert.equal(String(r.system).includes('「写足」不等于「走完」'), false);
  } finally {
    e.cleanup();
  }
});

test('中文「两万字」同样识别', async () => {
  const e = await rig();
  try {
    await run(e, '这一轮写两万字，把这一天写完。');
    assert.match(String(bodyRequest(e).system), /不少于 20000 字/);
  } finally {
    e.cleanup();
  }
});

test('超过上限按 50000 封顶，低于 200 不触发', async () => {
  const e = await rig();
  try {
    await run(e, '这次写 999999 字。');
    assert.match(String(bodyRequest(e).system), /不少于 50000 字/);
  } finally {
    e.cleanup();
  }
  const e2 = await rig();
  try {
    await run(e2, '写 100 字就够了。');
    assert.match(String(bodyRequest(e2).system), /不少于 4000 字/);
  } finally {
    e2.cleanup();
  }
});

test('覆盖只作用于当轮，下一轮回到设置值', async () => {
  const e = await rig();
  try {
    await run(e, '本次输出字数大于20000。');
    const first = bodyRequest(e);
    assert.match(String(first.system), /不少于 20000 字/);
    e.requests.length = 0;
    await run(e, '继续。');
    const second = bodyRequest(e);
    assert.match(String(second.system), /不少于 4000 字/);
    assert.equal(second.maxTokens, 8000);
  } finally {
    e.cleanup();
  }
});
