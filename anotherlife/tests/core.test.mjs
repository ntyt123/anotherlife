import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStory } from '../lib/story-parser.mjs';
import { createSerialQueue, createReplyStore, assertSafePath, assertSafeValue, readJsonFile, waitForStreamStep } from '../lib/runtime-core.mjs';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test('解析全部导演块，保持正文顺序', () => {
  assert.deepEqual(splitStory('<导演笔记>甲</导演笔记>\n第一段\n<think>乙</think>\n第二段'), { think: '甲\n\n乙', body: '第一段\n\n第二段', options: [] });
});
test('纯笔记不回填正文，兼容空输入', () => {
  assert.equal(splitStory('<导演笔记>只有笔记</导演笔记>').body, '');
  assert.equal(splitStory(null).body, '');
});
test('选项中间继续的叙事不会被吞掉', () => {
  const result = splitStory('开头\n[行动选项]\n[稳健路线] 行动甲\n[激进路线] 行动乙\n继续叙事\n[行动选项]\n[创新路线] 行动丙');
  assert.equal(result.body, '开头\n继续叙事');
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every((line) => line.includes('路线')));
});
test('无标题的尾部选项与中间空行可以分离', () => {
  const result = splitStory('正文\n[稳健路线] 甲\n\n[激进路线] 乙');
  assert.equal(result.body, '正文'); assert.equal(result.options.length, 2);
});
test('未闭合的非编号笔记即使先有空行也不进入正文', () => {
  const parsed = splitStory('正文前段\n<导演笔记>\n未闭合笔记\n后续不确定内容'); assert.equal(parsed.body, '正文前段'); assert.ok(parsed.think.includes('未闭合笔记'));
});
test('正在等待的流也能收到停止，而不是等超时', async () => {
  let stop = false; const timer = setTimeout(() => { stop = true; }, 10); const at = Date.now();
  try { assert.deepEqual(await waitForStreamStep({ next: () => new Promise(() => {}) }, 5000, () => stop), { __stopped: true }); assert.ok(Date.now() - at < 1000); } finally { clearTimeout(timer); }
});
test('同资源串行，失败不堵塞，不同资源可以并行', async () => {
  const serial = createSerialQueue(); const order = [];
  await Promise.all([serial('a', async () => { await pause(10); order.push(1); }), serial('a', () => order.push(2)), serial('b', () => order.push(0))]);
  assert.ok(order.indexOf(1) < order.indexOf(2)); assert.equal(order[0], 0);
  await assert.rejects(serial('a', () => { throw Error('测试失败'); }));
  assert.equal(await serial('a', () => 3), 3);
});
test('禁止危险路径和嵌套对象键', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) assert.throws(() => assertSafePath(['protagonist', key, 'x']));
  assert.throws(() => assertSafeValue(JSON.parse('{"world":{"__proto__":{"x":1}}}')));
  assert.doesNotThrow(() => assertSafePath(['npcs', 0, '姓名']));
});
test('损坏 JSON 及权限错误不能当成文件不存在', async () => {
  const fs = { resolve: async (x) => x, readText: async () => '{损坏' };
  await assert.rejects(readJsonFile(fs, ['x']), /损坏/);
  fs.readText = async () => { throw Object.assign(Error('EACCES'), { code: 'EACCES' }); };
  await assert.rejects(readJsonFile(fs, ['x']), /读取文件失败/);
  fs.readText = async () => { throw Object.assign(Error('ENOENT'), { code: 'ENOENT' }); };
  assert.equal(await readJsonFile(fs, ['x']), null);
});
test('大返回分片可无损重组，按局隔离，释放及过期可用', () => {
  let now = 0; const store = createReplyStore({ limitBytes: 100, chunkChars: 17, clock: () => now, ttlMs: 1000 });
  const source = { text: '中文😀'.repeat(100) }; const receipt = store.pack(source, 'a').__simulatorReply;
  assert.throws(() => store.read(receipt.id, 0, 'b'));
  let json = ''; for (let i = 0; i < receipt.parts; i++) json += store.read(receipt.id, i, 'a').data;
  assert.deepEqual(JSON.parse(json), source);
  store.release(receipt.id, 'a'); assert.equal(store.size, 0);
  const next = store.pack(source, 'a').__simulatorReply; now = 1001; assert.throws(() => store.read(next.id, 0, 'a'));
});
test('流等待支持停止、超时和正常返回', async () => {
  assert.deepEqual(await waitForStreamStep({ next: async () => ({ done: true }) }, 1000), { done: true });
  assert.deepEqual(await waitForStreamStep({ next: () => new Promise(() => {}) }, 5), { __timeout: true });
  assert.deepEqual(await waitForStreamStep({ next: () => new Promise(() => {}) }, 1000, () => true), { __stopped: true });
});
