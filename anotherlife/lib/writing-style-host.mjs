import { randomUUID } from 'node:crypto';
import { STYLE_PREFIX, STYLE_LIMITS, sourceDocument, styleHash, planStyleAnalysis, analysisMessages, mergeMessages, parseStyleResult, verifyStyleEvidence, groupStyleResults, inputBudget } from './writing-style-core.mjs';
import { waitForStreamStep, closeStreamIterator } from './runtime-core.mjs';

export const WRITING_STYLE_HANDLES = ['writingStyleCatalog', 'writingStyleGet', 'writingStyleSave', 'writingStyleDelete', 'writingStyleUploadBegin', 'writingStyleUploadChunk', 'writingStyleUploadFinish', 'writingStyleUploadCancel', 'writingStylePreflight', 'writingStyleStart', 'writingStyleTaskStatus', 'writingStyleTaskGet', 'writingStyleTaskCancel', 'writingStyleTaskResume'];
const validId = value => { const id = String(value || ''); if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('文风资料编号无效'); return id; };
const cleanTitle = value => String(value || '').trim().slice(0, 100);
const taskSummary = j => ({ id: j.id, name: j.name, status: j.status, stage: j.stage || '', calls: j.calls || 0, completed: j.nextBatch || 0, batches: j.plan?.batches?.length || 0, error: j.error || '', updatedAt: j.updatedAt, sourceId: j.sourceId });

