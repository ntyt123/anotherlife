import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHarness} from './harness.mjs';
import {loadClient} from './client-harness.mjs';

const walk = (node, out = []) => { if (Array.isArray(node)) node.forEach((n) => walk(n, out)); else if (node && typeof node === 'object') { out.push(node); walk(node.kids || [], out); } return out; };
const ageField = (tree) => walk(tree).find((n) => n.props?.label === '年龄');

async function open({editing = false} = {}) {
  const e = await createHarness();
  const state = e.api.defaultState();
  e.cleanup();
  state.gameId = 'test'; state.phase = 'play';
  state.world.当前日期时间 = '2010年11月1日 12:00:00 星期一 晴';
  state.world.叙事时间 = '2004年9月1日 10:00:00 星期三 晴';
  state.npcs = [{actorId: 'npc:one', 姓名: '罗伊同学', 性别: '男', 生日: '1991-03-14', 年龄: 30}];
  const c = loadClient();
  c.render().functions.initLoaded(state);
  c.render().functions.openNpcByActorId('npc:one');
  if (editing) {
    const btn = walk(c.render().functions.npcModalView()).find((n) => n.props?.title === '修改这个角色的设定');
    assert.ok(btn, '应有编辑按钮');
    btn.props.onClick();
  }
  return c;
}

test('查看态按生日与叙事时间显示年龄', async () => {
  const c = await open();
  assert.equal(Number(String(ageField(c.render().functions.npcModalView()).props.value).replace(/[^\d]/g, '')), 13);
});

test('编辑态显示存档里的年龄，不被生日覆盖，且可以手改', async () => {
  const c = await open({editing: true});
  const field = ageField(c.render().functions.npcModalView());
  assert.equal(Number(String(field.props.value).replace(/[^\d]/g, '')), 30);
  assert.equal(typeof field.props.onChange, 'function');
  field.props.onChange('31');
  assert.equal(Number(String(ageField(c.render().functions.npcModalView()).props.value).replace(/[^\d]/g, '')), 31);
});

test('改生日不再顺带改写年龄', async () => {
  const src = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /setProtagMany\(age \? \{ 生日: text, 年龄: age \} : \{ 生日: text \}\)/);
  assert.match(src, /const applyBirth = \(text\) => setProtagMany\(\{ 生日: text \}\)/);
});
