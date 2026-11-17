import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
// 从真实客户端源码取出候选合并函数并执行，不复制一份逻辑另测。
const body = src.match(/function modelCandidates\(list, current\) \{[\s\S]*?\n {10}\}/);
assert.ok(body, '候选合并函数应存在于 client.js');
const modelCandidates = new Function(body[0] + '\nreturn modelCandidates;')();

test('候选包含渠道全部模型，保持原顺序并去重', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'b', name: '重复' }, { id: '' }, null, { name: '无id' }];
  assert.deepEqual(modelCandidates(list, '').map((m) => m.id), ['a', 'b']);
});
test('已选模型不在清单时补到最前，下拉不会空白', () => {
  const out = modelCandidates([{ id: 'a' }, { id: 'b' }], 'gpt-6.1-sol');
  assert.deepEqual(out.map((m) => m.id), ['gpt-6.1-sol', 'a', 'b']);
});
test('已选模型在清单中不重复生成', () => {
  assert.deepEqual(modelCandidates([{ id: 'a' }, { id: 'b' }], 'b').map((m) => m.id), ['a', 'b']);
});
test('空清单、非数组与空白当前值都安全', () => {
  assert.deepEqual(modelCandidates(null, ''), []);
  assert.deepEqual(modelCandidates([], '   '), []);
  assert.deepEqual(modelCandidates([], 'm1').map((m) => m.id), ['m1']);
  assert.deepEqual(modelCandidates(['plain', { id: 'obj' }], '').map((m) => m.id), ['plain', 'obj']);
});
test('三处模型候选不再依赖输入框筛选项的 datalist', () => {
  for (const marker of ["sim-slot-r-", "sim-slot-", "sim-mmlist"]) {
    assert.equal(src.includes("list: '" + marker + "'"), false, marker + ' 不应再使用 datalist 关联');
  }
  assert.match(src, /const candidates = modelCandidates\(mm\.list, pick\.model\);/);
  assert.match(src, /const mainModelCandidates = modelCandidates\(mmC && mmC\.models, mmPick\.model\);/);
  assert.match(src, /candidates\.map\(\(m\) => h\('option', \{ key: m\.id, value: m\.id \}, m\.id\)\)/);
  assert.match(src, /mainModelCandidates\.map\(\(m\) => h\('option', \{ key: m\.id, value: m\.id \}, m\.id\)\)/);
});
test('进入设定页预载各槽位已保存渠道的模型清单', () => {
  assert.match(src, /const modelFetchedRef = React\.useRef\(\{\}\);/);
  assert.match(src, /\['retrieve', 'settle', 'weibo', 'summary', 'assistant', 'phone'\]\.forEach\(\(sl\) => \{/);
  assert.match(src, /const mk2 = 'models\|' \+ sl \+ '\|' \+ p;/);
  assert.match(src, /call\('modelsOf', \{ provider: p \}, gameId\)/);
  assert.match(src, /setModels\(\(all\) => Object\.assign\(\{\}, all, \{ \[sl\]: \{ loading: false, list: list2, error: '', url: '' \} \}\)\)/);
});
test('渠道无法列举模型时仍可手动输入，不把老配置锁死', () => {
  assert.match(src, /h\('option', \{ value: '__manual__' \}, '手动输入…'\)/);
  assert.match(src, /pick\.manual \? h\('input', \{/);
  assert.match(src, /mmPick\.manual \? h\('input', \{/);
  assert.match(src, /placeholder: '填模型 id'/);
});
