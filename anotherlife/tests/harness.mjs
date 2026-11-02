import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const clone = (value) => JSON.parse(JSON.stringify(value));

// 实际模块在隔离 VM 中运行；存档和日志只写入 Map，外部进程一律拒绝。
export async function createHarness({ stream, readFailure, writeFailure, maxTimerMs = Infinity } = {}) {
  const files = new Map(), writes = [], handles = new Map(), disposers = [];
  const normalize = (value) => String(value && value.targetKey || value).replace(/\\/g, '/');
  const missing = () => Object.assign(new Error('ENOENT: 文件不存在'), { code: 'ENOENT' });
  const fsService = {
    resolve: async (value) => ({ targetKey: normalize(value) }),
    readText: async (target) => {
      if (target && typeof target.then === 'function') throw new Error('FsTarget 尚未解析');
      const key = normalize(target);
      if (readFailure) { const failure = readFailure(key); if (failure) throw failure; }
      if (files.has(key)) return files.get(key);
      for (const name of ['scent-lines.json', 'scent-under.json']) if (key.endsWith('/' + name)) return fs.readFileSync(path.join(pluginRoot, name), 'utf8');
      throw missing();
    },
    writeText: async (target, value) => {
      if (target && typeof target.then === 'function') throw new Error('FsTarget 尚未解析');
      const key = normalize(target);
      if (writeFailure) { const failure = writeFailure(key); if (failure) throw failure; }
      files.set(key, String(value)); writes.push(key);
    },
    stat: async (target) => {
      const key = normalize(target);
      if (files.has(key)) return { size: Buffer.byteLength(files.get(key)) };
      for (const name of ['scent-lines.json', 'scent-under.json']) if (key.endsWith('/' + name)) return { size: fs.statSync(path.join(pluginRoot, name)).size };
      return undefined;
    },
  };
  const requests = [];
  const llm = {
    resolveModelInfo: async (provider, model) => ({ provider, id: model }),
    stream: (options) => {
      requests.push(options);
      if (stream) return stream(options, requests.length);
      return (async function* () { yield { type: 'text-delta', index: 0, text: '测试正文。' }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
    },
  };
  const context = vm.createContext({ console, Buffer, URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, setTimeout: (fn, ms, ...args) => setTimeout(fn, Math.min(ms, maxTimerMs), ...args), clearTimeout, setInterval, clearInterval, process: { env: { DSH_SIM_STORE_DIR: 'memory/' } } });
  const modules = new Map(), nativeLoads = new Map();
  const denied = () => { throw new Error('回归测试禁止真实写盘及外部命令'); };
  async function load(filename) {
    const id = filename.startsWith('node:') ? filename : pathToFileURL(filename).href;
    if (modules.has(id)) return modules.get(id);
    if (filename.startsWith('node:')) {
      if (nativeLoads.has(id)) return nativeLoads.get(id);
      const pending = (async () => {
        let native;
        if (filename === 'node:fs') native = {
          existsSync: () => false, cpSync: denied, mkdirSync: denied, rmSync: denied,
          readdirSync: (directory) => [...files.keys()].filter((key) => key.startsWith(normalize(directory).replace(/\/$/, '') + '/')).map((key) => key.slice(key.lastIndexOf('/') + 1)),
          readFileSync: (target, encoding) => {
            const own = path.resolve(typeof target === 'string' ? target : fileURLToPath(target));
            if (!own.startsWith(pluginRoot + path.sep)) return denied();
            return fs.readFileSync(own, encoding);
          },
        };
        else if (filename === 'node:child_process') native = { execFileSync: denied, execFile: (...args) => args.at(-1)(new Error('回归测试禁止外部命令'), '', '') };
        else native = await import(filename);
        const keys = Object.keys(native);
        const mod = new vm.SyntheticModule(keys, function () { for (const key of keys) this.setExport(key, native[key]); }, { context, identifier: id });
        modules.set(id, mod); return mod;
      })();
      nativeLoads.set(id, pending); return pending;
    }
    let source = fs.readFileSync(filename, 'utf8');
    if (filename === path.join(pluginRoot, 'index.mjs')) {
      const end = source.lastIndexOf('\n}');
      if (end < 0) throw new Error('找不到 apply 结束位置');
      source = source.slice(0, end) + '\n  ctx.__audit = { settleToDiffs, settleSnapshot, completeBasicData, COMPLETION_TOOL, defaultState, loadState, saveState, readJson, writeJson, statePath, backupPath, splitStory, applyDiffs, rollbackDiffs, truncateFrom, runTurn, callMainModel, callStoryModel, callSlot, SETTLE_TOOL, STORY_SUBMIT_TOOL, toolModeOf, settleMonthly, migrateScentText, recentRounds, configIsBlank, markAppearances, setByPath, getByPath, avatarToFile, appendLog, tickSockScent, tickUnderScent, weiboCachePath, 处理微博回复, 取待发评论, RUNNING };' + source.slice(end);
    }
    const mod = new vm.SourceTextModule(source, { context, identifier: id, initializeImportMeta(meta) { meta.url = id; } });
    modules.set(id, mod); return mod;
  }
  const host = await load(path.join(pluginRoot, 'index.mjs'));
  // 根模块只启动一次链接，VM 统一处理共享依赖，不能对子模块重复并发 link。
  await host.link((specifier, referring) => load(specifier.startsWith('node:') ? specifier : path.resolve(path.dirname(fileURLToPath(referring.identifier)), specifier)));
  await host.evaluate();
  const ctx = {
    get: (key) => ({ fs: fsService, llm, agentDefaultModel: { currentSelection: () => ({ provider: 'test', model: 'test-model' }) }, credentials: { resolve: async () => ({ value: 'test-key' }), describe: async () => ({ available: true }) } })[key],
    tavern: { apiVersion: 2, handle: (name, handler) => { if (handles.has(name)) throw new Error('重复注册：' + name); handles.set(name, handler); }, getCard: async () => null },
    logger: { info() {}, warn() {}, error() {} },
    on() {}, effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
  };
  await host.namespace.apply(ctx);
  const api = ctx.__audit;
  const call = async (name, args = {}) => {
    const key = 'dsh-tavern-simulator/' + name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    const handler = handles.get(key); if (!handler) throw new Error('接口不存在：' + name);
    return handler(args);
  };
  return { api, files, writes, handles, requests, call,
    seed(gameId, value) { files.set(normalize(api.statePath(gameId)), JSON.stringify(value)); },
    getState(gameId) { return JSON.parse(files.get(normalize(api.statePath(gameId)))); },
    cleanup() { disposers.forEach((fn) => fn()); },
  };
}
