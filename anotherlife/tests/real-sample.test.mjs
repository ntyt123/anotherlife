import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createHarness } from './harness.mjs';
import { loadClient } from './client-harness.mjs';

const samplePath = process.env.SIMULATOR_SAMPLE_PATH;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const bodies = (state) => hash(JSON.stringify((state.transcript || []).map((entry) => [entry.seq, entry.role, entry.body || ''])));

test('真实样本仅在内存副本读写：分片导出导入不丢正文，遵守模拟RPC预算', { skip: !samplePath }, async () => {
  const before = fs.readFileSync(samplePath); const source = JSON.parse(before.toString('utf8'));
  const host = await createHarness(); host.seed('sample', source);
  const client = loadClient(async (name, args) => {
    assert.ok(Buffer.byteLength(JSON.stringify(args), 'utf8') < 256 * 1024, '请求超过文档预算');
    const handler = host.handles.get(name); assert.ok(handler);
    const result = await handler(args);
    assert.ok(Buffer.byteLength(JSON.stringify(result), 'utf8') < 4 * 1024 * 1024, '响应超过文档预算');
    return result;
  });
  const loaded = await client.api.call('getState', {}, 'sample'); assert.equal(bodies(loaded), bodies(source));
  const exported = await client.api.call('exportSession', {}, 'sample'); const pack = JSON.parse(exported.json); assert.equal(bodies(pack.state), bodies(source));
  await client.api.call('importBegin', {}, 'target');
  let index = 0; for (let offset = 0; offset < exported.json.length; offset += 60000) await client.api.call('importChunk', { index: index++, data: exported.json.slice(offset, offset + 60000) }, 'target');
  const imported = await client.api.call('importCommit', {}, 'target'); assert.equal(bodies(imported), bodies(source));
  assert.equal(hash(fs.readFileSync(samplePath)), hash(before), '原始样本文件被改变'); assert.equal(host.requests.length, 0, '不允许调用真实模型'); host.cleanup();
});
