import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export function isSafePath(path) {
  return Array.isArray(path) && path.length > 0 && path.every((key) =>
    (typeof key === 'string' && key.length > 0 && !forbidden.has(key)) ||
    (typeof key === 'number' && Number.isSafeInteger(key) && key >= 0));
}
export function assertSafePath(path) {
  if (!isSafePath(path)) throw new Error('字段路径无效');
}
export function assertSafeValue(value) {
  const pending = [value];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    for (const key of Object.keys(current)) {
      if (forbidden.has(key)) throw new Error('数据含有不安全字段：' + key);
      pending.push(current[key]);
    }
  }
  return value;
}

// 只串行同一资源，拒绝不会阻塞后续请求；不同世界线互不等待。
export function createSerialQueue() {
  const pending = new Map();
  return async function serial(key, operation) {
    const id = String(key);
    const next = (pending.get(id) || Promise.resolve()).catch(() => {}).then(operation);
    const tail = next.catch(() => {});
    pending.set(id, tail);
    try { return await next; }
    finally { if (pending.get(id) === tail) pending.delete(id); }
  };
}

export function isMissingFileError(error) {
  const code = String(error && (error.code || error.kind) || '');
  return /^(ENOENT|NOT_FOUND|not[-_]found)$/i.test(code) ||
    /\bENOENT\b|\bnot[ -]found\b|does not exist|不存在|找不到/i.test(String(error && error.message || error));
}

export async function readJsonFile(fs, paths) {
  for (const path of [...new Set(paths)]) {
    let text;
    try {
      const target = await fs.resolve(path);
      if (typeof fs.stat === 'function' && await fs.stat(target) === undefined) continue;
      text = await fs.readText(target);
    }
    catch (error) {
      if (isMissingFileError(error)) continue;
      throw new Error('读取文件失败：' + path + '；' + String(error && error.message || error), { cause: error });
    }
    // 兼容旧版重置留下的空文件；非空但损坏的 JSON 绝不能当成新档。
    const source = String(text == null ? '' : text).replace(/^\uFEFF/, '').trim();
    if (!source) return null;
    try { return assertSafeValue(JSON.parse(source)); }
    catch (error) {
      throw new Error('文件内容损坏：' + path + '；' + String(error && error.message || error), { cause: error });
    }
  }
  return null;
}

// 返回值也有 RPC 体积限制。分片不裁剪正文，不改变存档格式。
export function createReplyStore({ limitBytes = 2 * 1024 * 1024, chunkChars = 192 * 1024, ttlMs = 300000, maxEntries = 16, clock = Date.now } = {}) {
  const replies = new Map();
  const prune = () => {
    const now = clock();
    for (const [id, value] of replies) if (value.expires <= now) replies.delete(id);
  };
  return {
    pack(value, gameId) {
      if (value === undefined) return value;
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json, 'utf8') <= limitBytes) return value;
      prune();
      while (replies.size >= maxEntries) replies.delete(replies.keys().next().value);
      const id = randomUUID();
      const parts = Math.ceil(json.length / chunkChars);
      replies.set(id, { json, gameId: String(gameId || ''), expires: clock() + ttlMs });
      return { __simulatorReply: { id, parts, length: json.length } };
    },
    read(id, index, gameId) {
      prune();
      const value = replies.get(String(id));
      if (!value || value.gameId !== String(gameId || '')) throw new Error('传输已过期，请重试');
      const part = Number(index);
      const parts = Math.ceil(value.json.length / chunkChars);
      if (!Number.isSafeInteger(part) || part < 0 || part >= parts) throw new Error('分片编号无效');
      value.expires = clock() + ttlMs;
      return { index: part, parts, data: value.json.slice(part * chunkChars, (part + 1) * chunkChars) };
    },
    release(id, gameId) {
      const value = replies.get(String(id));
      if (value && value.gameId === String(gameId || '')) replies.delete(String(id));
      return { ok: true };
    },
    clear() { replies.clear(); },
    get size() { return replies.size; },
  };
}

export async function waitForStreamStep(iterator, timeoutMs, shouldStop) {
  if (typeof shouldStop === 'function' && shouldStop()) return { __stopped: true };
  let timeout;
  let poll;
  try {
    const candidates = [iterator.next(), new Promise((resolve) => { timeout = setTimeout(() => resolve({ __timeout: true }), timeoutMs); })];
    if (typeof shouldStop === 'function') candidates.push(new Promise((resolve) => {
      poll = setInterval(() => { if (shouldStop()) resolve({ __stopped: true }); }, 100);
    }));
    return await Promise.race(candidates);
  } finally {
    clearTimeout(timeout);
    if (poll) clearInterval(poll);
  }
}

export async function closeStreamIterator(iterator, timeoutMs = 1500) {
  if (!iterator || typeof iterator.return !== 'function') return;
  let timer;
  try {
    await Promise.race([Promise.resolve().then(() => iterator.return()), new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); })]);
  } catch { /* 清理失败不能覆盖原始错误 */ }
  finally { clearTimeout(timer); }
}
