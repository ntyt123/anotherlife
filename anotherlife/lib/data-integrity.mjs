import { assertSafePath, assertSafeValue } from './runtime-core.mjs';

export const BASIC_WEAR_KEYS = ['头部', '上衣', '下衣', '袜子', '鞋子', '饰品'];
const own = (x, key) => !!x && Object.prototype.hasOwnProperty.call(x, key);
const clone = (x) => JSON.parse(JSON.stringify(x));
const emptyWords = new Set(['无', '暂无', '未提供', '未提及', '未知', '暂无明确设定', '无已知疾病', '未设定', '无信息']);
const roots = new Set(['world', 'protagonist', 'npcs', 'relationships', 'skills_items', '实体资产', '虚拟资产']);

export function cleanGeneratedValue(value) {
  assertSafeValue(value);
  const walk = (x) => {
    if (typeof x === 'string') {
      const text = x.trim();
      if (emptyWords.has(text)) return '';
      return x.replace(/\s*[（(](?:名称)?(?:未提供|未提及|暂无明确设定)[)）]\s*$/u, '');
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)]));
    return x;
  };
  return walk(value);
}

const credentialField=/^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|passwd|secret|client[_-]?secret|private[_-]?key|token|密码|密钥|访问令牌)$/i;
export function rejectedUpdateDetail(raw) {
  const detail={};
  if(own(raw,'path'))try{detail.attemptedPathText=JSON.stringify(raw.path);}catch{}
  const key=own(raw,'to')?'to':own(raw,'value')?'value':'';
  if(!key)return {...detail,attemptedValueMissing:true};
  let redacted=Array.isArray(raw.path)&&raw.path.some(p=>typeof p==='string'&&credentialField.test(p));
  try {
    const text=JSON.stringify(redacted?'[凭据已隐藏]':raw[key],(k,v)=>{if(credentialField.test(k)){redacted=true;return '[凭据已隐藏]';}return v;},2);
    if(typeof text!=='string')return {...detail,attemptedValueUnavailable:'拟写入值无法表示为JSON'};
    return {...detail,attemptedValueText:text,...(redacted?{attemptedValueRedacted:true}:{})};
  }catch{return {...detail,attemptedValueUnavailable:'拟写入值无法序列化'};}
}

export function extraModelDiffs(update, diagnostics = [], originalUpdate = update, resolveSubmitted = null) {
  const out = [],submittedRows=new Map();
  for(const source of ['diffs','other'])for(const raw of Array.isArray(originalUpdate?.[source])?originalUpdate[source]:[]){const k=source+':'+JSON.stringify(raw?.path);if(!submittedRows.has(k))submittedRows.set(k,[]);submittedRows.get(k).push(raw);}
  const add = (raw, source) => {
    const pool=submittedRows.get(source+':'+JSON.stringify(raw?.path));
    const submitted=resolveSubmitted?.(raw,source)??(pool?.length?pool.shift():!['diffs','other'].includes(source)&&own(originalUpdate,source)?{path:raw?.path,to:originalUpdate[source]}:raw);
    try {
      if (!raw || typeof raw !== 'object') throw new Error('不是变更对象');
      assertSafePath(raw.path);
      if (!roots.has(raw.path[0]) || raw.path.some((x) => typeof x === 'string' && x.startsWith('_'))) throw new Error('不允许修改内部状态');
      if (!own(raw, 'to') && !own(raw, 'value')) throw new Error('缺少新值');
      const value = own(raw, 'to') ? raw.to : raw.value;
      assertSafeValue(value);
      out.push({ path: raw.path.slice(), to: cleanGeneratedValue(value) });
    } catch (e) {
      diagnostics.push({ kind: 'invalid-update', source, path: Array.isArray(raw?.path) ? raw.path.slice(0, 8) : [], why: String(e.message || e), ...rejectedUpdateDetail(submitted) });
    }
  };
  for (const key of ['diffs', 'other']) if (own(update, key) && !Array.isArray(update[key])) diagnostics.push({ kind: 'invalid-update', source: key, path: [], why: '变更列表类型不符', ...rejectedUpdateDetail({path:[],value:originalUpdate?.[key]}) });
  for (const d of Array.isArray(update?.diffs) ? update.diffs : []) add(d, 'diffs');
  for (const d of Array.isArray(update?.other) ? update.other : []) add(d, 'other');
  for (const key of ['实体资产', '虚拟资产', 'skills_items']) {
    if (!own(update, key)) continue;
    const value = update[key];
    if (key === 'skills_items' ? !value || typeof value !== 'object' || Array.isArray(value) : !Array.isArray(value)) {
      diagnostics.push({ kind: 'invalid-update', source: key, path: [key], why: '字段类型不符', ...rejectedUpdateDetail({path:[key],value:originalUpdate?.[key]}) });
      continue;
    }
    add({ path: [key], to: value }, key);
  }
  return out;
}

