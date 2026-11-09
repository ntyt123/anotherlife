import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHarness } from './harness.mjs';
import { NPC_PROFILE_RULES, NPC_PROFILE_GENERATION_RULES } from '../lib/npc-profile.mjs';

async function setup(stream) {
  const e = await createHarness({ stream });
  const s = e.api.defaultState();
  s.gameId = 'test'; s.phase = 'play';
  Object.assign(s.world, { 世界观类型: '架空日常', 时代与年份: '2025年', 当前日期时间: '2025年1月1日 星期三 12:00:00 晴' });
  Object.assign(s.protagonist, { 姓名: '主角', 性别: '男', 生日: '1990-01-01', 年龄: 35, 是否艺人: false });
  s.npcs = []; s.simulation = { enabled: false };
  s.config.scentByAI = false; s.config.toolMode = true;
  s.config.settle = { provider: 'test', model: 'test' };
  e.seed('test', s);
  return { e, s };
}
const prompt = (e, s, input = '在门口与同伴闲聊。') => e.api.storySystemPrompt(s, input, { all: true });
const obsolete = [
  '不得替主角决定言行与心理', '比喻一场最多一处', '一场最多两三次',
  '不把情绪交给风景', '严禁直接写别人的内心独白', '不要替他表态、答应、拒绝',
  '以场景里另一个人（或环境）的动作、语言收尾', '对话为主（六成以上）',
  '每次回复最后再加一句', '发展极其缓慢', '正文禁词',
];

for (const on of [true, false]) test('最终正文默认提示不再叠加固定文学限额，增强开关=' + on, async () => {
  const { e, s } = await setup();
  try { s.config.styleBoost = on; const p = await prompt(e, s); for (const text of obsolete) assert.ok(!p.includes(text), '仍在注入：' + text); }
  finally { e.cleanup(); }
});

test('真实目标、信息传播与普通言行分别有独立边界', async () => {
  const { e, s } = await setup();
  try { const p = await prompt(e, s); for (const marker of ['【主角意图与角色判断】', '【信息公开与角色知识】', '【言行授权】']) assert.ok(p.includes(marker)); assert.match(p, /自欺/); assert.match(p, /坦白.*表格.*转述/); assert.match(p, /日常.*拒绝/); assert.match(p, /公开秘密/); }
  finally { e.cleanup(); }
});

test('叙述者可以全知而角色仍须有知情来源', async () => {
  const { e, s } = await setup();
  try { const p = await prompt(e, s); assert.match(p, /叙述者.*不等于.*角色/); assert.match(p, /配角内心/); assert.doesNotMatch(p, /叙述严格限制/); }
  finally { e.cleanup(); }
});

test('自然结束与日常成立不需要新考验或固定收尾主体', async () => {
  const { e, s } = await setup();
  try { const p = await prompt(e, s); assert.match(p, /普通生活/); assert.match(p, /自然收束/); assert.match(p, /不预设.*收尾/); assert.doesNotMatch(p, /不要把会面收掉|不能把会面收掉|不写「他走了」/); }
  finally { e.cleanup(); }
});

test('文风与授权边界在人设和摘要中共用，不新增剧情过滤器', async () => {
  const { e, s } = await setup();
  try { const values = [NPC_PROFILE_RULES, NPC_PROFILE_GENERATION_RULES, e.api.summaryRules({ 段句数: 10 }), await e.api.settleSystemPrompt(s, 'test', '同伴在门口说了几句话。')];
    for (const p of values) { assert.match(p, /【信息公开与角色知识】/); assert.match(p, /【言行授权】/); assert.match(p, /猜测|推断/); }
  } finally { e.cleanup(); }
});

test('实际选中文风完整注入，允许心理回望但不改变既定事实与授权', async () => {
  const { e, s } = await setup();
  try { const guide = '测试指导：允许细致心理、进入配角内心和回望，句式与收尾随场景变化，不按固定配额插入动作。'.repeat(4);
    const saved = await e.call('writingStyleSave', { name: '心理与回望测试', guide, evidence: [] });
    const id = 'style:' + saved.id;
    await e.call('saveWritingSkill', { id });
    const p = await prompt(e, s);
    assert.ok(p.includes(guide)); assert.equal(p.split(guide).length - 1, 1);
    assert.match(p, /表达方式.*所选文风/); assert.doesNotMatch(p, /与其他规则冲突时，一律以前文为准/);
  } finally { e.cleanup(); }
});

