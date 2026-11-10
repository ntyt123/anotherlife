import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenericViews } from '../lib/generic-client.js';
import { createSimulation, updateSimulationSettings, worldNewsKey, backgroundTasks } from '../lib/generic-simulation.mjs';
import { loadClient } from './client-harness.mjs';
import { createHarness } from './harness.mjs';
import { fillOrdinaryCreation } from './creation-fixtures.mjs';

const walk = (node, out = []) => {
  if (Array.isArray(node)) node.forEach(child => walk(child, out));
  else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); }
  return out;
};
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : node && node.type !== 'style' ? words(node.kids || []) : '';
const React = { createElement: (type, props, ...kids) => ({ type, props: props || {}, kids }) };
const views = createGenericViews(React);
const clone = value => JSON.parse(JSON.stringify(value));
const make = (latest = 50, updated = latest) => {
  const state = { gameId: 'paper-test', phase: 'play', world: { 世界观类型: '现代', 时代与年份: '2026年', 当前日期时间: '2026年1月1日 上午' }, transcript: Array.from({ length: latest + 1 }, (_, seq) => ({ seq, role: 'assistant', textVersion: 'v' + seq, body: '普通正文。', diffs: [], simulationTurnComplete: true })) };
  state.simulation = updateSimulationSettings(createSimulation(), { settings: { managementEnabled: false, boundSystemEnabled: false, worldNewsEnabled: true, worldNewsInterval: 5 } });
  state.simulation.news = { lastAttemptTurn: updated, lastSuccessTurn: updated, lastSuccessSeq: updated, error: '', basis: 'edition-' + updated, items: Array.from({ length: 10 }, (_, i) => ({ id: 'news-' + updated + '-' + i, kind: i < 5 ? 'event' : 'rumor', time: '2026年1月1日', content: i < 5 ? '公共图书馆公布了本周的开放安排。' : '居民正在讨论增设一间社区阅读室。', turn: updated, sourceSeq: updated, sourceTextVersion: 'v' + updated, worldKey: worldNewsKey(state, state.simulation) })) };
  return state;
};
const render = (state, entry = state.transcript.at(-1)) => {
  assert.equal(typeof views.WorldNewsNotice, 'function', '需要可复用的报纸入口，而不是只改侧栏');
  return views.WorldNewsNotice({ state, entry });
};

test('每5轮更新：48轮最近仍是45轮，50轮才到期', () => {
  const state = make(48, 45);
  for (const count of [46, 47, 48, 49]) assert.equal(backgroundTasks(state, state.simulation, count).news, false);
  assert.equal(backgroundTasks(state, state.simulation, 50).news, true);
  assert.equal(state.simulation.news.lastSuccessSeq, 45);
});

test('最近更新轮号不是累计更新次数，失败尝试继续保留旧成功点', () => {
  const state = make(50, 45);
  state.simulation.news.lastAttemptTurn = 50;
  state.simulation.news.error = '本次连接失败';
  assert.equal(backgroundTasks(state, state.simulation, 51).news, false);
  assert.equal(state.simulation.news.lastSuccessTurn, 45);
  assert.equal(state.simulation.news.lastSuccessSeq, 45);
});

test('本轮更新时显示默认收起的原生报纸，大事和传闻各五条', () => {
  const tree = render(make());
  assert.equal(tree.type, 'details');
  assert.equal(Object.hasOwn(tree.props, 'open'), false);
  const nodes = walk(tree);
  assert.equal(nodes.filter(node => node.type === 'summary').length, 1);
  assert.match(words(tree.kids[0]), /世界动态已更新.*第50轮/);
  assert.equal(nodes.filter(node => node.type === 'article').length, 1);
  assert.equal(nodes.filter(node => node.type === 'section').length, 2);
  assert.equal(nodes.filter(node => node.type === 'li').length, 10);
  assert.match(words(tree), /大事/); assert.match(words(tree), /传闻/);
  assert.match(words(tree), /2026年1月1日/);
});