export function dedupeModelDiffs(diffs, diagnostics = []) {
  const paths = new Map();
  const conflicts = new Set(),candidates=new Map();
  for (const d of diffs) {
    const key = JSON.stringify(d.path);
    if(!candidates.has(key))candidates.set(key,[]);candidates.get(key).push(d.to);
    if (paths.has(key) && JSON.stringify(paths.get(key).to) !== JSON.stringify(d.to)) conflicts.add(key);
    else if (!paths.has(key)) paths.set(key, d);
  }
  for (const key of conflicts) diagnostics.push({ kind: 'conflicting-update', path: JSON.parse(key), why: '同一路径提交了不同值', ...rejectedUpdateDetail({path:JSON.parse(key),to:candidates.get(key)}), attemptedValueCandidates:true });
  return [...paths.entries()].filter(([key]) => !conflicts.has(key)).map(([, d]) => d);
}

export const wardrobeKey = (kind, name) => JSON.stringify([kind, String(name || '').trim()]);
export function basicWear(wear, keys = BASIC_WEAR_KEYS) {
  return Object.fromEntries(keys.map((key) => {
    const raw = wear && typeof wear[key] === 'object' ? wear[key] : {};
    return [key, Object.fromEntries(['物品', '稀有度', '状态', '简介'].map((f) => [f, typeof raw[f] === 'string' ? raw[f] : '']))];
  }));
}
export function hasReviewedWear(wear, keys = BASIC_WEAR_KEYS) {
  return !!wear && keys.every((k) => own(wear, k) && wear[k] && typeof wear[k] === 'object' && own(wear[k], '物品')) &&
    ['上衣', '下衣'].some((k) => String(wear[k]?.物品 || '').trim()) && keys.every((k) => !String(wear[k]?.物品 || '').trim() || ['N', 'R', 'SR', 'SSR', 'UR'].includes(wear[k].稀有度));
}
export function wardrobeReviewDiff(state, update) {
  const meta = clone(state.story?.dataCompletion || {});
  const ready = { ...(meta.wardrobes || {}) };
  if (hasReviewedWear(update.protagonist?.穿着)) ready[wardrobeKey('protagonist', state.protagonist?.姓名)] = true;
  for (const n of Array.isArray(update.chars) ? update.chars : []) {
    const name = String(n.姓名 || n.名字 || '').trim();
    if (name && hasReviewedWear(n.穿着)) ready[wardrobeKey('npc', name)] = true;
  }
  if (JSON.stringify(ready) === JSON.stringify(meta.wardrobes || {})) return null;
  meta.wardrobes = ready;
  return { path: ['story', 'dataCompletion'], to: meta };
}
export function wardrobeTasks(state, body = '') {
  const ready = state.story?.dataCompletion?.wardrobes || {};
  return [{ kind: 'protagonist', n: state.protagonist }, ...(state.npcs || []).map((n) => ({ kind: 'npc', n }))]
    .filter(({ n }) => n && String(n.姓名 || '').trim())
    .filter(({ kind, n }) => kind === 'protagonist' || n.重要 === true || (Number(state.story?.current_message_index) || 0) - (Number(n.最近出场) || 0) <= 20 || String(body).includes(String(n.姓名)))
    .sort((a, b) => Number(b.kind === 'protagonist') - Number(a.kind === 'protagonist') || Number(b.n.重要 === true) - Number(a.n.重要 === true) || (Number(b.n.最近出场) || 0) - (Number(a.n.最近出场) || 0))
    .filter(({ kind, n }) => !ready[wardrobeKey(kind, n.姓名)] && !hasReviewedWear(n.穿着))
    .map(({ kind, n }) => ({ key: wardrobeKey(kind, n.姓名), kind, 姓名: n.姓名, 性别: n.性别 || '', 年龄: n.年龄 ?? '', 身份: n.身份 || '', 穿着: basicWear(n.穿着) }));
}

