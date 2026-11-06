import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './harness.mjs';
import { loadClient } from './client-harness.mjs';
const walk = (n, out = []) => { if (Array.isArray(n)) n.forEach(x => walk(x, out)); else if (n && typeof n === 'object') { out.push(n); walk(n.kids || [], out); } return out; };
const words = n => typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(words).join('') : n && typeof n === 'object' ? words(n.kids || []) : '';
const hasClass = (n, key) => String(n.props?.className || '').split(' ').includes(key);
async function fixture(identity = '市立大学历史系研究生兼校报编辑部成员', extra = {}) {
  const host = await createHarness(); const state = host.api.defaultState(); host.cleanup();
  state.gameId = 'test'; state.phase = 'play'; state.simulation = { enabled: false };
  state.npcs = [{ actorId: 'npc:layout', 姓名: '样本角色', 性别: '女', 年龄: 30, 身份: identity, 重要: false, ...extra }];
  state.relationships = [{ 姓名: '样本角色', 关系: '同事' }];
  const calls = [], client = loadClient(async (name, args) => { calls.push([name, args]); if (name.endsWith('/ping')) return { protocol: 15 }; return state; });
  client.render().functions.initLoaded(state); client.render().functions.openNpcByActorId('npc:layout');
  const render = () => { const functions = client.render().functions, tree = functions.npcModalView(); return { functions, tree, head: walk(tree).find(n => hasClass(n, 'sim-actor-modal-h')) }; };
  return { state, client, calls, render };
}

test('长身份在标题仅显示十字加省略号，完整值保留在详情和状态', async () => {
  const identity = '市立大学历史系研究生兼校报编辑部成员', f = await fixture(identity), before = JSON.stringify(f.render().functions.getState());
  const { head, tree } = f.render(), chip = walk(head).find(n => n.props?.['data-actor-head-field'] === 'identity');
  assert.equal(words(chip), Array.from(identity).slice(0, 10).join('') + '…'); assert.equal(chip.props.title, undefined);
  const body = walk(tree).find(n => n.props?.className === 'sim-modal-b');
  assert.ok(walk(body).some(n => n.props?.label === '身份' && n.props.value === identity) || words(body).includes(identity));
  assert.equal(JSON.stringify(f.render().functions.getState()), before); assert.equal(f.calls.length, 0);
});
test('短身份与恰好十字身份不增加省略号，emoji不拆成代理项', async () => {
  for (const identity of ['研究员', '一二三四五六七八九十', '一二三四五六七八九😀十一']) {
    const f = await fixture(identity), chip = walk(f.render().head).find(n => n.props?.['data-actor-head-field'] === 'identity'), chars = Array.from(identity);
    assert.equal(words(chip), chars.length > 10 ? chars.slice(0, 10).join('') + '…' : identity);
  }
});
test('标题保留性别年龄关系，身份缺失不造占位标签', async () => {
  const f = await fixture(''); const head = f.render().head;
  const chips = walk(head).filter(n => n.props?.['data-actor-head-field']); assert.equal(chips.length, 3);
  assert.equal(chips.find(n => n.props['data-actor-head-field'] === 'sex').kids[0], '女');
  assert.equal(words(chips.find(n => n.props['data-actor-head-field'] === 'age')), '30');
  assert.equal(words(chips.find(n => n.props['data-actor-head-field'] === 'relation')), '同事');
});
test('操作区与摘要分开，四个按钮保留可访问名称与原回调', async () => {
  const f = await fixture(), { head } = f.render(), actions = walk(head).find(n => hasClass(n, 'sim-actor-actions'));
  const buttons = walk(actions).filter(n => n.type === 'button'); assert.equal(buttons.length, 4);
  for (const label of ['标为重要角色', '删除角色', '编辑角色', '关闭角色详情']) assert.ok(buttons.some(n => n.props['aria-label'] === label));
  buttons.find(n => n.props['aria-label'] === '编辑角色').props.onClick();
  let current = f.render(); assert.ok(walk(current.head).some(n => n.props?.['aria-label'] === '完成修改')); assert.ok(!hasClass(walk(current.tree).find(n => hasClass(n, 'sim-actor-modal')), 'viewing'));
  walk(current.head).find(n => n.props?.['aria-label'] === '关闭角色详情').props.onClick(); assert.equal(f.render().tree, null); assert.equal(f.calls.length, 0);
});
test('已重要角色仍显示星形状态，无需额外展开标题', async () => {
  const f = await fixture('研究员', { 重要: true }), { head } = f.render(), star = walk(head).find(n => n.props?.['aria-label'] === '取消重要');
  assert.ok(star); assert.match(words(star), /★/); assert.ok(walk(star).some(n => hasClass(n, 'sim-actor-star-label')));
});
test('标题样式锁定两行摘要，按弹窗宽度缩短按钮且不污染其他弹窗', async () => {
  const f = await fixture(), css = String(f.client.api.getCSS());
  assert.match(css, /\.sim-modal\.sim-actor-modal\{[^}]*container-type:inline-size/);
  assert.match(css, /\.sim-actor-modal \.sim-actor-modal-h\{[^}]*grid-template-columns:minmax\(0,1fr\) auto;grid-template-rows:auto auto/);
  assert.match(css, /\.sim-actor-modal-h \.chips\{[^}]*grid-column:1 \/ -1;[^}]*flex-wrap:nowrap;overflow:hidden/);
  assert.match(css, /\.sim-actor-modal-h \.sim-mchip\{[^}]*text-overflow:ellipsis;white-space:nowrap/);
  assert.match(css, /@container sim-actor-dialog \(max-width:520px\)\{\.sim-actor-modal-h \.sim-actor-star-label\{display:none\}/);
  assert.match(css, /\.sim-actor-modal-h \.sim-actor-actions>button\{flex:0 0 auto/);
});