test('切换指导立即清缓存并以本轮实际读取的正文生成指纹', async () => {
  const { e, s } = await setup();
  try { const guides = ['测试甲：允许平静的收尾与人物直接表达。'.repeat(6), '测试乙：允许长短句、心理和旁观叙述自由交替。'.repeat(6)];
    const first = await e.call('writingStyleSave', { name: '甲指导', guide: guides[0], evidence: [] });
    const second = await e.call('writingStyleSave', { name: '乙指导', guide: guides[1], evidence: [] });
    for (const [i, value] of [first, second].entries()) {
      const id = 'style:' + value.id; await e.call('saveWritingSkill', { id });
      const p = await prompt(e, s); assert.ok(p.includes(guides[i])); assert.ok(!p.includes(guides[1 - i]));
      const meta = e.api.CONTEXT_BY_GAME.get('test').writing;
      assert.equal(meta.guide.id, id); assert.equal(meta.guide.source, 'style-library'); assert.equal(meta.guide.chars, guides[i].length);
      assert.equal(meta.guide.sha256, createHash('sha256').update(guides[i]).digest('hex'));
    }
  } finally { e.cleanup(); }
});

test('无指导时不偷偷选旧Skill，也不将机械限额当默认风格', async () => {
  const { e, s } = await setup();
  try { await e.call('saveWritingSkill', { id: '' }); const p = await prompt(e, s); const meta = e.api.CONTEXT_BY_GAME.get('test').writing; assert.equal(meta.guide.source, 'none'); assert.equal(meta.guide.id, ''); assert.doesNotMatch(p, /nostalgic-scene-writing|每场至少三件/); }
  finally { e.cleanup(); }
});

test('手填writer及anti覆盖完整保留并在元数据中标明来源', async () => {
  const { e, s } = await setup();
  try { s.config.styleBoost = true;
    const writer = '【写作要求】全文{{人称}}，默认跟随{{视角人物}}，作者手写的特别节奏必须保留。';
    const anti = '【反模式清单】作者手写：不要使用指定的口头禅。';
    e.files.set('memory/simulator-prompts.json', JSON.stringify({ prompts: { writer, anti } }));
    await e.api.loadPrompts(); const p = await prompt(e, s);
    assert.match(p, /作者手写的特别节奏必须保留/); assert.match(p, /作者手写：不要使用指定的口头禅/); assert.doesNotMatch(p, /\{\{人称\}\}|\{\{视角人物\}\}/);
    const meta = e.api.CONTEXT_BY_GAME.get('test').writing; assert.ok(meta.overrides.includes('writer')); assert.ok(meta.overrides.includes('anti'));
    assert.equal(JSON.parse(e.files.get('memory/simulator-prompts.json')).prompts.writer, writer);
  } finally { e.cleanup(); }
});

test('本局作者禁句保留，内置模板不再正面示范该禁句', async () => {
  const { e, s } = await setup();
  try { s.config.styleNotes = '不要使用“我必须承认”。'; const p = await prompt(e, s); assert.ok(p.includes(s.config.styleNotes)); assert.doesNotMatch(p, /自嘲.*我必须承认/); }
  finally { e.cleanup(); }
});

test('当前规则不会仅因具体时刻禁止自然日常回应或按授权完成场景', async () => {
  const { e, s } = await setup();
  try { const p = await prompt(e, s, '这天与同伴见面，聊完各自回家。'); assert.match(p, /本轮.*时间跨度/); assert.doesNotMatch(p, /他说「准备回家」，就停在准备|写少一点，玩家会自己往下要|不许自己安排下一次见面/); }
  finally { e.cleanup(); }
});


for (const [person, label] of [['1', '第一人称'], ['2', '第二人称']]) test('人称设置与默认写作块一致：' + label, async () => {
  const { e, s } = await setup();
  try { await e.call('savePerson', { person }); const p = await prompt(e, s); assert.ok(p.includes('默认' + label)); assert.ok(!p.includes('默认第三人称')); }
  finally { e.cleanup(); }
});