const businessWord = /买房|购房|房款|房产|房屋|交房|过户|定金|资金监管|钥匙|营业执照|办公室|租金|公司.{0,12}(?:成立|开业|注册)|(?:成立|开办|注册).{0,12}公司/;
const completedHouse = /(?:买|购买|购置|购入).{0,16}(?:房|住宅|别墅)|房款|购房定金|资金监管|房产过户|(?:房|住宅|别墅).{0,16}(?:买下|买入|购入|成交)/;
const completedCompany = /公司.{0,18}(?:成立|开业|注册)|(?:成立|开办|注册).{0,18}公司|营业执照.{0,24}(?:下来|领取|取得|办妥|获批)|执照.{0,24}(?:下来|领取|取得|办妥)/;
export function businessEvidence(text) {
  return String(text || '').split(/(?<=[。！？])\s*|\n+/).map((x) => x.trim())
    .filter((x) => businessWord.test(x) && !/内衣|内裤|私处|性器|性交|自慰|强奸|乳房|阴茎|阴道/.test(x)).slice(0, 22).join('\n');
}
function detailedHome(x) {
  return x && (String(x.名称 || x.名字 || '').trim() || x.总面积 || x.面积 || x.楼层 || x.每一层的设施);
}
function homeClues(text) {
  return [...String(text).matchAll(/[\u4e00-\u9fa5A-Za-z0-9]{2,18}(?:花园|公寓|小区|别墅)/g)].map((m) => m[0].replace(/^.*(?:在|是|叫|位于)/u, '')).filter((x) => x.length > 2);
}
export function completionPlan(state, body = '', seq = 0, force = false) {
  const attempted = state.story?.dataCompletion?.attempted || {};
  const wards = wardrobeTasks(state, body).filter((x) => force || !attempted['wear:' + x.key]);
  const prior = (state.transcript || []).filter((x) => x.role === 'assistant').slice(-8).map((x) => ({ seq: x.seq, text: businessEvidence(x.body) }));
  if (body) prior.push({ seq, text: businessEvidence(body) });
  const events = [];
  for (const x of prior) {
    if (!x.text || !force && attempted['business:' + x.seq]) continue;
    const hasHouse = /房|住宅|别墅/.test(x.text) && completedHouse.test(x.text);
    const clues = homeClues(x.text);
    const homes = Array.isArray(state.protagonist?.住所) ? state.protagonist.住所 : [];
    const knownHome = clues.length ? clues.some((c) => homes.some((h) => JSON.stringify(h).includes(c))) : homes.some(detailedHome);
    const hasCompany = completedCompany.test(x.text);
    const knownCompany = (state.实体资产 || []).some((a) => /公司|企业|经营|办公室/.test(JSON.stringify(a)));
    if (hasHouse && !knownHome || hasCompany && !knownCompany) events.push({ seq: x.seq, key: 'business:' + x.seq, 房屋待核对: hasHouse && !knownHome, 公司待核对: hasCompany && !knownCompany, 证据: x.text });
  }
  return { wardrobes: wards, events: [...new Map(events.map((e) => [e.key, e])).values()] };
}

