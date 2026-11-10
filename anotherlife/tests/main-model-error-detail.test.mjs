import test from 'node:test';
import assert from 'node:assert/strict';
import {createHarness} from './harness.mjs';

// 主模型空返回时，错误信息必须带上足够定位的现场：模型、finish 原文、收到量、chunk 类型、耗时。
const failing = (finish) => () => (async function* () {
  if (finish) yield {type: 'finish', reason: finish};
})();

async function rig(finish) {
  const e = await createHarness({stream: failing(finish)});
  const s = e.api.defaultState();
  s.gameId = 'test';
  s.phase = 'play';
  s.simulation = {enabled: false};
  s.protagonist.姓名 = '样本主角';
  s.npcs = [];
  s.world.当前日期时间 = '2026年11月1日 10:00';
  s.config.body = {provider: 'prov-a', model: 'model-b'};
  s.config.settle = {model: ''};
  s.config.toolMode = false;
  s.story.current_message_index = 1;
  s.story.dataCompletion = {wardrobes: {[JSON.stringify(['protagonist', '样本主角'])]: true}, attempted: {}};
  s.transcript = [{seq: 0, role: 'assistant', body: '普通开局。', diffs: [], issues: [], options: []}];
  e.seed('test', s);
  return e;
}

test('连接错误时错误信息保留原始 finish 与收到量，不再只有一句 Connection error', async () => {
  const e = await rig({kind: 'error', failure: {code: 'ECONNRESET', status: 502, message: 'Connection error.'}});
  try {
    await assert.rejects(
      () => e.call('generateStory', {gameId: 'test', input: '继续', simulationActions: []}),
      (err) => {
        const msg = String(err && err.message);
        assert.match(msg, /主模型没有返回正文/);
        assert.match(msg, /Connection error\./);
        assert.match(msg, /模型 [^\s；]+\/[^\s；]+/, '应带上实际请求的模型');
        assert.match(msg, /finish=/, '应带上 finish 原文');
        assert.match(msg, /ECONNRESET/, '应保留失败码');
        assert.match(msg, /502/, '应保留 HTTP 状态');
        assert.match(msg, /收到 text 0 字/, '应带上实际收到量');
        assert.match(msg, /chunk=/);
        assert.match(msg, /耗时 \d+\.\d+s/);
        return true;
      }
    );
  } finally {
    e.cleanup();
  }
});

test('没有任何 finish 时同样给出收到量与 chunk 类型', async () => {
  const e = await rig(null);
  try {
    await assert.rejects(
      () => e.call('generateStory', {gameId: 'test', input: '继续', simulationActions: []}),
      (err) => {
        const msg = String(err && err.message);
        assert.match(msg, /主模型没有返回内容/);
        assert.match(msg, /finish=null/);
        assert.match(msg, /chunk=/);
        return true;
      }
    );
  } finally {
    e.cleanup();
  }
});
