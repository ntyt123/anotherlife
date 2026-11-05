import { createHarness } from './harness.mjs';
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
  const downloads = []; const views = createWritingStyleViews(React, { downloadFile: file => downloads.push(file) }), calls = []; let changed = 0, gameId = 'test';
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
  return { render, flush, click, calls, downloads, field, views, setGame: v => { gameId = v; }, get changed() { return changed; }, cleanup() { slots.forEach(s => s?.cleanup?.()); } };
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


const importFile = async (m, name, body) => {
  const input = walk(m.field('导入文风 JSON／TXT')).find(n => n.type === 'input');
  const bytes = new TextEncoder().encode(body); input.props.onChange({ target: { files: [{ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }], value: name } }); await m.flush();
};
test('真实导出按钮分别生成JSON和TXT文件，文件内容来自当前草稿', async () => {
  const m = await open(); try { await m.click('已存文风'); await m.click('导出 JSON'); await m.click('导出 TXT');
    assert.equal(m.downloads.length, 2); assert.equal(m.downloads[0].name, '已存文风.json'); assert.equal(JSON.parse(m.downloads[0].body).guide, '已有正文');
    assert.equal(m.downloads[1].name, '已存文风.txt'); assert.equal(m.downloads[1].body.replace(/^\uFEFF/, ''), '已有正文');
    assert.ok(!m.calls.some(([name]) => name === 'saveWritingSkill' || name === 'writingStyleSave'));
  } finally { m.cleanup(); }
});
test('TXT导入先预览，保存后才入库且不调用模型或上传小说', async () => {
  const m = await open(); try { const body = '<文风>\n  {{user}}\n\n</文风>\n'; await importFile(m, '本机提炼.txt', body);
    assert.equal(walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.value, body);
    assert.equal(walk(m.field('文风名称')).find(n => n.type === 'input').props.value, '本机提炼'); assert.match(words(m.render()), /已导入为草稿/);
    assert.ok(!m.calls.some(([name]) => /writingStyle(?:Start|Upload|Save)|saveWritingSkill/.test(name)));
    await m.click('保存'); const saved = m.calls.find(([name]) => name === 'writingStyleSave')[1]; assert.equal(saved.guide, body); assert.equal(saved.id, ''); assert.equal(saved.sourceId, '');
    assert.ok(!m.calls.some(([name]) => name === 'saveWritingSkill'));
  } finally { m.cleanup(); }
});
test('JSON导入不沿用本机编号、原文关联和版本号', async () => {
  const m = await open(); try { await importFile(m, '文风.json', JSON.stringify({ type: 'anotherlife-writing-style', version: 1, id: '本机编号', sourceId: '本机原文', name: '可迁移文风', guide: '完整指导', evidence: [{ quote: '示例引文', verified: true }] }));
    assert.match(words(m.render()), /未核验/); await m.click('保存'); const saved = m.calls.find(([name]) => name === 'writingStyleSave')[1];
    assert.equal(saved.id, ''); assert.equal(saved.sourceId, ''); assert.equal(saved.expectedVersion, 0); assert.equal(saved.evidence[0].verified, false);
  } finally { m.cleanup(); }
});
test('损坏JSON保留当前已打开指导，不产生保存调用', async () => {
  const m = await open(); try { await m.click('已存文风'); await importFile(m, '损坏.json', '{错误JSON');
    assert.match(words(m.render()), /JSON格式错误/); assert.equal(walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.value, '已有正文'); assert.ok(!m.calls.some(([name]) => name === 'writingStyleSave'));
  } finally { m.cleanup(); }
});
test('未保存编辑不会被导入覆盖，界面入口确实内嵌文件转换模块', async () => {
  const m = await open(); try { walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.onChange({ target: { value: '我的未保存修改' } });
    await importFile(m, '其他.txt', '新指导'); assert.match(words(m.render()), /请先保存当前修改/); assert.equal(walk(m.render()).find(n => n.type === 'textarea' && n.props.rows === 18).props.value, '我的未保存修改');
    const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'); assert.match(source, /function parseWritingStyleFile\(/); assert.match(source, /function serializeWritingStyleFile\(/); assert.doesNotMatch(source, /^import .*writing-style-transfer/m);
  } finally { m.cleanup(); }
});


