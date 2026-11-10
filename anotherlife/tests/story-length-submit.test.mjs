import test from 'node:test';
import assert from 'node:assert/strict';
import { storyLengthSubmitTool, storyLengthUserLine } from '../lib/story-length.mjs';
import { createHarness } from './harness.mjs';

const base = {
  name: 'game',
  description: '提交正文',
  parameters: {
    type: 'object',
    required: ['game_content'],
    properties: {
      game_content: { type: 'string', description: '完整叙事。篇幅参考本轮要求，不为凑数扩展阶段。' },
      think: { type: 'string', description: '导演笔记' },
      summary: { type: 'string', description: '小结' },
      options: { type: 'array', items: { type: 'string' } },
      phoneEvents: { type: 'array', items: { type: 'object' } },
    },
  },
};
const textOf = content => typeof content === 'string' ? content : (content || []).map(block => block.text || '').join('');
const fieldOf = tool => tool.parameters.properties.game_content;

for (const [min, max, pattern] of [
  [0, 0, null], [2000, 0, /2000字左右/], [0, 5000, /不得超过5000字/], [4000, 5000, /4000到5000字之间/],
]) test(`工具绑定 ${min}/${max}，只改说明不加结构性字数门槛`, () => {
  const before = JSON.stringify(base);
  const tool = storyLengthSubmitTool(base, { bodyMinWords: min, bodyMaxWords: max }, '继续。');
  if (!pattern) assert.equal(tool, base);
  else {
    assert.notEqual(tool, base);
    assert.match(fieldOf(tool).description, pattern);
    assert.doesNotMatch(fieldOf(tool).description, /篇幅参考本轮要求/);
    assert.match(fieldOf(tool).description, /字数只计算正文/);
    if (max) assert.ok(fieldOf(tool).description.includes(`合计不得超过${max}字`));
    else assert.doesNotMatch(fieldOf(tool).description, /不得超过/);
  }
  assert.equal(JSON.stringify(base), before);
  assert.deepEqual({ ...fieldOf(tool), description: fieldOf(base).description }, fieldOf(base));
  for (const name of ['think', 'summary', 'options', 'phoneEvents']) assert.equal(tool.parameters.properties[name], base.parameters.properties[name]);
  assert.deepEqual(tool.parameters.required, base.parameters.required);
});

test('玩家篇幅不提取数字，覆盖设置且不把设置数字绑定进工具', () => {
  for (const input of ['只写100字。', '本轮不限字数。', '这次正文短一点。']) {
    const tool = storyLengthSubmitTool(base, { bodyMinWords: 4666, bodyMaxWords: 5888 }, input);
    assert.match(fieldOf(tool).description, /按上面玩家自己提出的要求执行/);
    assert.doesNotMatch(fieldOf(tool).description, /4666|5888/);
  }
});

test('每轮工具独立，不污染共享模板或下一局的字数', () => {
  const snapshot = JSON.stringify(base);
  const first = storyLengthSubmitTool(base, { bodyMinWords: 4000, bodyMaxWords: 5000 });
  const second = storyLengthSubmitTool(base, { bodyMinWords: 1200, bodyMaxWords: 2400 });
  assert.match(fieldOf(first).description, /4000到5000字/);
  assert.match(fieldOf(second).description, /1200到2400字/);
  assert.doesNotMatch(fieldOf(second).description, /4000|5000/);
  assert.equal(storyLengthSubmitTool(base, {}), base);
  assert.equal(JSON.stringify(base), snapshot);
});