test('48轮未更新时不把45轮动态提示成刚更新', () => assert.equal(render(make(48, 45)), null));
test('只在最新正文出现，旧正文和玩家输入都没有入口', () => {
  const state = make();
  assert.equal(render(state, state.transcript[45]), null);
  assert.equal(render(state, { role: 'user', seq: 50, textVersion: 'v50' }), null);
});
test('没有动态或通用玩法关闭时不出现空报纸', () => {
  const state = make(); state.simulation.news.items = [];
  assert.equal(render(state), null);
  const disabled = make(); disabled.simulation.enabled = false;
  assert.equal(render(disabled), null);
});
test('新世界不能读取旧世界报纸', () => {
  const state = make(); state.world.时代与年份 = '1800年';
  assert.equal(render(state), null);
});
test('正文同轮重写后旧版本动态不提示，旧正文对象也不能冒充新版', () => {
  const state = make(); const previous = clone(state.transcript.at(-1));
  state.transcript.at(-1).textVersion = 'rewritten';
  assert.equal(render(state), null);
  assert.equal(render(state, previous), null);
});
test('旧来源轮次不能借最新更新标记显示', () => {
  const state = make();
  state.simulation.news.items.forEach(item => { item.sourceSeq = 45; item.sourceTextVersion = 'v45'; });
  assert.equal(render(state), null);
});
test('开场第0轮的真实更新也可展开', () => {
  const state = make(0, 0); const tree = render(state);
  assert.ok(tree); assert.match(words(tree.kids[0]), /第0轮/);
});
test('缺少可证明来源的旧记录不猜成本轮新报纸，侧栏记录不清除', () => {
  const state = make(); delete state.simulation.news.lastSuccessSeq;
  state.simulation.news.items.forEach(item => { delete item.sourceSeq; delete item.sourceTextVersion; });
  assert.equal(render(state), null);
  assert.equal(state.simulation.news.items.length, 10);
});
test('同一期报纸键稳定，换局、重写或手动刷出新内容时换键', () => {
  const state = make(); const first = render(state).props.key;
  assert.equal(render(clone(state)).props.key, first);
  const other = clone(state); other.gameId = 'another-game';
  assert.notEqual(render(other).props.key, first);
  const refresh = clone(state); refresh.simulation.news.items[0].content = '图书馆调整了开放时段。';
  assert.notEqual(render(refresh).props.key, first);
});
test('报纸使用主题色、双栏和窄屏单栏，不固定高度或正文限宽', () => {
  const css = walk(render(make())).find(node => node.type === 'style').kids.join('');
  assert.match(css, /var\(--sim-/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:650px\)/);
  assert.match(css, /grid-template-columns:1fr/);
  assert.doesNotMatch(css, /\.sim-world-news-paper\{[^}]*max-width:/);
  assert.doesNotMatch(css, /position:fixed/);
});
test('只展示既有时间和内容，不展示来源地区，不执行内容中的HTML', () => {
  const state = make(); Object.assign(state.simulation.news.items[0], { source: '不应显示的来源', region: '不应显示的地区', title: '不应显示的标题', content: '<img src=x onerror=alert(1)>这是文本。' });
  const tree = render(state); const nodes = walk(tree);
  assert.match(words(tree), /<img src=x onerror=alert\(1\)>这是文本。/);
  assert.doesNotMatch(words(tree), /不应显示的来源|不应显示的地区|不应显示的标题/);
  assert.equal(nodes.some(node => node.props?.dangerouslySetInnerHTML), false);
  assert.equal(nodes.some(node => node.type === 'img'), false);
});
test('展开是本地原生控件，不调用模型或刷新RPC，不改正文或新闻状态', () => {
  const state = make(); const before = JSON.stringify(state); const tree = render(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(walk(tree).some(node => node.props?.onClick), false);
  assert.equal(walk(tree).some(node => node.type === 'button'), false);
});

test('实际App只在最新正文顶部放报纸，正文文本与字数不受影响', async () => {
  const e = await createHarness();
  try {
    const state = Object.assign(e.api.defaultState(), make()); state.protagonist.姓名 = '样本主角';
    const calls = []; const client = loadClient(async (...args) => { calls.push(args); return null; });
    let view = client.render('paper-test'); view.functions.initLoaded(state);
    view = client.render('paper-test'); const nodes = walk(view.tree);
    const papers = nodes.filter(node => node.props?.className === 'sim-world-news');
    assert.equal(papers.length, 1);
    const latest = nodes.find(node => node.props?.className === 'sim-msg assistant' && node.props['data-seq'] === 50);
    assert.ok(latest);
    const body = walk(latest).find(node => node.props?.className === 'sim-msg-body');
    const children = body.kids.flat(Infinity).filter(Boolean);
    assert.ok(children.indexOf(papers[0]) < children.findIndex(node => node.props?.className === 'sim-body-text'));
    assert.equal(walk(body).filter(node => node.props?.className === 'sim-body-text').length, 1);
    assert.equal(state.transcript.at(-1).body, '普通正文。');
    assert.equal(calls.length, 0);
  } finally { e.cleanup(); }
});

test('实际侧栏明确显示最近更新于45轮和每5轮更新，不显示累计45次', async () => {
  const client = loadClient(); const state = make(48, 45);
  const tree = client.renderGeneric({ state, mode: 'world', onCall: async () => { throw Error('本测试不可调用'); }, onStage() {} });
  assert.match(words(tree), /最近更新于第45轮/);
  assert.match(words(tree), /每5轮更新/);
  assert.doesNotMatch(words(tree), /更新45次/);
});

test('实际宿主每5次成功正文更新，返回状态当轮可展开且下一轮不误报', async () => {
  const payload = { news: Array.from({ length: 10 }, (_, i) => ({ kind: i < 5 ? 'event' : 'rumor', time: '2026年1月1日', content: i < 5 ? '公共图书馆公布了本周开放安排。' : '居民正在讨论增设社区阅读室。' })) };
  const tool = (name, args) => (async function* () { yield { type: 'tool-call-delta', id: name, index: 0, name, argumentsDelta: JSON.stringify(args) }; yield { type: 'finish', reason: { kind: 'tool-calls' } }; })();
  const e = await createHarness({ stream: request => {
    const names = (request.tools || []).map(item => item.name);
    if (names.includes('emit_simulation_background')) return tool('emit_simulation_background', payload);
    if (names.includes('game')) return tool('game', { game_content: '你在窗前整理今天的日程。', think: '', summary: '你整理了日程。', options: [] });
    return (async function* () { yield { type: 'text-delta', index: 0, text: JSON.stringify(names.includes('emit_state_update') ? { summary: '你整理了日程。' } : { chars: [], profiles: [] }) }; yield { type: 'finish', reason: { kind: 'stop' } }; })();
  } });
  try {
    const state = e.api.defaultState(); state.gameId = 'test'; state.phase = 'character'; state.protagonist.姓名 = '样本主角'; state.protagonist.性别 = '男'; state.protagonist.金钱 = 1234;
    state.world.世界观类型 = '现代'; state.world.当前日期时间 = '2026年1月1日 上午'; state.config.settle = { provider: 'test', model: 'test-model' }; state.config.toolMode = true;
    state.simulation = updateSimulationSettings(createSimulation(), { settings: { managementEnabled: false, boundSystemEnabled: false, worldNewsEnabled: true, worldNewsInterval: 5 } });
    state.simulation.setupReady = true; fillOrdinaryCreation(state); state.npcs = []; e.seed('test', state);
    const newsRequests = () => e.requests.filter(request => (request.tools || []).some(item => item.name === 'emit_simulation_background')).length;
    let result = await e.call('openGame', { gameId: 'test', protagonist: state.protagonist, npcs: state.npcs, skillsItems: state.skills_items, simulationOptions: state.simulation });
    assert.equal(newsRequests(), 1); assert.ok(render(result));
    for (let i = 1; i <= 5; i++) {
      result = await e.call('generateStory', { gameId: 'test', input: '整理日程 ' + i });
      assert.equal(newsRequests(), i === 5 ? 2 : 1);
      if (i < 5) assert.equal(render(result), null);
    }
    assert.equal(result.simulation.news.lastSuccessSeq, 5); assert.ok(render(result));
    assert.equal(result.protagonist.金钱, 1234);
    result = await e.call('generateStory', { gameId: 'test', input: '继续整理日程。' });
    assert.equal(newsRequests(), 2); assert.equal(render(result), null);
  } finally { e.cleanup(); }
});
