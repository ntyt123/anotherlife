import { assertSafeValue } from './runtime-core.mjs';
import { BASIC_WEAR_KEYS, basicWear, hasReviewedWear, wardrobeKey, wardrobeTasks, cleanGeneratedValue } from './data-integrity.mjs';
const own = (v, k) => !!v && Object.prototype.hasOwnProperty.call(v, k);
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v));
const grades = ['N', 'R', 'SR', 'SSR', 'UR'];
export const WARDROBE_RULES = [
  '你负责为虚构人生模拟器补齐普通日常服装，不写故事，不处理身体或私密资料。',
  '【这是一项生成任务】名单中的角色已经建档，即使这一轮没有出场，也要结合其身份、年代、季节设计合理的普通日常衣着；不能因正文未提到衣服就把整个人留空。',
  '任务名单里每人都要提交一条，姓名逐字沿用；主角也放进chars。不要新建人物，不要代替名单外人物提交。',
  '用complete_records提交：{"chars":[{"姓名":"任务姓名","穿着":{"头部":{"物品":"","稀有度":"","状态":"","简介":""},"上衣":{"物品":"日常衬衫","稀有度":"N","状态":"","简介":"按日常活动选用，袖口还留着洗后的折痕"},"内衣":{"物品":"棉质内衣","稀有度":"N","状态":"","简介":"日常换洗的普通款式"},"内裤":{"物品":"棉质内裤","稀有度":"N","状态":"","简介":"日常换洗的普通款式"},"下衣":{"物品":"长裤","稀有度":"N","状态":"","简介":"平日常穿的一条长裤，裤脚保持着原有折线"},"袜子":{"物品":"","稀有度":"","状态":"","简介":""},"鞋子":{"物品":"","稀有度":"","状态":"","简介":""},"饰品":{"物品":"","稀有度":"","状态":"","简介":""}}}]}。示例只说明结构，不是让所有人穿同样的衣物。',
  '八个部位（头部、上衣、内衣、内裤、下衣、袜子、鞋子、饰品）都必须有对象，字段固定为物品、稀有度、状态、简介。女性角色的内衣、内裤不能因为剧情没提到就空着；男性没有适用内衣时可以留空。物品非空时稀有度只能是N/R/SR/SSR/UR，简介必须10至25字，交代由来或当下状态；状态可以为空。',
  '允许确实未佩戴帽子、饰品或鞋袜，此时物品、稀有度、状态、简介都给空字符串。上衣和下衣不能同时为空；连衣裙可放上衣，下衣留空。不得为了凑数强加配件。',
  '已有衣物名与事实必须保留，只补缺项或修正格式；不要清掉或替换已有衣物，不要生成气味或任何其他部位。',
  '只输出工具参数，不用“已完成”等说明代替数据。不支持工具时只输出同结构JSON。没有内容留空，不写无/暂无/未知等占位词。',
].join('\n');
export function wardrobeCompletionTool(tasks, allowBusiness = false, options = {}) {
  const keys = options.keys || BASIC_WEAR_KEYS;
  const empty = { type: 'object', properties: Object.fromEntries(['物品', '稀有度', '状态', '简介'].map((k) => [k, { type: 'string', enum: [''] }])), required: ['物品', '稀有度', '状态', '简介'], additionalProperties: false };
  const filled = { type: 'object', properties: { 物品: { type: 'string', minLength: 1 }, 稀有度: { type: 'string', enum: grades }, 状态: { type: 'string' }, 简介: { type: 'string', minLength: 1 } }, required: ['物品', '稀有度', '状态', '简介'], additionalProperties: false };
  const properties = {};
  if (tasks.length) properties.chars = { type: 'array', minItems: tasks.length, maxItems: tasks.length, items: { type: 'object', properties: { 姓名: { type: 'string', enum: [...new Set(tasks.map((n) => n.姓名))] }, 穿着: { type: 'object', properties: Object.fromEntries(keys.map((k) => [k, { anyOf: [empty, filled] }])), required: keys.slice(), additionalProperties: false } }, required: ['姓名', '穿着'], additionalProperties: false } };
  if (allowBusiness) {
    properties.protagonist = { type: 'object', properties: { 住所: { type: 'array', items: { type: 'object', additionalProperties: true } }, 事业: { type: 'array', items: { type: 'object', additionalProperties: true } } }, additionalProperties: false };
    properties.实体资产 = { type: 'array', items: { type: 'object', additionalProperties: true } };
  }
  return { name: 'complete_records', description: '按任务姓名逐人提交完整普通服装；仅在提供资产证据时允许补已有房屋企业资料，禁止改余额收支。', parameters: { type: 'object', properties, required: tasks.length ? ['chars'] : [], additionalProperties: false } };
}
function slotProblems(wear, keys = BASIC_WEAR_KEYS) {
  const out = [];
  if (!object(wear)) return ['缺少穿着对象'];
  for (const k of keys) {
    const slot = wear[k];
    if (!object(slot)) { out.push(k + '缺少槽位'); continue; }
    for (const f of ['物品', '稀有度', '状态', '简介']) if (!own(slot, f) || typeof slot[f] !== 'string') out.push(k + '缺少' + f);
    const item = String(slot.物品 || '').trim();
    if (item) {
      if (!grades.includes(slot.稀有度)) out.push(k + '品级须为N/R/SR/SSR/UR');
      if (!String(slot.简介 || '').trim()) out.push(k + '简介不能为空');
    } else if (['稀有度', '状态', '简介'].some((f) => String(slot[f] || '').trim())) out.push(k + '空槽包含残留信息');
  }
  if (!['上衣', '下衣'].some((k) => String(wear[k]?.物品 || '').trim())) out.push('普通服装全部为空');
  return [...new Set(out)];
}
export function inspectWardrobeResult(state, tasks, raw, options = {}) {
  const keys = options.keys || BASIC_WEAR_KEYS;
  const result = { update: { protagonist: {}, chars: [], summary: '' }, completed: [], missing: [], ignored: [], shape: { keys: [], returned: 0, matched: 0, accepted: 0 } };
  const rows = [];
  try {
    assertSafeValue(raw);
    if (!object(raw)) throw new Error('返回值不是对象');
    result.shape.keys = Object.keys(raw).slice(0, 12);
    for (const key of ['chars', 'npcs', '角色']) if (Array.isArray(raw[key])) for (const value of raw[key]) rows.push({ value, kind: '' });
    if (object(raw.protagonist?.穿着)) rows.push({ value: { 姓名: state.protagonist?.姓名, 穿着: raw.protagonist.穿着 }, kind: 'protagonist' });
  } catch (e) { result.ignored.push(String(e.message || e)); }
  result.shape.returned = rows.length;
  const targets = new Set(tasks.map((n) => String(n.姓名)));
  for (const { value } of rows) if (object(value) && !targets.has(String(value.姓名 || value.名字 || '').trim())) result.ignored.push('非目标角色已忽略');
  for (const task of tasks) {
    const name = String(task.姓名), matches = rows.filter(({ value, kind }) => object(value) && String(value.姓名 || value.名字 || '').trim() === name && (!kind || kind === task.kind));
    let why = [];
    if (!matches.length) why = ['未返回该角色服装'];
    else if (matches.length > 1 && new Set(matches.map((m) => JSON.stringify(m.value.穿着))).size > 1) why = ['同一角色返回了冲突服装'];
    if (why.length) { result.missing.push({ key: task.key, 姓名: name, why: why.join('、') }); continue; }
    result.shape.matched++;
    const source=matches[0].value.穿着??matches[0].value.衣着??matches[0].value.服装??matches[0].value.服饰;
    if(!object(source)){result.missing.push({key:task.key,姓名:name,why:'缺少穿着对象'});continue;}
    const supplied = cleanGeneratedValue(source);
    for(const k of keys){const slot=supplied&&supplied[k];if(slot&&typeof slot==='object'&&!String(slot.物品||'').trim())for(const field of ['稀有度','状态','简介'])if(typeof slot[field]==='string'&&slot[field])slot[field]='';}
    for (const k of options.optionalSlotsForTask?.(task) || []) if (!own(supplied, k)) supplied[k] = {物品:"",稀有度:"",状态:"",简介:""};
    why = slotProblems(supplied, keys);
    for (const k of options.requiredSlotsForTask?.(task) || []) if (!String(supplied[k]?.物品 || "").trim() || /^(未穿|不穿|没穿|未佩戴|未记录|暂无|未知|无)$/.test(String(supplied[k]?.物品 || "").trim())) why.push(k + "未补齐");
    if (why.length) { result.missing.push({ key: task.key, 姓名: name, why: why.slice(0, 3).join('、') }); continue; }
    const actor = task.kind === 'protagonist' ? state.protagonist : (state.npcs || []).find((n) => n.姓名 === task.姓名);
    const old = actor?.穿着 || {};
    const wear = copy(old);
    for (const k of keys) {
      const next = basicWear(supplied, keys)[k], prev = old[k];
      if (String(prev?.物品 || '').trim() && String(prev.物品).trim() !== next.物品.trim()) wear[k] = copy(prev);
      else {
        wear[k] = { ...(object(prev) ? prev : {}), ...next };
        if (options.preserveExistingFields && object(prev)) for (const field of ["物品","稀有度","状态","简介"]) if (typeof prev[field] === "string" && prev[field].trim()) wear[k][field] = prev[field];
      }
    }
    if (!hasReviewedWear(wear, keys)) { result.missing.push({ key: task.key, 姓名: name, why: '已有衣物须沿用原名并补齐格式' }); continue; }
    if (task.kind === 'protagonist') result.update.protagonist.穿着 = wear;
    else result.update.chars.push({ 姓名: name, 穿着: wear });
    result.completed.push(task.key);
  }
  result.shape.accepted = result.completed.length;
  return result;
}
const wearClause = /基础服装|普通服装|服装未补齐|服装补全|服装待核对/;
export function stripWardrobeIssues(issues) {
  return (Array.isArray(issues) ? issues : []).flatMap((issue) => {
    if (issue.code === 'wardrobe') return [];
    const parts = String(issue.why || '').split(/[；;]/).filter((s) => !wearClause.test(s));
    return parts.length ? [{ ...issue, why: parts.join('；') }] : [];
  });
}
export function currentWardrobeIssues(state, body = '') {
  const pending = wardrobeTasks(state, body);
  if (!pending.length) return [];
  const errors = state.story?.dataCompletion?.wardrobeErrors || {};
  const names = pending.slice(0, 6).map((n) => String(n.姓名) + (errors[n.key] ? '（' + errors[n.key] + '）' : ''));
  return [{ code: 'wardrobe', step: '资料', why: pending.length + '名角色基础服装待补齐：' + names.join('、') + (pending.length > 6 ? '等' : '') }];
}
export function reconcileWardrobeIssues(state, issues, body = '') {
  const out = [...stripWardrobeIssues(issues), ...currentWardrobeIssues(state, body)];
  return [...new Map(out.map((i) => [String(i.step) + '\0' + String(i.why), i])).values()];
}
export function refreshStoredWardrobeIssues(state, extra = [], options = {}) {
  if (options.existingOnly && !(state.transcript || []).some(t => t.role === 'assistant' && JSON.stringify(stripWardrobeIssues(t.issues)) !== JSON.stringify(t.issues || []))) return;
  for (const t of state.transcript || []) if (t.role === 'assistant' && Array.isArray(t.issues)) t.issues = stripWardrobeIssues(t.issues);
  const last = (state.transcript || []).filter((t) => t.role === 'assistant').at(-1);
  if (last) last.issues = reconcileWardrobeIssues(state, [...(last.issues || []), ...extra]);
}
export function wardrobeDiagnosticDiff(state, tasks, report, seq) {
  const meta = copy(state.story?.dataCompletion || {});
  const errors = { ...(meta.wardrobeErrors || {}) };
  for (const key of report?.completed || []) delete errors[key];
  for (const item of report?.missing || []) errors[item.key] = item.why;
  meta.wardrobeErrors = errors;
  meta.lastWardrobeRepair = { seq, targets: tasks.map((n) => n.key), accepted: report?.completed?.length || 0, missing: (report?.missing || []).map((n) => ({ 姓名: n.姓名, why: n.why })), shape: report?.shape || {} };
  return { path: ['story', 'dataCompletion'], to: meta };
}