async function rig({ min = 4000, max = 5000, toolMode = true, body = '门开了，他站在门口。' } = {}) {
  const e = await createHarness({ stream: request => (async function* () {
    if ((request.tools || []).some(tool => tool.name === 'game')) {
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'story', name: 'game', arguments: { game_content: body, think: '', summary: '', options: [] } } };
    } else yield { type: 'text-delta', index: 0, text: body };
    yield { type: 'finish', reason: { kind: 'stop' } };
  })() });
  const s = e.api.defaultState();
  s.gameId = 'length-submit-test'; s.phase = 'play'; s.simulation = { enabled: false };
  s.protagonist.姓名 = '样本主角'; s.npcs = []; s.world.当前日期时间 = '2026年11月1日 10:00';
  Object.assign(s.config, { bodyMinWords: min, bodyMaxWords: max, tokens: { story: 65536 }, settle: { model: '' }, toolMode });
  s.story.current_message_index = 1;
  s.story.dataCompletion = { wardrobes: { [JSON.stringify(['protagonist', '样本主角'])]: true }, attempted: {} };
  s.transcript = [{ seq: 0, role: 'assistant', body: '普通开局。', diffs: [], issues: [], options: [] }];
  e.seed(s.gameId, s);
  return e;
}
const run = (e, input = '他推门进来。') => e.call('generateStory', { gameId: 'length-submit-test', input });
const requests = e => e.requests.filter(request => String(request.system || '').includes('【输出格式】'));
const submitField = request => fieldOf(request.tools.find(tool => tool.name === 'game'));

for (const toolMode of [true, false]) {
  for (const [min, max] of [[4000, 5000], [2000, 0], [0, 5000], [0, 0]]) {
    test(`实际${toolMode ? '工具' : '普通'}请求 ${min}/${max}，三处篇幅不冲突且不缩预算`, async () => {
      const e = await rig({ min, max, toolMode });
      try {
        await run(e);
        assert.equal(requests(e).length, 1);
        const request = requests(e)[0];
        const line = storyLengthUserLine({ bodyMinWords: min, bodyMaxWords: max }, '他推门进来。');
        const user = textOf(request.messages.filter(message => message.role === 'user').at(-1).content);
        assert.equal(request.maxTokens, 65536);
        assert.equal(request.provider, 'test'); assert.equal(request.model, 'test-model');
        if (line) {
          assert.ok(user.endsWith(line));
          if (max) assert.ok(String(request.system).includes(`合计不得超过${max}字`));
          if (toolMode) assert.ok(submitField(request).description.startsWith('【本轮正文篇幅】' + line));
        } else {
          assert.doesNotMatch(user, /本轮正文字数/);
          assert.doesNotMatch(String(request.system), /【正文长度】/);
          if (toolMode) assert.doesNotMatch(submitField(request).description, /【本轮正文篇幅】/);
        }
        if (!toolMode) assert.equal((request.tools || []).length, 0);
      } finally { e.cleanup(); }
    });
  }
}

test('实际工具请求保留玩家原话且不泄漏设置数字，下一轮恢复设置', async () => {
  const e = await rig({ min: 4666, max: 5888 });
  try {
    const input = '本轮100字以内就行。'; await run(e, input);
    const first = requests(e)[0];
    assert.ok(textOf(first.messages.find(message => message.role === 'user').content).includes(input));
    assert.match(submitField(first).description, /按上面玩家自己提出的要求执行/);
    assert.doesNotMatch(submitField(first).description, /4666|5888/);
    e.requests.length = 0; await run(e, '继续。');
    assert.match(submitField(requests(e)[0]).description, /4666到5888字之间/);
  } finally { e.cleanup(); }
});

test('下一轮设置双0时工具不残留上一轮数字', async () => {
  const e = await rig();
  try {
    await run(e); assert.match(submitField(requests(e)[0]).description, /4000到5000字/);
    await e.call('saveConfig', { gameId: 'length-submit-test', config: { bodyMinWords: 0, bodyMaxWords: 0 } });
    e.requests.length = 0; await run(e, '继续。');
    assert.doesNotMatch(submitField(requests(e)[0]).description, /4000|5000|【本轮正文篇幅】/);
  } finally { e.cleanup(); }
});

for (const toolMode of [true, false]) test(`${toolMode ? '工具' : '普通'}通道仍完整保存超长文，不截断、不拒收、不自动重发`, async () => {
  const body = '这段正文应当完整保留。'.repeat(700);
  const e = await rig({ toolMode, body });
  try {
    await run(e); assert.equal(requests(e).length, 1);
    const saved = e.getState('length-submit-test').transcript.filter(turn => turn.role === 'assistant').at(-1);
    assert.equal(saved.body, body);
    assert.equal(requests(e)[0].maxTokens, 65536);
  } finally { e.cleanup(); }
});