test('所选指导中的同名标题不会被用户writer或anti覆盖误替换', async () => {
  const { e, s } = await setup();
  try {
    const guide = ['【写作要求】', '这是所选指导自己的写法。', '【反模式清单】', '这里也是指导正文，不是模板槽位。'].join('\n').repeat(4);
    const saved = await e.call('writingStyleSave', { name: '标题保护测试', guide, evidence: [] });
    await e.call('saveWritingSkill', { id: 'style:' + saved.id });
    e.files.set('memory/simulator-prompts.json', JSON.stringify({ prompts: { writer: '【写作要求】{{人称}}跟随{{视角人物}}，保留手填块。', anti: '【反模式清单】手填补充也保留。' } }));
    await e.api.loadPrompts(); const p = await prompt(e, s);
    assert.ok(guide.includes('\n【反模式清单】')); assert.ok(p.includes(guide)); assert.match(p, /保留手填块/); assert.match(p, /手填补充也保留/);
    assert.ok(!p.includes('\uE000writing-guide:'));
  } finally { e.cleanup(); }
});

test('实际生成处理器的模型请求及日志对应同一份指导，无新增审稿调用', async () => {
  const stream = options => (async function* () {
    if ((options.tools || []).some(t => (t.name || t.function?.name) === 'game')) {
      yield { type: 'tool-call-delta', id: 'g', index: 0, name: 'game', argumentsDelta: JSON.stringify({ game_content: '他合上书，与同伴聊了几句各自的日常，随后沿原路回去。', summary: '时间：2025年1月1日中午。地点：街边。发生的事：主角与同伴闲聊后回去。', options: ['散步','买东西','读书','回家','聊天','做饭','休息','继续日常'] }) };
    } else yield { type: 'text-delta', index: 0, text: JSON.stringify((options.tools || []).some(t => (t.name || t.function?.name) === 'emit_state_update') ? { world: { 当前日期时间: '2025年1月1日 星期三 12:01:00 晴' } } : { ids: ['p.姓名'] }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  })();
  const { e, s } = await setup(stream);
  try {
    const guide = '实际请求测试指导：心理、句式、回望和停点按场景自由组织。'.repeat(6);
    const saved = await e.call('writingStyleSave', { name: '实际请求指导', guide, evidence: [] });
    const id = 'style:' + saved.id; await e.call('saveWritingSkill', { id });
    const beforeMoney = s.protagonist.金钱;
    const result = await e.call('generateStory', { gameId: 'test', input: '与同伴闲聊，不公开长期计划。', all: true });
    const req = e.requests.find(r => (r.tools || []).some(t => (t.name || t.function?.name) === 'game'));
    assert.ok(req); const sent = JSON.stringify({ system: req.system, messages: req.messages });
    assert.ok(sent.includes(guide), JSON.stringify({ requestKeys: Object.keys(req), messages: req.messages.map(m => ({ keys: Object.keys(m), sample: JSON.stringify(m).slice(0,180) })), writing: e.api.CONTEXT_BY_GAME.get('test')?.writing, settings: [...e.files].filter(([k]) => k.endsWith('simulator-settings.json')).map(([k,v]) => ({ path:k, id:JSON.parse(v).writingSkillId })) })); assert.equal(sent.split(guide).length - 1, 1);
    for (const old of [...obsolete, '不足即不合格']) assert.ok(!JSON.stringify({ system: req.system, messages: req.messages, tools: req.tools }).includes(old), old);
    assert.ok(sent.includes('【信息公开与角色知识】')); assert.equal(e.requests.length, 3); assert.match(e.requests[0].system, /上下文筛选器/); assert.equal(e.requests.filter(r => (r.tools || []).some(t => (t.name || t.function?.name) === 'emit_state_update')).length, 1);
    const hash = createHash('sha256').update(guide).digest('hex');
    const trace = [...e.files.values()].filter(v => v.includes('[writing-contract]')).join('\n');
    assert.ok(trace.includes(id)); assert.ok(trace.includes(hash)); assert.ok(trace.includes('style-library'));
    assert.equal(e.getState('test').protagonist.金钱, beforeMoney);
  } finally { e.cleanup(); }
});
