import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceDocument, estimateStyleTokens, inputBudget, planStyleAnalysis, analysisMessages, verifyStyleEvidence, parseStyleResult, groupStyleResults } from '../lib/writing-style-core.mjs';
import { createWritingStyleHost } from '../lib/writing-style-host.mjs';
import { createHarness } from './harness.mjs';

const sample = '第一章 开始\n她把铅笔推回桌子中间。\n第二章 继续\n他没答话，把门留了一条缝。\n最后一章\n杯子仍在原来的位置。';
const result = (quote = '她把铅笔推回桌子中间。') => ({ name: '日常对话与心理', guide: '## 底色\n让动作、对白与矛盾的心理互相修正，不绑定时代、人称或人物。\n## 示例\n甲把笔推回去。乙说自己不缺，手却没收回来。', evidence: [{ dimension: '细节', claim: '物件参与关系变化', quote, startLine: 2, scope: '日常相处，非每个场景硬性要求', kind: '倾向' }] });
const reply = value => (async function* () { yield { type: 'text-delta', index: 0, text: typeof value === 'string' ? value : JSON.stringify(value) }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
function rig(stream, initialFiles) {
  const files = initialFiles || new Map(), handles = new Map(), readonlyHandles = new Set(), requests = [], queues = new Map(); let selection = '', invalidations = 0;
  const serial = (key, fn) => { const run = (queues.get(key) || Promise.resolve()).catch(() => {}).then(fn); queues.set(key, run); return run; };
  const api = createWritingStyleHost({ reg: (k, fn) => handles.set(k, fn), readonlyHandles, readJson: async p => files.has(p) ? JSON.parse(files.get(p)) : null,
    writeJson: async (p, v) => files.set(p, JSON.stringify(v)), serial, storeDir: 'memory/',
    llm: { resolveModelInfo: async () => ({ contextWindow: 1000000 }), stream: options => { requests.push(options); return stream ? stream(options, requests.length) : reply(result()); } },
    currentModel: () => ({ provider: 'test', model: 'long-context' }), selectedId: async () => selection, invalidate: () => { invalidations++; } });
  return { api, files, requests, handles, call: (name, args = {}) => handles.get(name)(args), setSelection: v => { selection = v; }, get invalidations() { return invalidations; } };
}
async function upload(r, text = sample) {
  const begin = await r.call('writingStyleUploadBegin', { name: '样本文本', chars: text.length });
  for (let i = 0, n = 0; i < text.length; i += begin.chunkChars, n++) await r.call('writingStyleUploadChunk', { id: begin.id, index: n, text: text.slice(i, i + begin.chunkChars) });
  return r.call('writingStyleUploadFinish', { id: begin.id });
}
async function begin(r, source, extra = {}) {
  const plan = await r.call('writingStylePreflight', { sourceId: source.id, contextWindow: 1000000, maxTokens: 8192, ...extra });
  const job = await r.call('writingStyleStart', { preflightId: plan.id }); return { plan, job };
}
async function finished(r, id) {
  for (let i = 0; i < 1000; i++) { const j = await r.call('writingStyleTaskStatus', { id }); if (!['running', 'queued'].includes(j.status)) return r.call('writingStyleTaskGet', { id }); await new Promise(ok => setTimeout(ok, 3)); }
  throw new Error('测试任务未结束');
}

test('原文只归一BOM与换行，完整保留首尾与代理对', () => {
  const doc = sourceDocument('\uFEFF甲\r\n乙😀\r末尾'); assert.equal(doc.text, '甲\n乙😀\n末尾'); assert.equal(doc.chars, 7); assert.equal(doc.lines, 3); assert.match(doc.hash, /^[a-f0-9]{64}$/);
});
test('空原文和超过文件上限明确报错，不做隐式截断', () => {
  assert.throws(() => sourceDocument(' \n '), /为空/); assert.throws(() => sourceDocument('a'.repeat(32 * 1024 * 1024 + 1)), /超过32/);
});
test('估算包含指令与输出余量，1M不是汉字数', () => {
  assert.ok(estimateStyleTokens('汉字') > estimateStyleTokens('aa')); const budget = inputBudget(1000000, 8192);
  assert.equal(budget.available, 1000000 - 8192 - 50000); assert.throws(() => inputBudget(4096, 8192), /空间/);
});
test('全文方案完整包括第一行和最后一行，不抽样', () => {
  const doc = sourceDocument(sample), p = planStyleAnalysis(doc, { contextWindow: 1000000, maxTokens: 8192 });
  assert.equal(p.batches.length, 1); assert.equal(doc.text.slice(p.batches[0].start, p.batches[0].end), sample); assert.equal(p.estimated, true);
  assert.ok(analysisMessages(sample)[1].content.endsWith('杯子仍在原来的位置。\n</novel_material>'));
});
test('超限全文默认阻止开始，只有显式确认才允许发送', () => {
  const doc = sourceDocument('文字'.repeat(10000));
  const p = planStyleAnalysis(doc, { contextWindow: 4096, maxTokens: 512 }); assert.equal(p.canStart, false);
  assert.equal(planStyleAnalysis(doc, { contextWindow: 4096, maxTokens: 512, allowEstimateOverflow: true }).canStart, true);
});
test('分章方案连续覆盖原文且每批符合估算预算，不拆代理对', () => {
  const doc = sourceDocument(Array.from({ length: 20 }, (_, i) => `第${i + 1}章\n` + '甲乙😀丙丁。'.repeat(90)).join('\n'));
  const p = planStyleAnalysis(doc, { contextWindow: 4096, maxTokens: 512, mode: 'chapters' });
  assert.ok(p.batches.length > 1); assert.equal(p.batches.map(b => doc.text.slice(b.start, b.end)).join(''), doc.text);
  for (const b of p.batches) { assert.ok(b.inputTokens <= p.available); assert.ok(!/[\uD800-\uDBFF]$/.test(doc.text.slice(b.start, b.end))); }
});
test('证据重新核对原文位置，不信模型自报行号和verified标记', () => {
  const rows = verifyStyleEvidence([{ quote: '他没答话，把门留了一条缝。', startLine: 99, verified: true }, { quote: '不存在的句子', verified: true }], sample);
  assert.equal(rows[0].startLine, 4); assert.equal(rows[0].verified, true); assert.equal(rows[1].verified, false); assert.equal(rows[1].startLine, 0);
});
test('三段取证分布只记位置，不虚报全文理解率', () => {
  const source = '开头证据' + '甲'.repeat(80) + '中间证据' + '乙'.repeat(80) + '末尾证据';
  const data = parseStyleResult(JSON.stringify({ guide: '指导', evidence: ['开头证据', '中间证据', '末尾证据'].map(quote => ({ quote })) }), source);
  assert.equal(data.coverage.locations.length, 3); assert.match(data.coverage.note, /不等于/);
});
test('兼容围栏与外层说明，空指导和不可识别输出保留为失败', () => {
  assert.equal(parseStyleResult('```json\n' + JSON.stringify(result()) + '\n```', sample).evidence[0].verified, true);
  assert.equal(parseStyleResult('分析如下：\n' + JSON.stringify(result()), sample).name, result().name);
  assert.throws(() => parseStyleResult('{}', sample), /为空/); assert.throws(() => parseStyleResult('未完成', sample), /已保留/);
});
test('综合无法容纳任何两份结果时明确失败，不丢弃阶段资料', () => {
  assert.throws(() => groupStyleResults([{ guide: '长'.repeat(2000) }, { guide: '长'.repeat(2000) }], 800), /超过综合容量/);
});
test('分块上传检查顺序与长度，重复相同分片幂等', async () => {
  const r = rig(); try {
    const up = await r.call('writingStyleUploadBegin', { name: '原文', chars: 4 });
    await assert.rejects(r.call('writingStyleUploadChunk', { id: up.id, index: 1, text: '甲' }), /顺序/);
    await r.call('writingStyleUploadChunk', { id: up.id, index: 0, text: '甲乙' }); await r.call('writingStyleUploadChunk', { id: up.id, index: 0, text: '甲乙' });
    await assert.rejects(r.call('writingStyleUploadChunk', { id: up.id, index: 0, text: '错误' }), /冲突/);
    await assert.rejects(r.call('writingStyleUploadFinish', { id: up.id }), /未完成/);
    await r.call('writingStyleUploadChunk', { id: up.id, index: 1, text: '丙丁' }); const doc = await r.call('writingStyleUploadFinish', { id: up.id }); assert.equal(doc.chars, 4); assert.equal(r.requests.length, 0);
  } finally { r.api.dispose(); }
});
test('上传大于单次RPC的原文后，一次模型请求保留前中后全部内容', async () => {
  const r = rig(); try {
    const text = '开始锚点\n' + '原文内容。\n'.repeat(20000) + '结尾锚点'; const doc = await upload(r, text); const sourceBefore = [...r.files].find(([k]) => k.includes('style-source-'))[1];
    const { job, plan } = await begin(r, doc); const done = await finished(r, job.id);
    assert.equal(done.status, 'completed'); assert.equal(r.requests.length, 1); assert.equal(plan.batches.length, 1);
    const sent = r.requests[0].messages[0].content[0].text; assert.match(sent, /开始锚点/); assert.match(sent, /结尾锚点/); assert.equal((sent.match(/原文内容。/g) || []).length, 20000);
    assert.equal([...r.files].find(([k]) => k.includes('style-source-'))[1], sourceBefore); assert.equal((await r.call('writingStyleCatalog')).guides.length, 0);
    await r.call('writingStyleStart', { preflightId: plan.id }); assert.equal(r.requests.length, 1);
  } finally { r.api.dispose(); }
});
test('预检和查看目录不调用生成；超限不会偷偷分批', async () => {
  const r = rig(); try { const doc = await upload(r, '原文'.repeat(10000)); const p = await r.call('writingStylePreflight', { sourceId: doc.id, contextWindow: 4096, maxTokens: 512 });
    assert.equal(p.canStart, false); await r.call('writingStyleCatalog'); assert.equal(r.requests.length, 0);
    await assert.rejects(r.call('writingStyleStart', { preflightId: p.id }), /超出/); assert.equal(r.requests.length, 0);
  } finally { r.api.dispose(); }
});
test('指导可编辑保存、另存和导出数据隔离；冲突版本拒绝覆盖', async () => {
  const r = rig(); try { const doc = await upload(r); const saved = await r.call('writingStyleSave', { name: '自定义', guide: '指导正文', sourceId: doc.id, evidence: result().evidence });
    assert.ok(saved.selectionId.startsWith('style:')); assert.equal(saved.evidence[0].verified, true); assert.equal(await r.api.body(saved.selectionId), '指导正文');
    assert.equal((await r.api.list())[0].name, '自定义'); assert.equal(r.requests.length, 0);
    const updated = await r.call('writingStyleSave', { id: saved.selectionId, expectedVersion: 1, name: '自定义', guide: '新正文' }); assert.equal(updated.version, 2);
    await assert.rejects(r.call('writingStyleSave', { id: saved.selectionId, expectedVersion: 1, name: '自定义', guide: '旧窗口' }), /别处修改/);
    r.setSelection(saved.selectionId); await assert.rejects(r.call('writingStyleDelete', { id: saved.selectionId, expectedVersion: 2 }), /正在启用/);
    r.setSelection(''); await r.call('writingStyleDelete', { id: saved.selectionId, expectedVersion: 2 }); assert.equal((await r.api.list()).length, 0);
  } finally { r.api.dispose(); }
});
test('导入的证据不继承别处verified认证，路径不能逃出插件存储', async () => {
  const r = rig(); try { const saved = await r.call('writingStyleSave', { name: '导入', guide: '正文', evidence: [{ quote: '凭空摘录', verified: true }] }); assert.equal(saved.evidence[0].verified, false);
    await assert.rejects(r.call('writingStylePreflight', { sourceId: '../../other', contextWindow: 1000000 }), /编号无效/);
  } finally { r.api.dispose(); }
});
test('失败保留原始输出、不自动重试，明确继续时使用新预算', async () => {
  const r = rig((options, n) => reply(n === 1 ? '尚未形成JSON的原始结果' : result())); try {
    const doc = await upload(r), { job } = await begin(r, doc); const failed = await finished(r, job.id);
    assert.equal(failed.status, 'failed'); assert.match(failed.lastRaw, /原始结果/); await new Promise(ok => setTimeout(ok, 20)); assert.equal(r.requests.length, 1);
    await r.call('writingStyleTaskResume', { id: job.id, options: { provider: 'test', model: 'new-model', contextWindow: 1000000, maxTokens: 9000 } });
    const done = await finished(r, job.id); assert.equal(done.status, 'completed'); assert.equal(r.requests.length, 2); assert.equal(r.requests[1].maxTokens, 9000); assert.equal(r.requests[1].model, 'new-model');
  } finally { r.api.dispose(); }
});
test('截断或缺失结束事件不作为完整指导，原始内容可查看', async () => {
  for (const kind of ['max-tokens', 'missing']) {
    const r = rig(() => (async function* () { yield { type: 'text-delta', index: 0, text: JSON.stringify(result()) }; if (kind !== 'missing') yield { type: 'finish', reason: { kind } }; })());
    try { const doc = await upload(r), { job } = await begin(r, doc), done = await finished(r, job.id); assert.equal(done.status, 'failed'); assert.match(done.lastRaw, /guide/); assert.equal(r.requests.length, 1); assert.equal((await r.api.list()).length, 0); } finally { r.api.dispose(); }
  }
});
test('停止中断正在等待的流且不保存半份指导', async () => {
  const r = rig(options => (async function* () { yield { type: 'text-delta', index: 0, text: '部分结果' }; await new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); })());
  try { const doc = await upload(r), { job } = await begin(r, doc); for (let i = 0; i < 30 && !r.requests.length; i++) await new Promise(ok => setTimeout(ok, 3));
    await r.call('writingStyleTaskCancel', { id: job.id }); const done = await finished(r, job.id); assert.equal(done.status, 'stopped'); assert.equal(r.requests.length, 1); assert.equal((await r.api.list()).length, 0); assert.equal(r.requests[0].signal.aborted, true);
  } finally { r.api.dispose(); }
});
test('分批失败后继续不重跑已完成原文章节，最终综合保留证据', async () => {
  const r = rig((options, n) => { if (n === 2) return reply('未完成'); const text = options.messages[0].content[0].text;
    const quote = text.match(/\[L\d+\] ([^\n]+)/)?.[1] || text.match(/"quote":"([^"]+)"/)?.[1] || '第1章'; return reply(result(quote)); });
  try { const doc = await upload(r, Array.from({ length: 8 }, (_, i) => `第${i + 1}章\n` + '这段原文保留了动作与对白。'.repeat(80)).join('\n'));
    const { job, plan } = await begin(r, doc, { contextWindow: 4096, maxTokens: 512, mode: 'chapters' }); assert.ok(plan.batches.length > 1);
    const failed = await finished(r, job.id); assert.equal(failed.status, 'failed'); assert.equal(failed.nextBatch, 1); assert.equal(failed.results.length, 1);
    const firstSent = r.requests[0].messages[0].content[0].text;
    await r.call('writingStyleTaskResume', { id: job.id }); const done = await finished(r, job.id); assert.equal(done.status, 'completed'); assert.equal(done.nextBatch, plan.batches.length);
    assert.equal(r.requests.filter(o => o.messages[0].content[0].text === firstSent).length, 1); assert.ok(done.result.evidence.some(e => e.verified));
  } finally { r.api.dispose(); }
});
test('宿主真实入口注册新服务，保存不启用，加载后正文请求只有指导没有原文依据', async () => {
  const e = await createHarness({ stream: options => reply((options.tools || []).some(t => t.name === 'game') ? '她合上笔记本，把杯子放回桌子边。' : '{}') });
  try {
    const saved = await e.call('writingStyleSave', { name: '测试指导', guide: '仅用于测试的写作指导锚点', evidence: [{ quote: '不能进入正文提示词的证据', verified: true }] });
    assert.equal((await e.call('getWritingSkill')).id, ''); await e.call('saveWritingSkill', { id: saved.selectionId });
    const selected = await e.call('getWritingSkill'); assert.equal(selected.body, '仅用于测试的写作指导锚点'); assert.ok(selected.list.some(g => g.id === saved.selectionId));
    const s = e.api.defaultState(); s.gameId = 'style-game'; s.phase = 'play'; s.simulation = { enabled: false }; s.protagonist.姓名 = '样本'; s.npcs = []; s.config.toolMode = true; s.config.settle = { model: '' }; s.story.current_message_index = 1; s.story.dataCompletion = { wardrobes: { '["protagonist","样本"]': true }, attempted: {} }; s.transcript = []; e.seed(s.gameId, s);
    await e.call('generateStory', { gameId: s.gameId, input: '坐在桌边聊两句' });
    const req = e.requests.find(o => (o.tools || []).some(t => t.name === 'game')); assert.ok(req); assert.match(req.system, /仅用于测试的写作指导锚点/); assert.doesNotMatch(req.system, /不能进入正文提示词的证据/);
    await e.call('writingStyleSave', { id: saved.selectionId, expectedVersion: 1, name: '测试指导', guide: '已修改的新指导锚点' }); assert.equal((await e.call('getWritingSkill')).body, '已修改的新指导锚点');
    assert.ok(e.writes.every(p => !p.includes('/skills/')));
  } finally { e.cleanup(); }
});


test('读取模型声明容量，未填写时不猜测汉字容量', async () => {
  const r = rig(); try { const doc = await upload(r); const plan = await r.call('writingStylePreflight', { sourceId: doc.id, maxTokens: 8192 }); assert.equal(plan.capacity, 1000000); assert.equal(plan.capacitySource, '模型声明'); assert.equal(r.requests.length, 0); } finally { r.api.dispose(); }
});
test('完成上传幂等且不占待上传名额，取消后释放未完成资料', async () => {
  const r = rig(); try {
    const begin = await r.call('writingStyleUploadBegin', { name: '首份', chars: 2 }); await r.call('writingStyleUploadChunk', { id: begin.id, index: 0, text: '甲乙' });
    const doc = await r.call('writingStyleUploadFinish', { id: begin.id }); assert.equal((await r.call('writingStyleUploadFinish', { id: begin.id })).id, doc.id);
    for (let i = 0; i < 5; i++) await upload(r, '原文'+i);
    const pending = await r.call('writingStyleUploadBegin', { name: '取消测试', chars: 2 }); await r.call('writingStyleUploadCancel', { id: pending.id });
    await assert.rejects(r.call('writingStyleUploadChunk', { id: pending.id, index: 0, text: '甲乙' }), /过期/); assert.equal(r.requests.length, 0);
  } finally { r.api.dispose(); }
});
test('重启后未完成任务标为中断，保留阶段结果且不自动恢复收费任务', async () => {
  const r = rig(); let restored; try { const doc = await upload(r), { job } = await begin(r, doc); await finished(r, job.id);
    const key = 'memory/simulator-style-task-' + job.id + '.json', saved = JSON.parse(r.files.get(key)); saved.status = 'queued'; saved.updatedAt = 0; r.files.set(key, JSON.stringify(saved));
    restored = rig(undefined, new Map(r.files)); const state = await restored.call('writingStyleTaskStatus', { id: job.id }); assert.equal(state.status, 'interrupted');
    const details = await restored.call('writingStyleTaskGet', { id: job.id }); assert.ok(details.results.length); assert.equal(restored.requests.length, 0);
  } finally { r.api.dispose(); restored?.api.dispose(); }
});
test('文风库损坏时拒绝覆盖，读操作不改写原文件', async () => {
  const r = rig(); try { r.files.set('memory/simulator-writing-styles.json', '{损坏内容'); await assert.rejects(r.api.list()); assert.equal(r.files.get('memory/simulator-writing-styles.json'), '{损坏内容'); } finally { r.api.dispose(); }
});