test('原生文件选择开始读取时，导入控件旁立即显示文件名和状态', async () => {
  let finishRead; const pendingRead = new Promise(resolve => { finishRead = resolve; });
  const m = await open(async (name) => {
    if (name === 'writingStyleUploadBegin') return { id: 'up', chunkChars: 48000 };
    if (name === 'writingStyleUploadFinish') return { id: 'source', name: '长篇小说.txt', chars: 4, bytes: 12, lines: 1 };
  });
  try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input');
    control.props.onChange({ target: { files: [{ name: '长篇小说.txt', size: 12, arrayBuffer: () => pendingRead }], value: '长篇小说.txt' } }); await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.ok(status, '文件控件旁应有导入状态'); assert.match(words(status), /长篇小说.txt/); assert.match(words(status), /读取/);
  } finally { finishRead(new TextEncoder().encode('测试原文').buffer); for(let i=0;i<5;i++)await m.flush(); m.cleanup(); }
});
test('文件读取失败在导入控件旁显示真实错误，不误报编码失败', async () => {
  const m = await open(); try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input');
    control.props.onChange({ target: { files: [{ name: '无法读取.txt', size: 10, arrayBuffer: async () => { throw new Error('文件已移动，无法读取'); } }], value: '无法读取.txt' } }); for(let i=0;i<3;i++)await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.ok(status, '失败必须在文件控件旁可见'); assert.equal(status.props.role, 'alert'); assert.match(words(status), /文件已移动/); assert.doesNotMatch(words(status), /切换文本编码/);
  } finally { m.cleanup(); }
});


