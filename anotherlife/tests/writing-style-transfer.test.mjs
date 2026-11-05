import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeWritingStyleFile, parseWritingStyleFile, serializeWritingStyleFile, WRITING_STYLE_FILE_LIMIT, WRITING_STYLE_GUIDE_LIMIT, decodeWritingStyleSourceFile, WRITING_STYLE_SOURCE_LIMIT } from '../lib/writing-style-transfer.mjs';
import { STYLE_LIMITS } from '../lib/writing-style-core.mjs';
import { createHarness } from './harness.mjs';

const guide = '<白话本文风>\n底色: |\n  人物各有各的话语与分寸。\n示例: |\n  “请坐。”\n\n  {{user}}、{{char}} 与 $1 保持原样。😀\n</白话本文风>\n';
const draft = { name: '白话场景', guide, id: '本机编号', sourceId: '本机小说编号', apiKey: '绝不导出', evidence: [{ dimension: '对白', claim: '称谓参与关系', quote: '一段原文', scope: '人际交往', kind: '倾向', startLine: 12, endLine: 12, verified: true, location: '前段', privatePath: 'C:/local-only' }] };

test('JSON往返保留名称、指导、依据，去掉本机编号、凭据和核验认证', () => {
  const file = serializeWritingStyleFile(draft, 'json'); assert.equal(file.filename, '白话场景.json');
  const raw = JSON.parse(file.content); assert.equal(raw.type, 'anotherlife-writing-style'); assert.equal(raw.version, 1);
  assert.equal(raw.guide, guide); assert.equal(raw.name, draft.name); assert.equal(raw.evidence[0].quote, '一段原文');
  for (const token of ['本机编号', '本机小说编号', '绝不导出', 'privatePath', 'verified']) assert.ok(!file.content.includes(token));
  const restored = parseWritingStyleFile(file.content, file.filename); assert.equal(restored.guide, guide); assert.equal(restored.evidence[0].verified, false); assert.ok(!('sourceId' in restored));
});
test('TXT往返完整保留标签、空行、缩进、模板变量和emoji', () => {
  const file = serializeWritingStyleFile(draft, 'txt'); assert.equal(file.filename, '白话场景.txt'); assert.match(file.mime, /text\/plain/);
  const restored = parseWritingStyleFile(decodeWritingStyleFile(new TextEncoder().encode(file.content)), file.filename);
  assert.equal(restored.guide, guide); assert.equal(restored.name, draft.name); assert.deepEqual(restored.evidence, []);
});
test('旧版1.3.78 JSON可导入，不承认导出端的verified标记', () => {
  const old = { type: 'anotherlife-writing-style', version: 1, name: draft.name, guide, evidence: draft.evidence };
  const restored = parseWritingStyleFile('\uFEFF' + JSON.stringify(old), '旧导出.json'); assert.equal(restored.guide, guide); assert.equal(restored.evidence[0].verified, false);
});
test('普通名称正文JSON和JSON字符串均可导入', () => {
  for (const data of [{ name: '甲', guide }, { title: '乙', content: guide }, { name: '丙', body: guide }, { name: '丁', 写作指导: guide }]) assert.equal(parseWritingStyleFile(JSON.stringify(data), '备用.json').guide, guide);
  assert.equal(parseWritingStyleFile(JSON.stringify(guide), '字符串.json').name, '字符串');
});
test('TXT内容不被误当JSON，名称来自文件名且不执行其中内容', () => {
  const text = '{这是指导中的排版，不是JSON}\n<script>alert(1)</script>\n';
  const restored = parseWritingStyleFile(text, '自定义.TXT'); assert.equal(restored.name, '自定义'); assert.equal(restored.guide, text);
});
test('UTF8、带BOM的UTF16和GBK文本可读取', () => {
  assert.equal(decodeWritingStyleFile(new TextEncoder().encode('\uFEFF你好')), '你好');
  assert.equal(decodeWritingStyleFile(Buffer.from('\uFEFF你好', 'utf16le')), '你好');
  assert.equal(decodeWritingStyleFile(Buffer.from('\uFEFF你好', 'utf16le').swap16()), '你好');
  assert.equal(decodeWritingStyleFile(Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3])), '你好');
});
test('空正文、非法JSON、错误类型和超限明确报错，不截断成可保存草稿', () => {
  assert.throws(() => parseWritingStyleFile(' \n ', '空.txt'), /为空/);
  assert.throws(() => parseWritingStyleFile('{坏JSON', '文风.json'), /JSON格式错误/);
  assert.throws(() => parseWritingStyleFile(JSON.stringify({ type: 'other', guide }), '误选.json'), /不是文风/);
  assert.throws(() => parseWritingStyleFile('[]', '集合.json'), /单份/);
  assert.throws(() => parseWritingStyleFile('正文', '文件.png'), /请选择/);
  assert.throws(() => parseWritingStyleFile('甲'.repeat(WRITING_STYLE_GUIDE_LIMIT + 1), '超长.txt'), /未截断/);
  assert.throws(() => decodeWritingStyleFile(new Uint8Array(WRITING_STYLE_FILE_LIMIT + 1)), /超过2/);
  assert.throws(() => parseWritingStyleFile('甲\u0000乙', '乱码.txt'), /空字符/);
  assert.equal(WRITING_STYLE_GUIDE_LIMIT, STYLE_LIMITS.guideChars);
});
test('导出文件名清理路径与保留名称，正文不受影响', () => {
  const file = serializeWritingStyleFile({ name: '../测试:文风?', guide }, 'txt'); assert.equal(file.filename, '.._测试_文风_.txt'); assert.ok(!file.filename.includes('/')); assert.equal(file.content.slice(1), guide);
  assert.equal(serializeWritingStyleFile({ name: 'CON', guide }, 'json').filename, '_CON.json');
});
test('未命名草稿可导出，过新版本和不支持的导出格式不会被静默改写', () => {
  assert.equal(serializeWritingStyleFile({ guide }, 'txt').filename, '文风指导.txt');
  assert.throws(() => parseWritingStyleFile(JSON.stringify({ type: 'anotherlife-writing-style', version: 9, guide }), '新版本.json'), /版本/);
  assert.throws(() => serializeWritingStyleFile(draft, 'xml'), /JSON或TXT/);
});
test('本机到远端：JSON和TXT经独立真实宿主保存加载，不需要原小说且不调用模型', async () => {
  const local = await createHarness(), remote = await createHarness();
  try {
    const saved = await local.call('writingStyleSave', { name: '本机文风', guide, evidence: draft.evidence });
    for (const format of ['json', 'txt']) {
      const portable = serializeWritingStyleFile(saved, format);
      const imported = parseWritingStyleFile(decodeWritingStyleFile(new TextEncoder().encode(portable.content)), portable.filename);
      assert.ok(!imported.sourceId); assert.equal((await remote.call('getWritingSkill')).id, '');
      const target = await remote.call('writingStyleSave', { ...imported, name: '远端' + format, id: '', expectedVersion: 0 });
      assert.notEqual(target.selectionId, saved.selectionId); assert.equal((await remote.call('getWritingSkill')).id, '');
      await remote.call('saveWritingSkill', { id: target.selectionId }); const selected = await remote.call('getWritingSkill'); assert.equal(selected.body, guide.trim());
      await remote.call('saveWritingSkill', { id: '' });
    }
    assert.equal(local.requests.length, 0); assert.equal(remote.requests.length, 0);
    assert.ok(!remote.writes.some(path => /style-source-|style-task-/.test(path)));
  } finally { local.cleanup(); remote.cleanup(); }
});


test('原文读取自动识别UTF8和GBK，手选错误编码时明确失败', () => {
  const utf = decodeWritingStyleSourceFile(new TextEncoder().encode('原文😀')); assert.equal(utf.text, '原文😀'); assert.equal(utf.encoding, 'UTF-8');
  const gb = decodeWritingStyleSourceFile(Uint8Array.from([0xc4,0xe3,0xba,0xc3])); assert.equal(gb.text, '你好'); assert.equal(gb.encoding, 'GB18030／GBK');
  assert.throws(() => decodeWritingStyleSourceFile(Uint8Array.from([0xc4,0xe3,0xba,0xc3]), 'utf-8'), /所选编码/); assert.equal(WRITING_STYLE_SOURCE_LIMIT, STYLE_LIMITS.sourceBytes);
});


test('22MB GBK原文解码成33MB UTF8时明确报上限，不静默截断或上传', () => {
  const bytes = new Uint8Array(22 * 1024 * 1024); for (let i = 0; i < bytes.length; i += 2) { bytes[i] = 0xc4; bytes[i + 1] = 0xe3; }
  assert.throws(() => decodeWritingStyleSourceFile(bytes), /解码后.*33.0 MB.*超过32 MB/);
});
