export function createWritingStyleViews(React) {
  const h = React.createElement;
  const emptyDraft = () => ({ id: '', name: '', guide: '', evidence: [], sourceId: '', version: 0 });
  const errorText = e => String(e?.message || e || '操作失败');
  function download(name, body, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function WritingStylePanel({ call, gameId, activeId, activeBody, onChange }) {
    const [catalog, setCatalog] = React.useState({ guides: [], sources: [], jobs: [], preferences: {} });
    const [draft, setDraft] = React.useState(emptyDraft);
    const [sourceId, setSourceId] = React.useState('');
    const [paste, setPaste] = React.useState('');
    const [sourceName, setSourceName] = React.useState('');
    const [encoding, setEncoding] = React.useState('utf-8');
    const [providers, setProviders] = React.useState([]);
    const [models, setModels] = React.useState([]);
    const [options, setOptions] = React.useState({ provider: '', model: '', contextWindow: 1000000, maxTokens: 8192, mode: 'full', allowEstimateOverflow: false });
    const [plan, setPlan] = React.useState(null);
    const [task, setTask] = React.useState(null);
    const [raw, setRaw] = React.useState('');
    const [partials, setPartials] = React.useState([]);
    const [busy, setBusy] = React.useState(false);
    const [note, setNote] = React.useState('');
    const [review, setReview] = React.useState(false);
    const [dirty, setDirty] = React.useState(false);
    const [confirm, setConfirm] = React.useState('');
    const owner = React.useRef(0), latest = React.useRef({ draft, options, sourceId });
    const changed = React.useRef(onChange); changed.current = onChange; latest.current = { draft, options, sourceId };
    const api = (name, args = {}) => call(name, args, gameId);
    const reload = async () => { const db = await api('writingStyleCatalog'); setCatalog(db); return db; };
    const action = fn => async () => {
      const token = owner.current; setBusy(true); setNote('');
      try { await fn(); } catch (e) { if (token === owner.current) setNote(errorText(e)); }
      finally { if (token === owner.current) setBusy(false); }
    };
    React.useEffect(() => {
      const token = ++owner.current;
      setTask(null); setPlan(null); setDraft(emptyDraft()); setDirty(false); setReview(false); setConfirm(''); setRaw(''); setPartials([]); setBusy(false);
      Promise.all([api('writingStyleCatalog'), api('modelChoices')]).then(([db, choices]) => {
        if (owner.current !== token) return;
        setCatalog(db); setProviders(choices.providers || []);
        const pref = db.preferences || {}, current = choices.current || {};
        setOptions(v => ({ ...v, ...pref, provider: pref.provider || current.provider || '', model: pref.model || current.model || '', allowEstimateOverflow: false }));
        setModels(choices.models || []);
      }).catch(e => { if (owner.current === token) setNote(errorText(e)); });
      return () => { owner.current++; };
    }, [gameId]);
    React.useEffect(() => {
      if (!options.provider) { setModels([]); return; }
      let alive = true;
      api('modelsOf', { provider: options.provider }).then(r => { if (alive) setModels(r.models || []); }).catch(e => { if (alive) setNote(errorText(e)); });
      return () => { alive = false; };
    }, [options.provider, gameId]);
    const taskId = task?.id || '';
    React.useEffect(() => {
      if (!taskId) return;
      let alive = true, timer;
      const tick = async () => {
        try {
          const status = await api('writingStyleTaskStatus', { id: taskId }); if (!alive) return;
          setTask(status);
          if (['queued', 'running'].includes(status.status)) timer = setTimeout(tick, 1800);
          else { await reload(); if (!alive) return; setNote(status.status === 'completed' ? '提炼完成，点“查看结果”后可修改和保存。' : status.error || '任务已停止'); }
        } catch (e) { if (alive) setNote(errorText(e)); }
      };
      tick(); return () => { alive = false; clearTimeout(timer); };
    }, [taskId, task?.status === 'queued', gameId]);
    function changeOption(key, value) { setOptions(v => ({ ...v, [key]: value })); setPlan(null); }
    function edit(key, value) { setDraft(v => ({ ...v, [key]: value })); setDirty(true); }
    async function upload(text, name) {
      const token = owner.current;
      if (!text.trim()) throw new Error('原文为空');
      const begin = await api('writingStyleUploadBegin', { name, chars: text.length });
      let complete = false;
      try {
      const size = begin.chunkChars || 48000;
      for (let start = 0, index = 0; start < text.length; start += size, index++) {
        if (owner.current !== token) return;
        await api('writingStyleUploadChunk', { id: begin.id, index, text: text.slice(start, start + size) });
        if (owner.current === token) setNote('上传原文 ' + Math.round(Math.min(text.length, start + size) / text.length * 100) + '%');
      }
      const doc = await api('writingStyleUploadFinish', { id: begin.id }); if (owner.current !== token) return;
      complete = true;
      setSourceId(doc.id); setPlan(null); setPaste(''); setSourceName(doc.name); await reload(); setNote('已导入 ' + doc.name + '，' + doc.chars + ' 字；尚未调用模型。');
      } finally { if (!complete) await api('writingStyleUploadCancel', { id: begin.id }).catch(() => {}); }
    }
    async function inspectTask(id) {
      if (dirty) { setConfirm('replace:' + id); return; }
      await openTask(id);
    }
    async function openTask(id) {
      const data = await api('writingStyleTaskGet', { id }); setOptions(v => ({ ...v, ...data.options, allowEstimateOverflow: false })); setPlan(null); setTask(data); setRaw(data.lastRaw || ''); setPartials(data.results || []);
      if (data.result) {
        setDraft({ ...emptyDraft(), name: data.result.name, guide: data.result.guide, evidence: data.result.evidence || [], sourceId: data.sourceId });
        setReview(true); setDirty(false); setNote('这是提炼草稿，尚未保存或启用。');
      } else { setReview(true); setNote(data.error || '任务尚未完成，可查看已完成阶段。'); }
    }
    async function saveDraft(asNew) {
      const d = latest.current.draft;
      const saved = await api('writingStyleSave', { ...d, id: asNew ? '' : d.id, expectedVersion: d.version });
      setDraft({ ...saved, id: saved.selectionId }); setDirty(false); await reload(); await changed.current?.(); setNote('已保存，未切换当前写作指导。');
    }
    function requestOpenGuide(id) {
      if (dirty) { setConfirm('guide:' + id); return; }
      return openGuide(id);
    }
    async function openGuide(id) {
      const saved = await api('writingStyleGet', { id }); setDraft({ ...saved, id }); setReview(true); setDirty(false); setRaw(''); setPartials([]);
    }
    const field = (label, node) => h('div', { className: 'sim-field' }, h('label', null, label), node);
    const button = (label, handler, disabled = busy) => h('button', { type: 'button', className: 'sim-btn', key: label, disabled, onClick: action(handler) }, label);
    const input = (value, onChange, extra = {}) => h('input', { className: 'sim-inp', value, disabled: busy, onChange: e => onChange(e.target.value), ...extra });
    const number = (label, key, min, max) => field(label, input(options[key], v => changeOption(key, v), { type: 'number', min, max, step: 1 }));
    const selectedSource = catalog.sources.find(s => s.id === sourceId);
    const activeTask = task && ['queued', 'running'].includes(task.status);
    return h('section', { className: 'sim-style-workbench', style: { borderTop: '1px solid var(--sim-bd)', paddingTop: 12, marginTop: 12 } },
      h('style', null, '.sim-style-workbench .sim-inp,.sim-style-workbench .sim-ta{box-sizing:border-box;width:100%;max-width:100%;min-width:0;background:var(--sim-bg);color:var(--sim-t);border:1px solid var(--sim-bd);border-radius:7px;padding:8px;font:inherit}.sim-style-workbench .sim-ta{resize:vertical;line-height:1.7}.sim-style-workbench blockquote{margin:8px 0;padding-left:10px;border-left:2px solid var(--sim-bd)}.sim-style-workbench .sim-acts{flex-wrap:wrap}'),
      h('div', { className: 'sim-acts' },
        button('从小说提炼／管理文风', async () => { setReview(v => !v); }),
        button('新建指导', async () => {
          if (dirty) { setConfirm('new'); return; } setDraft(emptyDraft()); setReview(true); setDirty(false); setRaw(''); setPartials([]);
        }),
        button('复制当前指导', async () => {
          if (!activeBody) throw new Error('当前没有启用指导');
          if (dirty) { setConfirm('copy'); return; }
          setDraft({ ...emptyDraft(), name: '指导副本', guide: activeBody }); setReview(true); setDirty(true);
        })),
      note ? h('div', { className: 'sim-hint', role: 'status', style: { whiteSpace: 'pre-wrap', marginTop: 8 } }, note) : null,
      review ? h(React.Fragment, null,
        h('h4', null, '文风库'),
        h('div', { className: 'sim-acts' }, catalog.guides.map(g => button(g.name + (g.id === activeId ? ' · 已启用' : ''), () => requestOpenGuide(g.id)))),
        h('details', { open: true }, h('summary', null, '小说原文与容量预检'),
          field('原文资料', h('select', { className: 'sim-select', value: sourceId, disabled: busy, onChange: e => { setSourceId(e.target.value); setPlan(null); } },
            h('option', { value: '' }, '选择已导入原文'), catalog.sources.map(s => h('option', { key: s.id, value: s.id }, s.name + ' · ' + s.chars + '字')))),
          selectedSource ? h('div', { className: 'sim-hint' }, selectedSource.chars + '字 · ' + selectedSource.lines + '行 · ' + (selectedSource.bytes / 1048576).toFixed(2) + ' MB') : null,
          field('文本编码', h('select', { className: 'sim-select', value: encoding, onChange: e => setEncoding(e.target.value) }, h('option', { value: 'utf-8' }, 'UTF-8'), h('option', { value: 'gb18030' }, 'GB18030／GBK'))),
          field('导入 TXT／Markdown', h('input', { type: 'file', accept: '.txt,.md,text/plain,text/markdown', disabled: busy, onChange: e => {
            const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
            action(async () => { if (file.size > 32 * 1048576) throw new Error('原文超过32 MB'); let text; try { text = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer()); } catch { throw new Error('无法按当前编码读取，请切换文本编码后重新导入'); } await upload(text, file.name); })();
          } })),
          h('details', null, h('summary', null, '或粘贴原文'), field('资料名称', input(sourceName, setSourceName)),
            h('textarea', { className: 'sim-ta', rows: 7, value: paste, onChange: e => setPaste(e.target.value), placeholder: '粘贴小说原文，不是剧情摘要' }),
            button('导入粘贴原文', () => upload(paste, sourceName || '粘贴原文'))),
          field('提炼服务', h('select', { className: 'sim-select', value: options.provider, disabled: busy, onChange: e => { changeOption('provider', e.target.value); changeOption('model', ''); } },
            h('option', { value: '' }, '选择服务'), providers.map(p => h('option', { key: p.id, value: p.id }, p.name || p.id)))),
          field('提炼模型', h(React.Fragment, null, input(options.model, v => changeOption('model', v), { list: 'sim-style-models-' + gameId }),
            h('datalist', { id: 'sim-style-models-' + gameId }, models.map(m => h('option', { key: m.id, value: m.id }, m.name || m.id))))),
          number('渠道上下文容量（令牌，0＝读取模型声明）', 'contextWindow', 0, 10000000),
          number('输出预算（令牌，需符合所选模型限制）', 'maxTokens', 512, 131072),
          field('分析方式', h('select', { className: 'sim-select', value: options.mode, disabled: busy, onChange: e => changeOption('mode', e.target.value) },
            h('option', { value: 'full' }, '全文一次分析'), h('option', { value: 'chapters' }, '按章节／段落分批后综合'))),
          field('', h('label', null, h('input', { type: 'checkbox', checked: options.allowEstimateOverflow, disabled: busy, onChange: e => changeOption('allowEstimateOverflow', e.target.checked) }), '估算超限时仍确认发送全文，接受渠道拒绝或截断风险')),
          h('div', { className: 'sim-acts' }, button('容量预检（不调用生成）', async () => { const p = await api('writingStylePreflight', { sourceId, ...options }); setPlan(p); setNote('预检完成，尚未调用生成模型。'); }, busy || !sourceId)),
          plan ? h('div', { className: 'sim-card', style: { marginTop: 8 } },
            h('div', null, '提炼模型：' + plan.provider + ' / ' + plan.model),
            h('div', null, '全文输入估算：' + plan.inputTokens.toLocaleString() + ' 令牌'),
            h('div', null, '上下文：' + plan.capacity.toLocaleString() + ' · 输出预留：' + plan.output.toLocaleString() + ' · 余量：' + plan.margin.toLocaleString()),
            h('div', null, plan.capacitySource + (plan.declaredContext ? '；模型声明 ' + plan.declaredContext.toLocaleString() : '；模型未声明容量')),
            h('div', null, '分析 ' + plan.batches.length + ' 批，至少 ' + plan.callsAtLeast + ' 次模型请求。' + (plan.mode === 'full' && !plan.fits ? '估算超出输入预算。' : '')),
            h('div', { className: 'sim-hint' }, plan.note),
            h('details', null, h('summary', null, '查看原文覆盖范围'), plan.batches.map((b, i) => h('div', { key: i }, '第' + (i + 1) + '批：第' + b.startLine + '—' + b.endLine + '行，估算' + b.inputTokens + '令牌'))),
            button('开始提炼', async () => { const j = await api('writingStyleStart', { preflightId: plan.id }); setTask(j); setNote('任务已启动；生成完成后仍需手动保存。'); }, busy || !plan.canStart || activeTask)) : null),
        h('h4', null, '提炼任务'),
        activeTask ? h('div', { role: 'status' }, task.stage || '准备中', ' · 已请求 ' + task.calls + ' 次',
          button('停止任务', () => api('writingStyleTaskCancel', { id: task.id }), false)) : null,
        catalog.jobs.map(j => h('div', { key: j.id, className: 'sim-acts', style: { marginBottom: 6 } },
          h('span', null, j.name + ' · ' + ({ completed: '完成', running: '运行中', queued: '准备中', failed: '失败', stopped: '停止', interrupted: '中断' }[j.status] || j.status)),
          button('查看结果', () => inspectTask(j.id)),
          ['failed', 'stopped', 'interrupted'].includes(j.status) ? button('继续／重试', async () => { setConfirm('resume:' + j.id); }) : null)),
        h('h4', null, '指导预览与修改'),
        field('文风名称', input(draft.name, v => edit('name', v))),
        h('textarea', { className: 'sim-ta', rows: 18, disabled: busy, value: draft.guide, onChange: e => edit('guide', e.target.value), placeholder: '提炼结果会显示在这里，也可直接粘贴或编写文风指导。只有此正文会在启用后注入写作。' }),
        h('div', { className: 'sim-acts' }, button('保存', () => saveDraft(false)), button('另存为', () => saveDraft(true)),
          button('导出指导', async () => { if (!draft.guide.trim()) throw new Error('指导为空'); download((draft.name || '文风指导').replace(/[\\/:*?"<>|]/g, '_') + '.json', JSON.stringify({ type: 'anotherlife-writing-style', version: 1, name: draft.name, guide: draft.guide, evidence: draft.evidence }, null, 2)); }),
          draft.id ? button('删除', async () => setConfirm('delete')) : null),
        field('导入已有文风 JSON', h('input', { type: 'file', accept: '.json', disabled: busy, onChange: e => {
          const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
          action(async () => { if (dirty) throw new Error('请先保存或新建，避免覆盖未保存的修改'); if (file.size > 2 * 1048576) throw new Error('指导文件过大'); const j = JSON.parse(await file.text()); if (j.type !== 'anotherlife-writing-style' || typeof j.guide !== 'string') throw new Error('不是文风指导导出文件'); setDraft({ ...emptyDraft(), name: String(j.name || '导入指导'), guide: j.guide, evidence: Array.isArray(j.evidence) ? j.evidence.map(v => ({ ...v, verified: false, note: '导入资料，需本机原文重新核验' })) : [] }); setDirty(true); })();
        } })),
        h('details', null, h('summary', null, '提炼依据（不随指导注入正文）'),
          draft.evidence.length ? draft.evidence.map((e, i) => h('div', { key: i, className: 'sim-card', style: { marginTop: 8 } },
            h('strong', null, e.dimension + ' · ' + (e.verified ? '原文匹配' : '未核验')),
            h('div', null, e.claim), h('blockquote', { style: { whiteSpace: 'pre-wrap' } }, e.quote),
            h('div', { className: 'sim-hint' }, (e.startLine ? '第' + e.startLine + '—' + e.endLine + '行 · ' + (e.location || '') + ' · ' : '') + (e.scope || '') + ' ' + (e.note || '')))) : h('div', { className: 'sim-hint' }, '当前没有提炼依据。'),
          h('div', { className: 'sim-hint' }, '摘录匹配仅证明引文存在，不证明结论正确，也不代表全文理解覆盖率。')),
        partials.length ? h('details', null, h('summary', null, '已完成阶段（' + partials.length + '）'), partials.map((p, i) => h('details', { key: i }, h('summary', null, p.name || '阶段' + (i + 1)), h('pre', { style: { whiteSpace: 'pre-wrap' } }, p.guide),
          button('用此阶段作为草稿', async () => { if (dirty) throw new Error('请先保存当前修改'); setDraft({ ...emptyDraft(), name: p.name || '阶段指导', guide: p.guide, evidence: p.evidence || [], sourceId: task?.sourceId || '' }); setDirty(false); })))) : null,
        raw ? h('details', null, h('summary', null, '未完成的原始输出'), h('pre', { style: { whiteSpace: 'pre-wrap' } }, raw)) : null,
        confirm ? h('div', { className: 'sim-card', role: 'alert' },
          h('p', null, confirm.startsWith('resume:') ? '继续将使用当前模型和预算，沿用原分批范围并请求未完成阶段；会产生费用，已完成阶段不重复生成。' : confirm === 'delete' ? '删除这份文风？原文资料和提炼任务不会删除。' : '放弃当前未保存的修改？'),
          button('确认', async () => {
            const kind = confirm; setConfirm('');
            if (kind.startsWith('resume:')) { const j = await api('writingStyleTaskResume', { id: kind.slice(7), options: latest.current.options }); setTask(j); await reload(); }
            else if (kind.startsWith('replace:')) await openTask(kind.slice(8));
            else if (kind.startsWith('guide:')) await openGuide(kind.slice(6));
            else if (kind === 'delete') { await api('writingStyleDelete', { id: draft.id, expectedVersion: draft.version }); setDraft(emptyDraft()); setDirty(false); await reload(); await changed.current?.(); }
            else { setDraft(kind === 'copy' ? { ...emptyDraft(), name: '指导副本', guide: activeBody } : emptyDraft()); setDirty(kind === 'copy'); setRaw(''); setPartials([]); }
          }), button('取消', async () => setConfirm(''))) : null) : null);
  }
  return { WritingStylePanel };
}