test('原生文件选择自动读取GBK，并明确提示下一步而不自动分析', async () => {
  const pieces = []; const m = await open(async name => {
    if (name === 'writingStyleUploadBegin') return { id: 'up', chunkChars: 48000 };
    if (name === 'writingStyleUploadFinish') return { id: 'source', name: '旧编码小说.txt', chars: 2, bytes: 6, lines: 1 };
  }); try {
    const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input'); const bytes = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]);
    await control.props.onChange({ target: { files: [{ name: '旧编码小说.txt', size: 4, arrayBuffer: async () => bytes.buffer }], value: '旧编码小说.txt' } }); await m.flush();
    const chunk = m.calls.find(([name]) => name === 'writingStyleUploadChunk'); assert.equal(chunk[1].text, '你好');
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.match(words(status), /容量预检 → 开始提炼/); assert.ok(!m.calls.some(([name]) => name === 'writingStyleStart'));
  } finally { m.cleanup(); }
});
test('宿主未加载导入接口时，就地显示具体错误和重启提示，不自动重试', async () => {
  const m = await open(async name => { if (name === 'writingStyleUploadBegin') throw new Error('没有 dsh-tavern-simulator/writing-style-upload-begin 处理器'); });
  try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input'); const bytes = new TextEncoder().encode('测试');
    await control.props.onChange({ target: { files: [{ name: '原文.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }], value: '原文.txt' } }); await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.equal(status.props.role, 'alert'); assert.match(words(status), /处理器/); assert.match(words(status), /重启DSH/); assert.equal(m.calls.filter(([name]) => name === 'writingStyleUploadBegin').length, 1);
  } finally { m.cleanup(); }
});
test('上传错误在原文控件旁可见，清理分片但不提交不调用模型', async () => {
  const m = await open(async name => { if (name === 'writingStyleUploadBegin') return { id: 'up', chunkChars: 4 }; if (name === 'writingStyleUploadChunk') throw new Error('网络上传中断'); });
  try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input'); const bytes = new TextEncoder().encode('测试原文');
    await control.props.onChange({ target: { files: [{ name: '网络测试.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }], value: '网络测试.txt' } }); await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.match(words(status), /网络上传中断/); assert.ok(m.calls.some(([name]) => name === 'writingStyleUploadCancel')); assert.ok(!m.calls.some(([name]) => name === 'writingStyleUploadFinish' || name === 'writingStyleStart'));
  } finally { m.cleanup(); }
});
test('保存成功后目录刷新失败仍保留已选原文，不误报整个导入失败', async () => {
  let saved = false; const m = await open(async name => {
    if (name === 'writingStyleUploadBegin') return { id: 'up', chunkChars: 48000 };
    if (name === 'writingStyleUploadFinish') { saved = true; return { id: 'source', name: '已保存.txt', chars: 2, bytes: 6, lines: 1 }; }
    if (name === 'writingStyleCatalog' && saved) throw new Error('目录暂时不可读');
  }); try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input'); const bytes = new TextEncoder().encode('原文');
    await control.props.onChange({ target: { files: [{ name: '已保存.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }], value: '已保存.txt' } }); await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.match(words(status), /原文已保存并选中/); assert.equal(walk(m.field('原文资料')).find(n => n.type === 'select').props.value, 'source'); assert.ok(!m.calls.some(([name]) => name === 'writingStyleUploadCancel'));
  } finally { m.cleanup(); }
});
test('22MB合成原文经文件选择回调到实际宿主分片完整保存，零模型调用', async () => {
  const host = await createHarness(); const m = await open((name, args) => host.call(name, args));
  try {
    const size = 22 * 1024 * 1024, unit = '合成文本。'.repeat(20) + '\n', head = '合成开头\n', tail = '合成结尾'; const encoder = new TextEncoder();
    const available = size - encoder.encode(head + tail).length, repeat = Math.floor(available / encoder.encode(unit).length);
    const text = head + unit.repeat(repeat) + 'x'.repeat(available - repeat * encoder.encode(unit).length) + tail, bytes = encoder.encode(text); assert.equal(bytes.byteLength, size);
    const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input');
    await control.props.onChange({ target: { files: [{ name: '合成22MB.txt', size, arrayBuffer: async () => bytes.buffer }], value: '合成22MB.txt' } }); await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.match(words(status), /已导入/);
    const sourcePath = [...host.files.keys()].find(path => /simulator-style-source-/.test(path)); assert.ok(sourcePath); const stored = JSON.parse(host.files.get(sourcePath)); assert.equal(stored.text, text); assert.equal(stored.bytes, size);
    assert.equal(host.requests.length, 0); assert.ok(!m.calls.some(([name]) => name === 'writingStyleStart')); assert.equal(walk(m.field('原文资料')).find(n => n.type === 'select').props.value, stored.id);
  } finally { m.cleanup(); host.cleanup(); }
});


test('上传中取消后清理已收分片，不提交原文或继续分析', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const m = await open(async name => { if (name === 'writingStyleUploadBegin') return { id: 'up', chunkChars: 2 }; if (name === 'writingStyleUploadChunk') return pending; });
  try { const control = walk(m.field('导入 TXT／Markdown')).find(n => n.type === 'input'); const bytes = new TextEncoder().encode('需要分片上传的原文');
    const uploading = control.props.onChange({ target: { files: [{ name: '取消测试.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }], value: '取消测试.txt' } }); await m.flush();
    assert.ok(m.calls.some(([name]) => name === 'writingStyleUploadChunk')); await m.click('取消导入'); release({}); await uploading; await m.flush();
    const status = walk(m.render()).find(n => n.props['data-style-source-status']); assert.match(words(status), /已取消导入/); assert.equal(m.calls.filter(([name]) => name === 'writingStyleUploadChunk').length, 1); assert.ok(m.calls.some(([name]) => name === 'writingStyleUploadCancel')); assert.ok(!m.calls.some(([name]) => name === 'writingStyleUploadFinish' || name === 'writingStyleStart'));
  } finally { release({}); m.cleanup(); }
});