export function mergeRecords(base, patches) {
  const out = Array.isArray(base) ? clone(base) : [];
  for (const raw of Array.isArray(patches) ? patches : []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = cleanGeneratedValue(raw);
    const names = [item.id, item.名称, item.名字].filter(Boolean).map(String);
    let at = out.findIndex((x) => names.some((n) => [x.id, x.名称, x.名字].filter(Boolean).map(String).includes(n)));
    if (at < 0 && !names.length && item.位置) at = out.findIndex((x) => !x.名称 && !x.名字 && x.位置 === item.位置 && String(x.总面积 || '') === String(item.总面积 || ''));
    if (at < 0) out.push(item);
    else {
      const merged = { ...out[at] };
      for (const [k, v] of Object.entries(item)) if (v !== '' && v !== null && v !== undefined || !own(merged, k)) merged[k] = v;
      out[at] = merged;
    }
  }
  return out;
}
export function restrictCompletion(state, raw) {
  const result = { protagonist: {}, chars: [], summary: '' };
  const p = raw?.protagonist || {};
  const pickWear = (w) => Object.fromEntries(BASIC_WEAR_KEYS.filter((k) => own(w, k)).map((k) => [k, Object.fromEntries(['物品', '稀有度', '状态', '简介'].filter((f) => own(w[k], f)).map((f) => [f, cleanGeneratedValue(w[k][f])]))]));
  if (p.穿着) result.protagonist.穿着 = pickWear(p.穿着);
  for (const k of ['住所', '事业']) if (Array.isArray(p[k])) result.protagonist[k] = mergeRecords(state.protagonist?.[k], p[k]);
  for (const n of Array.isArray(raw?.chars) ? raw.chars : []) {
    const name = String(n.姓名 || '').trim();
    if (name && (state.npcs || []).some((x) => x.姓名 === name) && n.穿着) result.chars.push({ 姓名: name, 穿着: pickWear(n.穿着) });
  }
  if (Array.isArray(raw?.实体资产)) result.实体资产 = mergeRecords(state.实体资产, raw.实体资产);
  return result;
}
export function completionAttemptDiff(state, plan) {
  const meta = clone(state.story?.dataCompletion || {});
  meta.attempted = { ...(meta.attempted || {}) };
  for (const n of plan.wardrobes) meta.attempted['wear:' + n.key] = true;
  for (const e of plan.events) meta.attempted[e.key] = true;
  return { path: ['story', 'dataCompletion'], to: meta };
}

export function dataIntegrityIssues(before, state, body, modelDiffs = []) {
  const issues = [];
  const noWear = [state.protagonist, ...(state.npcs || [])].filter((n) => n?.姓名 && !['上衣', '下衣'].some((k) => String(n.穿着?.[k]?.物品 || '').trim()));
  if (noWear.length) issues.push({ step: '资料', why: noWear.length + '名角色基础服装待补齐' });
  const business = businessEvidence(body);
  const purchase = /房|住宅|别墅/.test(business) && completedHouse.test(business);
  if (purchase) {
    if (JSON.stringify(before.protagonist?.住所 || []) === JSON.stringify(state.protagonist?.住所 || []) && JSON.stringify(before.实体资产 || []) === JSON.stringify(state.实体资产 || [])) issues.push({ step: '房产', why: '购房事项尚未形成房屋更新' });
    if (!modelDiffs.some((d) => d.path?.join('.') === 'protagonist.金钱')) issues.push({ step: '账务', why: '购房付款尚未入账，请核对实际付款金额' });
  }
  const detail = JSON.stringify(state.protagonist?.收支?.明细 || []);
  if (/押三付一|首月租金/.test(detail) && JSON.stringify(before.protagonist?.收支) !== JSON.stringify(state.protagonist?.收支) && modelDiffs.some((d) => d.path?.join('.') === 'protagonist.金钱')) issues.push({ step: '账务', why: '首期付款与固定租金需核对账期' });
  return issues;
}

export const COMPLETION_TOOL = {
  name: 'complete_records',
  description: '补齐普通基础服装及已有剧情中确认的房屋和企业资料；不得改变金钱、收支或剧情。',
  parameters: {
    type: 'object',
    properties: {
      protagonist: { type: 'object', description: '只允许普通穿着、住所和事业', additionalProperties: true },
      chars: { type: 'array', items: { type: 'object', additionalProperties: true } },
      实体资产: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    additionalProperties: false,
  },
};
