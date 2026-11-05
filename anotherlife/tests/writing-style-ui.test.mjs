import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWritingStyleViews } from '../lib/writing-style-client.js';

const walk = (n, out = []) => { if (Array.isArray(n)) n.forEach(v => walk(v, out)); else if (n && typeof n === 'object') { out.push(n); walk(n.kids || [], out); } return out; };
const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.kids || []) : '';
function mount(handler) {
  const slots = [], effects = []; let cursor = 0, hooks = 0;
  const React = { Fragment: 'fragment', createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(fn, deps) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, n) => !Object.is(v, old.deps[n]))) { old?.cleanup?.(); slots[i] = { deps }; effects.push(() => { slots[i].cleanup = fn(); }); } } };
  const views = createWritingStyleViews(React), calls = []; let changed = 0, gameId = 'test';
  const api = async (name, args) => {
    calls.push([name, args]); if (handler) { const result = await handler(name, args); if (result !== undefined) return result; }
    if (name === 'writingStyleCatalog') return { guides: [{ id: 'style:sample', name: '已存文风', version: 1 }], sources: [], jobs: [], preferences: {} };
    if (name === 'modelChoices') return { current: { provider: 'test', model: 'long' }, providers: [{ id: 'test', name: '测试模型' }], models: [{ id: 'long', name: '长上下文' }] };
    if (name === 'modelsOf') return { models: [{ id: 'long', name: '长上下文' }] };
    if (name === 'writingStyleGet') return { id: 'sample', name: '已存文风', guide: '已有正文', evidence: [], version: 1 };
    if (name === 'writingStyleSave') return { id: 'saved', selectionId: 'style:saved', name: args.name, guide: args.guide, evidence: [], version: args.id ? 2 : 1 };
    return {};
  };
  const render = () => { cursor = 0; const tree = views.WritingStylePanel({ call: api, gameId, activeId: 'style:active', activeBody: '当前启用的指导', onChange: async () => { changed++; } }); if (hooks) assert.equal(cursor, hooks, 'hook数量必须稳定'); hooks = cursor; return tree; };
  const flush = async () => { for (let i = 0; i < 8; i++) { while (effects.length) effects.shift()(); await Promise.resolve(); } };
  const click = async text => { const button = walk(render()).find(n => n.type === 'button' && words(n) === text); assert.ok(button, '按钮不存在：' + text); assert.equal(button.props.disabled, false, '按钮不应被禁用：' + text); await button.props.onClick(); await flush(); };
  const field = name => walk(render()).find(n => n.type === 'div' && n.props.className === 'sim-field' && words(n.kids[0]) === name);
  return { render, flush, click, calls, field, views, setGame: v => { gameId = v; }, get changed() { return changed; }, cleanup() { slots.forEach(s => s?.cleanup?.()); } };
}
async function open(handler) { const m = mount(handler); m.render(); await m.flush(); await m.click('从小说提炼／管理文风'); return m; }

