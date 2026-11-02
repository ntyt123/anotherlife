import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';
import {stripStoryPlaceholder} from '../lib/story-parser.mjs';

const body = '门开了。\n\n他把钥匙放在桌面上，站在窗边等她回答。';
const reply = (raw, {args, name = 'game'} = {}) => (async function* () {
  if (raw) yield {type: 'text-delta', index: 0, text: raw};
  if (args) yield {type: 'tool-call-delta', id: 'g', index: 0, name, argumentsDelta: JSON.stringify(args)};
  yield {type: 'finish', reason: {kind: args ? 'tool-calls' : 'stop'}};
})();

async function rig(raw, {args, toolMode = true} = {}) {
  const e = await createHarness({
    stream: (r) => (JSON.stringify(r).includes('【正文长度】') ? reply(raw, {args}) : reply(JSON.stringify({protagonist: {金钱: 900}, summary: '交接钥匙。'}))),
  });
  const s = e.api.defaultState();
  s.gameId = 'test';
  s.phase = 'play';
  s.simulation = {enabled: false};
  s.protagonist.姓名 = '样本主角';
  s.protagonist.金钱 = 1000;
  s.npcs = [];
  s.world.当前日期时间 = '2026年11月1日 10:00';
  s.config.body = {provider: 'test', model: 'test'};
  s.config.toolMode = toolMode;
  s.config.settle = {model: ''};
  s.story.current_message_index = 1;
  s.story.dataCompletion = {wardrobes: {[JSON.stringify(['protagonist', '样本主角'])]: true}, attempted: {}};
  s.transcript = [{seq: 0, role: 'assistant', body: '普通开局。', diffs: [], issues: [], options: []}];
  e.seed('test', s);
  return e;
}
const run = (e) => e.call('generateStory', {gameId: 'test', input: '继续交接钥匙'});
const last = (e) => e.getState('test').transcript.filter((t) => t.role === 'assistant').at(-1);

test('整行占位说明被删掉，前文保留', () => {
  const raw = body + '\n\n...（后续文字在此结构下继续延伸至4000字，保持细节丰富度和情绪平稳）...';
  const r = stripStoryPlaceholder(raw);
  assert.equal(r.removed, 1);
  assert.equal(r.text, body);
  assert.equal(r.text.includes('后续文字'), false);
});

test('行尾占位只删括注，句子保留', () => {
  const r = stripStoryPlaceholder('他走到门口。（后续将展开三天后的对峙）');
  assert.equal(r.removed, 1);
  assert.equal(r.text, '他走到门口。');
});

test('正常括注不误删', () => {
  for (const raw of ['（三天后）她回来了。', '他没有回答（她也没有再问）。', '（门外传来脚步声。）']) {
    const r = stripStoryPlaceholder(raw);
    assert.equal(r.removed, 0);
    assert.equal(r.text, raw);
  }
});

test('多个占位分别计数，空壳标点不留在正文', () => {
  const r = stripStoryPlaceholder('第一段（此处省略细节）。\n\n……（未完待续）……\n\n第二段。');
  assert.equal(r.removed, 2);
  assert.equal(r.text, '第一段。\n\n第二段。');
});

test('工具通道：正文里的占位被清理，并标记本轮', async () => {
  const raw = body + '\n\n...（后续文字将延伸至4000字）...';
  const e = await rig(raw, {args: {game_content: raw, think: '', options: ['查看房间']}});
  try {
    await run(e);
    const entry = last(e);
    assert.equal(entry.body, body);
    assert.equal(entry.body.includes('后续文字'), false);
    assert.ok(entry.issues.some((i) => i.step === '正文' && /占位/.test(i.why)));
  } finally {
    e.cleanup();
  }
});

test('普通回复通道：同样清理占位', async () => {
  const raw = body + '\n\n（后续内容将继续展开这一场，保持细节）';
  const e = await rig(raw, {toolMode: false});
  try {
    await run(e);
    const entry = last(e);
    assert.equal(entry.body, body);
    assert.ok(entry.issues.some((i) => i.step === '正文'));
  } finally {
    e.cleanup();
  }
});

test('没有占位时不标记、不改动正文', async () => {
  const e = await rig(body, {args: {game_content: body, think: '', options: ['查看房间']}});
  try {
    await run(e);
    const entry = last(e);
    assert.equal(entry.body, body);
    assert.equal(entry.issues.some((i) => i.step === '正文'), false);
  } finally {
    e.cleanup();
  }
});