export function createWritingStyleHost({ reg, readonlyHandles, readJson, writeJson, serial, storeDir, llm, currentModel, invalidate, selectedId, log = async () => {} }) {
  const dbPath = storeDir + 'simulator-writing-styles.json';
  const sourcePath = id => storeDir + 'simulator-style-source-' + validId(id) + '.json';
  const jobPath = id => storeDir + 'simulator-style-task-' + validId(id) + '.json';
  const uploads = new Map(), plans = new Map(), running = new Map();
  let disposed = false;
  const readDB = async () => {
    const raw = await readJson(dbPath);
    if (raw == null) return { version: 1, guides: [], sources: [], jobs: [], preferences: {} };
    if (raw.version !== 1 || !Array.isArray(raw.guides) || !Array.isArray(raw.sources) || !Array.isArray(raw.jobs)) throw new Error('文风库格式损坏，原文件未改动');
    return raw;
  };
  const mutate = fn => serial('writing-style-library', async () => { const db = await readDB(); const result = await fn(db); await writeJson(dbPath, db); return result; });
  async function source(id) {
    const doc = await readJson(sourcePath(id));
    if (!doc || typeof doc.text !== 'string' || styleHash(doc.text) !== doc.hash) throw new Error('原文资料不存在或校验失败，请重新导入');
    return doc;
  }
  async function job(id) {
    const j = await readJson(jobPath(id)); if (!j) throw new Error('提炼任务不存在');
    if ((j.status === 'running' || (j.status === 'queued' && Date.now() - j.updatedAt > 5000)) && !running.has(j.id)) { j.status = 'interrupted'; j.error = '任务已中断，已完成的阶段结果仍保留；继续会产生新的模型请求'; await persist(j); }
    return j;
  }
  async function persist(j) {
    j.updatedAt = Date.now(); await writeJson(jobPath(j.id), j);
    await mutate(db => { const row = taskSummary(j), at = db.jobs.findIndex(x => x.id === j.id); if (at < 0) db.jobs.push(row); else db.jobs[at] = row; });
  }
  async function metadata(provider, model) {
    if (!provider || !model) throw new Error('请选择提炼服务和模型');
    try { return await llm?.resolveModelInfo?.(provider, model) || {}; } catch (e) { throw new Error('读取模型能力失败：' + (e.message || e)); }
  }
  async function preflight(args) {
    const doc = await source(args.sourceId);
    const selection = currentModel?.() || {};
    const provider = String(args.provider || selection.provider || '').trim(), model = String(args.model || selection.model || '').trim();
    const info = await metadata(provider, model);
    const declared = Number(info.contextWindow || info.context?.contextWindow) || 0;
    const contextWindow = Number(args.contextWindow) || declared;
    const maxTokens = args.maxTokens == null ? 8192 : Number(args.maxTokens);
    const options = { provider, model, contextWindow, maxTokens, mode: args.mode === 'chapters' ? 'chapters' : 'full', allowEstimateOverflow: args.allowEstimateOverflow === true };
    const plan = planStyleAnalysis(doc, options);
    const id = randomUUID();
    for (const [key, value] of plans) if (Date.now() - value.at > 1800000) plans.delete(key);
    if (plans.size >= 50) plans.delete(plans.keys().next().value);
    plans.set(id, { id, sourceId: doc.id, sourceHash: doc.hash, options, plan, at: Date.now() });
    return { id, source: { id: doc.id, name: doc.name, chars: doc.chars, bytes: doc.bytes, lines: doc.lines }, provider, model,
      declaredContext: declared, capacitySource: Number(args.contextWindow) ? '手动填写的渠道容量' : '模型声明', ...plan,
      batches: plan.batches.map(b => ({ startLine: b.startLine, endLine: b.endLine, inputTokens: b.inputTokens })),
      note: '令牌数为启发式估算，不是模型分词结果；还受渠道请求大小和实际模型限制。调用次数为至少值，分批综合可能增加请求。' };
  }
  async function request(messages, j, control) {
    if (!llm?.stream) throw new Error('当前运行时没有可用的模型服务');
    const ctl = new AbortController(); control.controller = ctl;
    const options = { provider: j.options.provider, model: j.options.model, maxTokens: j.options.maxTokens, temperature: 0.25,
      system: messages[0].content, signal: ctl.signal,
      messages: [{ id: 'style-' + randomUUID(), role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: messages[1].content }] }] };
    let raw = '', finish = '', usage;
    const blocks = new Map(); let iterator;
    j.calls++; j.stage = j.stage || '分析中'; await persist(j);
    try {
      iterator = llm.stream(options)[Symbol.asyncIterator](); let got = false;
      for (;;) {
        const step = await waitForStreamStep(iterator, got ? 300000 : 1800000, () => control.stop || disposed);
        if (step?.__stopped) throw new Error('已停止');
        if (step?.__timeout) throw new Error('模型长时间没有返回内容，已中断；不会自动重试');
        if (step.done) break;
        const chunk = step.value || {}; got = true;
        if (chunk.type === 'text-delta') { const key = chunk.index || 0; blocks.set(key, (blocks.get(key) || '') + String(chunk.text || '')); }
        if (chunk.type === 'block-end' && chunk.block?.type === 'text' && !blocks.has(chunk.index || 0)) blocks.set(chunk.index || 0, chunk.block.text || '');
        raw = [...blocks.values()].join('');
        if (raw.length > 1500000) throw new Error('模型返回内容过大，已中断；已有输出保留');
        if (chunk.type === 'usage') usage = chunk.usage;
        if (chunk.type === 'finish') {
          finish = chunk.reason?.kind || '';
          if (finish === 'error' || finish === 'aborted') throw new Error(chunk.reason.failure?.message || '模型请求失败');
        }
      }
      if (control.stop || disposed) throw new Error('已停止');
      if (finish === 'max-tokens' || finish === 'length') throw new Error('模型输出被预算截断，未作为完整指导应用；请查看原始输出或调整预算后继续');
      if (finish !== 'stop') throw new Error('模型流没有正常完成，已有输出保留；不会自动重试');
      return raw;
    } finally {
      j.lastRaw = raw; j.lastUsage = usage || null; j.lastFinish = finish;
      ctl.abort(); control.controller = null;
      if (iterator) await closeStreamIterator(iterator);
    }
  }
  async function run(j, control) {
    try {
      const doc = await source(j.sourceId);
      if (doc.hash !== j.sourceHash) throw new Error('原文版本已变化，任务取消');
      j.status = 'running'; j.error = ''; await persist(j);
      while (j.nextBatch < j.plan.batches.length) {
        if (control.stop || disposed) throw new Error('已停止');
        if (j.calls >= STYLE_LIMITS.maxCalls) throw new Error('已达到200次请求上限，阶段结果已保留');
        const b = j.plan.batches[j.nextBatch]; j.stage = `分析 ${j.nextBatch + 1}/${j.plan.batches.length} · 第${b.startLine}—${b.endLine}行`;
        const raw = await request(analysisMessages(doc.text.slice(b.start, b.end), b.startLine), j, control);
        const result = parseStyleResult(raw, doc.text);
        j.results.push({ ...result, range: { startLine: b.startLine, endLine: b.endLine } }); j.nextBatch++; await persist(j);
      }
      if (!j.merge) j.merge = { round: 0, inputs: j.results, cursor: 0, outputs: [] };
      while (j.merge.inputs.length > 1) {
        if (j.merge.round >= STYLE_LIMITS.maxRounds) throw new Error('多轮综合尚未收敛，阶段结果已保留');
        const groups = groupStyleResults(j.merge.inputs, j.plan.available);
        while (j.merge.cursor < groups.length) {
          if (control.stop || disposed) throw new Error('已停止');
          if (j.calls >= STYLE_LIMITS.maxCalls) throw new Error('已达到200次请求上限，阶段结果已保留');
          const group = groups[j.merge.cursor]; j.stage = `综合第${j.merge.round + 1}层 ${j.merge.cursor + 1}/${groups.length}`;
          const result = group.length === 1 ? group[0] : parseStyleResult(await request(mergeMessages(group), j, control), doc.text);
          j.merge.outputs.push(result); j.merge.cursor++; await persist(j);
        }
        j.merge = { round: j.merge.round + 1, inputs: j.merge.outputs, cursor: 0, outputs: [] }; await persist(j);
      }
      if (control.stop || disposed) throw new Error('已停止');
      j.result = j.merge.inputs[0]; j.status = 'completed'; j.stage = '提炼完成，尚未保存或启用'; j.lastRaw = ''; await persist(j);
      await log('[文风提炼] 完成 task=' + j.id + ' calls=' + j.calls);
    } catch (error) {
      j.status = control.stop || disposed ? 'stopped' : 'failed'; j.error = String(error.message || error); await persist(j);
      await log('[文风提炼] ' + j.status + ' task=' + j.id + ' calls=' + j.calls);
    } finally { running.delete(j.id); }
  }
  function launch(j) {
    if (disposed) throw new Error('插件正在停止');
    if (running.has(j.id)) return;
    const control = { stop: false, controller: null }; running.set(j.id, control);
    // 任务独立执行，不能把一次长模型调用挂在游戏/全局设置的串行锁里。
    control.promise = Promise.resolve().then(() => run(j, control)).catch(() => { running.delete(j.id); });
  }
  async function start({ preflightId }) {
    return serial('writing-style-start', async () => {
      const existing = await readJson(jobPath(preflightId)); if (existing) return taskSummary(existing);
      const p = plans.get(String(preflightId)); if (!p || Date.now() - p.at > 1800000) throw new Error('容量预检已过期，请重新预检');
      if (!p.plan.canStart) throw new Error('估算输入超出预算，请选择分章、更长容量，或明确确认仍发送全文');
      if (running.size >= 2) throw new Error('已有两个提炼任务运行，请先等待或停止');
      const doc = await source(p.sourceId);
      if (doc.hash !== p.sourceHash) throw new Error('原文版本已变化，请重新预检');
      const j = { version: 1, id: p.id, name: doc.name, sourceId: doc.id, sourceHash: doc.hash, options: p.options, plan: p.plan,
        status: 'queued', nextBatch: 0, calls: 0, results: [], createdAt: Date.now(), updatedAt: Date.now() };
      await persist(j); await mutate(db => { db.preferences = p.options; }); launch(j); return taskSummary(j);
    });
  }
  const register = (name, fn) => { readonlyHandles.add(name); reg(name, fn); };
  register('writingStyleCatalog', async () => {
    const db = await readDB();
    const jobs = [];
    for (const row of db.jobs.slice(-30).reverse()) jobs.push(taskSummary(await job(row.id)));
    return { guides: db.guides.map(g => ({ id: STYLE_PREFIX + g.id, name: g.name, chars: g.guide.length, version: g.version, updatedAt: g.updatedAt })), sources: db.sources, jobs, preferences: db.preferences || {}, limits: STYLE_LIMITS };
  });
  register('writingStyleGet', async ({ id }) => {
    const db = await readDB(), item = db.guides.find(x => STYLE_PREFIX + x.id === id); if (!item) throw new Error('文风不存在');
    return item;
  });
  register('writingStyleSave', async ({ id, name, guide, evidence, sourceId, expectedVersion }) => {
    const title = cleanTitle(name), body = String(guide || '').trim();
    if (!title || !body) throw new Error('名称和指导正文都要填写');
    if (body.length > STYLE_LIMITS.guideChars) throw new Error('指导超过20万字符，未截断保存');
    let rows = [], sourceRef = '';
    if (sourceId) { const doc = await source(sourceId); rows = verifyStyleEvidence(evidence, doc.text); sourceRef = doc.id; }
    else rows = verifyStyleEvidence(evidence, '');
    return mutate(db => {
      const key = id ? String(id).replace(/^style:/, '') : randomUUID(); validId(key);
      const at = db.guides.findIndex(g => g.id === key), old = db.guides[at];
      if (id && !old) throw new Error('该文风已被删除，请另存为');
      if (old && Number(expectedVersion) !== old.version) throw new Error('文风已在别处修改，请重新打开，或另存为新文风');
      if (db.guides.some(g => g.id !== key && g.name === title)) throw new Error('已有同名文风，请改名或打开原文风编辑');
      const item = { id: key, name: title, guide: body, evidence: rows, sourceId: sourceRef, version: (old?.version || 0) + 1, createdAt: old?.createdAt || Date.now(), updatedAt: Date.now() };
      if (old) db.guides[at] = item; else db.guides.push(item);
      return { ...item, selectionId: STYLE_PREFIX + key };
    }).then(saved => { invalidate(); return saved; });
  });
  register('writingStyleDelete', async ({ id, expectedVersion }) => mutate(async db => {
    if (String(await selectedId()) === id) throw new Error('这份文风正在启用，请先在写作指导中切换');
    const at = db.guides.findIndex(g => STYLE_PREFIX + g.id === id); if (at < 0) throw new Error('文风已不存在');
    if (db.guides[at].version !== Number(expectedVersion)) throw new Error('文风已改变，请重新打开再删除');
    db.guides.splice(at, 1); return { ok: true };
  }).then(saved => { invalidate(); return saved; }));
  register('writingStyleUploadBegin', async ({ name, chars }) => {
    for (const [key, u] of uploads) if (Date.now() - u.at > 1800000) uploads.delete(key);
    if ([...uploads.values()].filter(u => !u.result).length >= 4) throw new Error('待完成的原文上传过多，请稍后重试');
    const size = Number(chars); if (!Number.isSafeInteger(size) || size < 1 || size > STYLE_LIMITS.sourceBytes) throw new Error('原文字数无效或过大');
    const id = randomUUID(); uploads.set(id, { name: cleanTitle(name) || '小说原文', chars: size, parts: [], received: 0, at: Date.now() }); return { id, chunkChars: STYLE_LIMITS.chunkChars };
  });
  register('writingStyleUploadChunk', ({ id, index, text }) => serial('writing-style-upload:' + id, async () => {
    const u = uploads.get(id); if (!u || Date.now() - u.at > 1800000) throw new Error('上传已过期，请重新导入');
    if (typeof text !== 'string' || text.length > STYLE_LIMITS.chunkChars) throw new Error('上传分片过大或无效');
    if (!Number.isInteger(index) || index < 0 || index > u.parts.length) throw new Error('上传分片顺序错误');
    if (index < u.parts.length) { if (u.parts[index] !== text) throw new Error('上传分片内容冲突'); return { received: u.received }; }
    if (u.received + text.length > u.chars) throw new Error('上传长度超过声明值');
    u.parts.push(text); u.received += text.length; u.at = Date.now(); return { received: u.received };
  }));
  register('writingStyleUploadFinish', ({ id }) => serial('writing-style-upload:' + id, async () => {
    const u = uploads.get(id); if (u?.result) return u.result; if (!u || u.received !== u.chars) throw new Error('上传未完成，请重新导入');
    const doc = { id: randomUUID(), name: u.name, ...sourceDocument(u.parts.join('')), createdAt: Date.now() };
    const row = { id: doc.id, name: doc.name, chars: doc.chars, bytes: doc.bytes, lines: doc.lines, hash: doc.hash };
    await writeJson(sourcePath(doc.id), doc); await mutate(db => { db.sources.push(row); }); u.result = row; u.parts = []; u.at = Date.now(); return row;
  }));
  register('writingStyleUploadCancel', ({ id }) => { uploads.delete(String(id || '')); return { ok: true }; });
  register('writingStylePreflight', preflight);
  register('writingStyleStart', start);
  register('writingStyleTaskStatus', async ({ id }) => taskSummary(await job(id)));
  register('writingStyleTaskGet', ({ id }) => job(id));
  register('writingStyleTaskCancel', async ({ id }) => {
    const control = running.get(id);
    if (control) { control.stop = true; control.controller?.abort(); return { ok: true }; }
    return { ok: true, status: (await job(id)).status };
  });
  register('writingStyleTaskResume', async ({ id, options }) => serial('writing-style-start', async () => {
    const j = await job(id); if (running.has(id) || j.status === 'completed') return taskSummary(j);
    if (running.size >= 2) throw new Error('已有两个提炼任务运行');
    if (options && typeof options === 'object') {
      const provider = String(options.provider || j.options.provider), model = String(options.model || j.options.model);
      const info = await metadata(provider, model);
      const budget = inputBudget(Number(options.contextWindow) || Number(info.contextWindow || info.context?.contextWindow), Number(options.maxTokens) || j.options.maxTokens);
      const allowEstimateOverflow = options.allowEstimateOverflow === true;
      if (j.plan.batches.slice(j.nextBatch).some(b => b.inputTokens > budget.available) && !(j.options.mode === 'full' && allowEstimateOverflow)) throw new Error('剩余原文超过新容量，请提高容量，或新建分章任务；旧任务未改动');
      j.options = { ...j.options, provider, model, contextWindow: budget.capacity, maxTokens: budget.output, allowEstimateOverflow };
      Object.assign(j.plan, budget);
    }
    j.status = 'queued'; j.error = ''; await persist(j); launch(j); return taskSummary(j);
  }));
  return {
    async list() { return (await readDB()).guides.map(g => ({ id: STYLE_PREFIX + g.id, name: g.name, purpose: 'writing', chars: g.guide.length, origin: 'library' })); },
    async body(id) { return (await readDB()).guides.find(g => STYLE_PREFIX + g.id === id)?.guide || ''; },
    dispose() { disposed = true; uploads.clear(); plans.clear(); for (const c of running.values()) { c.stop = true; c.controller?.abort(); } },
  };
}