test('界面入口加载不触发生成，支持既有文风和1M容量填写', async () => {
  const m = await open(); try { const text = words(m.render()); assert.match(text, /已存文风/); assert.match(text, /全文一次分析/); assert.match(text, /容量预检/); assert.match(text, /指导预览与修改/);
    const capacity = walk(m.field('渠道上下文容量（令牌，0＝读取模型声明）')).find(n => n.type === 'input'); assert.equal(capacity.props.value, 1000000); assert.ok(!m.calls.some(([name]) => name === 'writingStyleStart'));
  } finally { m.cleanup(); }
});
test('手动指导编辑后保存，不自动切换当前指导，组件类型与hook稳定', async () => {
  const m = await open(); try {
    const type = m.views.WritingStylePanel;
    const name = walk(m.field('文风名称')).find(n => n.type === 'input'); name.props.onChange({ target: { value: '我的指导' } });
    const editor = walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18); editor.props.onChange({ target: { value: '只管写法，不改变剧情。' } });
    await m.click('保存'); const save = m.calls.find(([n]) => n === 'writingStyleSave'); assert.equal(save[1].name, '我的指导'); assert.equal(save[1].guide, '只管写法，不改变剧情。'); assert.equal(m.changed, 1);
    assert.ok(!m.calls.some(([name]) => name === 'saveWritingSkill')); assert.equal(m.views.WritingStylePanel, type); assert.match(words(m.render()), /未切换当前写作指导/);
  } finally { m.cleanup(); }
});
test('未保存指导切换前先确认，取消后保留编辑内容', async () => {
  const m = await open(); try {
    walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.onChange({ target: { value: '未保存内容' } });
    await m.click('已存文风'); assert.match(words(m.render()), /放弃当前未保存/); assert.ok(!m.calls.some(([n]) => n === 'writingStyleGet'));
    await m.click('取消'); assert.equal(walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.value, '未保存内容');
    await m.click('已存文风'); await m.click('确认'); assert.ok(m.calls.some(([n]) => n === 'writingStyleGet'));
  } finally { m.cleanup(); }
});
test('另存为清空目标编号，原版本号仍由服务端校验', async () => {
  const m = await open(); try { await m.click('已存文风'); walk(m.field('文风名称')).find(n => n.type === 'input').props.onChange({ target: { value: '副本' } }); await m.click('另存为');
    const save = m.calls.find(([n]) => n === 'writingStyleSave'); assert.equal(save[1].id, ''); assert.equal(save[1].name, '副本');
  } finally { m.cleanup(); }
});
test('粘贴长文本走分片上传，完成后才能做容量预检', async () => {
  const parts = []; const m = await open(async (name, args) => {
    if (name === 'writingStyleUploadBegin') return { id: 'upload', chunkChars: 4 };
    if (name === 'writingStyleUploadChunk') { parts.push(args.text); return {}; }
    if (name === 'writingStyleUploadFinish') return { id: 'source', name: '小说', chars: 12 };
    if (name === 'writingStylePreflight') return { id: 'plan', inputTokens: 1234, capacity: 1000000, output: 8192, margin: 50000, capacitySource: '手动填写', batches: [{ startLine: 1, endLine: 2, inputTokens: 1234 }], callsAtLeast: 1, mode: 'full', fits: true, canStart: true };
  }); try {
    const paste = walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 7); paste.props.onChange({ target: { value: '甲乙丙丁戊己庚辛壬癸子丑' } });
    await m.click('导入粘贴原文'); assert.equal(parts.join(''), '甲乙丙丁戊己庚辛壬癸子丑'); assert.equal(parts.length, 3);
    await m.click('容量预检（不调用生成）'); assert.match(words(m.render()), /1,234/); assert.ok(!m.calls.some(([n]) => n === 'writingStyleStart'));
  } finally { m.cleanup(); }
});
test('模型或容量变化使旧预检失效，不复用旧启动凭证', async () => {
  const m = await open(async name => {
    if (name === 'writingStyleCatalog') return { guides: [], sources: [{ id: 'source', name: '书' }], jobs: [], preferences: {} };
    if (name === 'writingStylePreflight') return { id: 'plan', inputTokens: 100, capacity: 1000000, output: 8192, margin: 50000, batches: [{}], callsAtLeast: 1, canStart: true };
  }); try {
    walk(m.field('原文资料')).find(n => n.type === 'select').props.onChange({ target: { value: 'source' } }); await m.click('容量预检（不调用生成）'); assert.ok(walk(m.render()).some(n => n.type === 'button' && words(n) === '开始提炼'));
    walk(m.field('渠道上下文容量（令牌，0＝读取模型声明）')).find(n => n.type === 'input').props.onChange({ target: { value: '500000' } }); assert.ok(!walk(m.render()).some(n => n.type === 'button' && words(n) === '开始提炼'));
  } finally { m.cleanup(); }
});
test('生成中的结果不自动覆盖正在编辑的指导', async () => {
  const m = await open(async name => name === 'writingStyleCatalog' ? { guides: [], sources: [], jobs: [{ id: 'job', name: '小说', status: 'completed' }], preferences: {} } : undefined);
  try { walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.onChange({ target: { value: '我的修改' } }); await m.click('查看结果'); assert.match(words(m.render()), /放弃当前未保存/); assert.equal(walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.value, '我的修改'); }
  finally { m.cleanup(); }
});
test('主入口使用工厂外置稳定组件，并保留原指导选择流程', () => {
  const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /const \{ WritingStylePanel \} = createWritingStyleViews\(React\)/); assert.match(source, /h\(WritingStylePanel, \{ call, gameId, activeId: wskill.id/); assert.match(source, /call\('saveWritingSkill', \{ id: id \|\| '' \}, gameId\)/);
});
