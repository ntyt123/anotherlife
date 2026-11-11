// 客观事件账本：不生成经历，不按正文关键词推断，仅接收明确成年角色的已发生事件。
const ilList = x => Array.isArray(x) ? x : [];
const ilText = x => typeof x === 'string' ? x.trim() : '';
const ilClone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const ilObject = x => x && typeof x === 'object' && !Array.isArray(x);
const ilName = x => ilText(x?.姓名 || x?.name);
const ilNames = x => [...new Set([ilName(x), ...ilList(x?.别名), ...ilList(x?.aliases), ...ilList(x?.曾用名)].map(ilText).filter(Boolean))];
const ilStable = value => Array.isArray(value) ? value.map(ilStable) : ilObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,ilStable(value[key])])) : value;
const ilHash = value => { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619); return (n >>> 0).toString(36); };
const ilDate = value => {
  const m = ilText(value).match(/(\d{4})\s*[年\-/]\s*(\d{1,2})\s*[月\-/]\s*(\d{1,2})/);
  if (!m) return null;
  const y = +m[1], month = +m[2], d = +m[3], check = new Date(Date.UTC(y, month - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === month - 1 && check.getUTCDate() === d ? [y, month, d] : null;
};
export const intimacyDateOf = s => ilText(s?.world?.叙事时间 || s?.world?.当前日期时间);
export function intimacyAdult(actor, date, referenceDate = date) {
  const rawAge = String(actor?.年龄 ?? '').trim(), ageMatch = rawAge.match(/^(\d+(?:\.\d+)?)\s*(?:周?岁)?$/u);
  if (rawAge && !ageMatch) return false;
  const age = ageMatch ? Number(ageMatch[1]) : 0;
  if (age > 0 && age < 18) return false;
  const birth = ilDate(actor?.生日), now = ilDate(date), ref = ilDate(referenceDate);
  if (birth && now) {
    const years = now[0] - birth[0] - (now[1] < birth[1] || (now[1] === birth[1] && now[2] < birth[2]) ? 1 : 0);
    return years >= 18;
  }
  if (!(Number.isFinite(age) && age >= 18)) return false;
  if (date === referenceDate || (now && ref && now.join('/') === ref.join('/'))) return true;
  // 只有当前年龄而没有生日时，保守核对历史事件，不能把今日成年当作当年成年。
  if (now && ref && now[0] <= ref[0]) return age - (ref[0] - now[0]) - 1 >= 18;
  return false;
}
export const intimacyEnabled = s => intimacyAdult(s?.protagonist, intimacyDateOf(s));
export function intimacyFrame(state) { return { enabled: intimacyEnabled(state), actors: ilList(state.npcs).map(actor => ({ actorId: ilText(actor.actorId), names: ilNames(actor), adult: intimacyAdult(actor, intimacyDateOf(state)) })) }; }
export const INTIMACY_SCHEMA = { type: 'array', description: '仅在主角和对象明确成年时记录已发生事件；无新增或续接返回[]。不直接修改protagonist.intimacyHistory。', items: { type: 'object', required: ['eventId', 'partners'], properties: {
  eventId: { type: 'string', description: '新场次用本轮唯一编号，如new_1；续接必须用上下文已有的完整事件id。' },
  mode: { type: 'string', enum: ['record', 'continue'] },
  time: { type: 'string', description: '已发生的游戏时间，未知留空，使用当前叙事时间，不回填人生历史。' },
  location: { type: 'string', description: '已发生地点，未知留空。' },
  open: { type: 'boolean', description: '同一场还在延续时true；结束时false。' },
  partners: { type: 'array', items: { type: 'object', required: ['partner', 'acts'], properties: {
    partner: { type: 'string', description: '已登记actorId，或可唯一对应的角色姓名；不编造对象。' },
    acts: { type: 'array', items: { type: 'object', required: ['type', 'count', 'countKnown'], properties: {
      type: { type: 'string', description: '简短的行为类型名称，不写过程描写。' }, count: { type: 'integer', minimum: 0 }, countKnown: { type: 'boolean' }
    } } }
  } } }
} } };
export const INTIMACY_RULES = `【性经验事件账本】仅记录事件发生时主角与每个对象均明确18岁及以上的已发生事实，只交客观类型与次数，不写过程描写。每次返回intimacyEvents数组，无新增或续接返回[]。
不从旧“经验”概述、恋爱身份、愿望、计划、梦境或重复回忆补造事件。只统计启用后的新事件；回忆或小结再次提到已有事件，不算新增。没有明确对象或成年依据时不登记，不猜名字和年龄。
同一次接触包含多种行为仍算一场，各行为分别计数；明确独立的第二次另建事件。新场次eventId用本轮唯一编号new_1/new_2等，mode=record；同一场跨轮继续时mode=continue并引用上下文完整事件id，更新该场已发生的行为累计值，不能提交增量、不能重复新建。结束后open=false。
次数不明确时count=0、countKnown=false，不猜具体数。多人同场只建立一个事件，每个对象只填自己实际参与的行为；接吻拥抱不纳入默认统计。partner优先actorId，其次唯一姓名。只用本工具intimacyEvents，禁止直接改protagonist.intimacyHistory或累计汇总。`;
export function intimacySettlementTool(tool, state) {
  const properties = { ...tool.parameters.properties };
  if (!intimacyEnabled(state)) { delete properties.intimacyEvents; return { ...tool, parameters: { ...tool.parameters, properties } }; }
  return { ...tool, parameters: { ...tool.parameters, properties: { ...properties, intimacyEvents: INTIMACY_SCHEMA }, required: [...new Set([...ilList(tool.parameters.required), 'intimacyEvents'])] } };
}
export function intimacyPayload(sources) {
  const values = [], issues = [];
  let provided = false;
  const accept = value => {
    provided = true;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
    if (!Array.isArray(value)) { issues.push({ step: '性经验', why: '事件格式不可识别，原账本保留' }); return; }
    values.push(...value);
  };
  for (const raw of ilList(sources)) {
    if (!ilObject(raw)) continue;
    if (Object.hasOwn(raw, 'intimacyEvents')) accept(raw.intimacyEvents);
    for (const key of ['other', 'diffs', 'updates']) for (const row of ilList(raw[key])) {
      let p = row?.path;
      if(typeof p==='string'&&p.trim().startsWith('[')){try{p=JSON.parse(p);}catch{}}
      if (p === 'intimacyEvents' || p === '/intimacyEvents' || (Array.isArray(p) && p.length === 1 && p[0] === 'intimacyEvents')) accept(Object.hasOwn(row, 'to') ? row.to : row.value);
    }
  }
  const unique = new Map();
  for (const row of values) {
    const key = ilText(row?.eventId);
    if (!key) { issues.push({ step: '性经验', why: '事件缺少编号，原账本保留' }); continue; }
    const canonical = JSON.stringify(ilStable(row));
    if (unique.has(key) && JSON.stringify(ilStable(unique.get(key))) !== canonical) issues.push({ step: '性经验', why: '同一事件编号交付冲突，原账本保留' });
    else unique.set(key, row);
  }
  return { provided, payload: [...unique.values()], issues };
}
function ilDiffs(before, after, path = ['protagonist', 'intimacyHistory']) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (ilObject(before) && ilObject(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => ilDiffs(before[key], after[key], path.concat(key)));
  if (Array.isArray(before) && Array.isArray(after) && after.length >= before.length) return after.flatMap((value, index) => ilDiffs(before[index], value, path.concat(index)));
  return [{ path, from: ilClone(before), to: ilClone(after), by: 'intimacy', _had: before !== undefined, _prev: before === undefined ? null : ilClone(before) }];
}
const ilAliases = { '阴道性交': '性交', '性交': '性交', '口部性接触': '口交', '手交': '手部性接触', '手部刺激': '手部性接触' };
function ilActs(raw) {
  if (!Array.isArray(raw) || !raw.length) throw Error('对象没有可记录的行为');
  const result = new Map();
  for (const item of raw) {
    let type = ilText(item?.type); type = Object.hasOwn(ilAliases, type) ? ilAliases[type] : type;
    if (!type || ['__proto__', 'prototype', 'constructor'].includes(type) || type.length > 24 || /[\r\n<>]/.test(type)) throw Error('行为类型必须是简短名称');
    const known = item?.countKnown === true, count = known ? Number(item.count) : 0;
    if (known && (!Number.isSafeInteger(count) || count < 1)) throw Error('明确次数必须是正整数');
    const previous = result.get(type);
    if (previous && (previous.count !== count || previous.countKnown !== known)) throw Error('同一行为次数交付冲突');
    result.set(type, { type, count, countKnown: known });
  }
  return [...result.values()].sort((a, b) => a.type.localeCompare(b.type, 'zh-CN'));
}
function ilPartner(state, ref, ledger) {
  if (!ref) throw Error('对象标识为空');
  const candidates = ilList(state.npcs).filter(npc => npc?.actorId === ref || ilNames(npc).includes(ref));
  if (candidates.length !== 1) throw Error('对象不能唯一对应已有角色');
  const actor = candidates[0], actorId = ilText(actor.actorId), names = ilNames(actor);
  const old = [...new Map(ilList(ledger.events).flatMap(event => ilList(event.partners)).map(partner=>[partner.id,partner])).values()];
  const matches = [...new Map(old.filter(p => (actorId && (p.actorId === actorId || p.id === actorId)) || (p.id.startsWith('legacy:') && (!p.actorId || p.actorId === actorId) && ilList(p.names).some(name => names.includes(name)))).map(p => [p.id, p])).values()];
  if (matches.length > 1) throw Error('对象历史身份不能唯一对应');
  return { actor, id: matches[0]?.id || actorId || 'legacy:' + ilHash(state.gameId || '') + ':' + encodeURIComponent(ilName(actor)), actorId, name: ilName(actor), names: [...new Set([...ilList(matches[0]?.names), ...names])] };
}
export function applyIntimacyEvents(state, payload, { seq = 0, textVersion = '', enabledAtStart = true, frame = null } = {}) {
  const issues = [], fail = why => ({ diffs: [], issues: [{ step: '性经验', why }], accepted: false });
  if (!enabledAtStart || !intimacyEnabled(state)) return { diffs: [], issues, accepted: false };
  if (!Array.isArray(payload)) return fail('本轮未交有效事件结果，原账本保留');
  const before = ilClone(state.protagonist.intimacyHistory), reference = intimacyDateOf(state);
  const next = ilClone(before || { version: 1, sinceSeq: seq, events: [] });
  if (!Array.isArray(next.events)) return fail('原账本结构不可识别，未覆盖');
  try {
    const seen = new Map();
    for (const raw of payload) {
      if (!ilObject(raw) || !ilText(raw.eventId) || !Array.isArray(raw.partners) || !raw.partners.length) throw Error('事件格式不可识别');
      const inputId = ilText(raw.eventId);
      if (seen.has(inputId)) { if (seen.get(inputId) !== JSON.stringify(raw)) throw Error('同一事件编号交付冲突'); continue; }
      seen.set(inputId, JSON.stringify(raw));
      const continued = raw.mode === 'continue';
      if (raw.mode && !['record', 'continue'].includes(raw.mode)) throw Error('事件操作不可识别');
      const id = continued ? inputId : 'int:' + seq + ':' + ilHash(textVersion) + ':' + ilHash(inputId);
      const index = next.events.findIndex(event => event.id === id), previous = next.events[index];
      if (continued && !previous) throw Error('续接事件不存在，不能冒充新事件');
      const time = continued ? previous.time : ilText(raw.time) || reference;
      if (!intimacyAdult(state.protagonist, time, reference)) throw Error('主角在事件时间的成年信息未确认');
      const partners = ilClone(previous?.partners || []), refs = new Set();
      for (const item of raw.partners) {
        const p = ilPartner(state, ilText(item.partner), next);
        const original = ilList(frame?.actors).filter(actor => (p.actorId && actor.actorId === p.actorId) || actor.names.some(name => p.names.includes(name)));
        if (original.length > 1 || (original.length === 1 && !original[0].adult)) throw Error('对象的原有成年信息未确认');
        if (refs.has(p.id)) throw Error('同一对象在事件中重复提交'); refs.add(p.id);
        if (!intimacyAdult(p.actor, reference) || !intimacyAdult(p.actor, time, reference)) throw Error('对象在事件时间的成年信息未确认');
        const value = { id: p.id, actorId: p.actorId, name: p.name, names: p.names, acts: ilActs(item.acts) };
        const at = partners.findIndex(old => old.id === p.id);
        if (at < 0) partners.push(value); else {
          value.acts = [...new Map([...partners[at].acts, ...value.acts].map(act => [act.type, act])).values()].sort((a,b)=>a.type.localeCompare(b.type,'zh-CN'));
          partners[at] = value;
        }
      }
      const event = { id, time, lastTime: continued ? ilText(raw.time) || reference : time, location: ilText(raw.location) || previous?.location || ilText(state.world?.当前地点), open: raw.open === true, partners, sourceSeq: previous?.sourceSeq ?? seq, sourceTextVersion: previous?.sourceTextVersion ?? textVersion, lastSeq: seq, lastTextVersion: textVersion };
      if (index < 0) next.events.push(event); else next.events[index] = event;
    }
  } catch (error) { return fail(error.message + '，原账本保留'); }
  const diffs = ilDiffs(before, next);
  if (diffs.length) state.protagonist.intimacyHistory = next;
  return { diffs, issues, accepted: true };
}
export function intimacySummary(state) {
  const partners = new Map(), events = ilList(state?.protagonist?.intimacyHistory?.events);
  for (const event of events) for (const partner of ilList(event.partners)) {
    let row = partners.get(partner.id);
    if (!row) { row = { id: partner.id, actorId: partner.actorId, name: partner.name, names: partner.names, sessions: 0, acts: {}, unknownActs: 0, records: [] }; partners.set(partner.id, row); }
    const current = ilList(state.npcs).find(n => (partner.actorId && n.actorId === partner.actorId) || (row.id.startsWith('legacy:') && ilNames(n).some(name => ilList(partner.names).includes(name))));
    row.name = current ? ilName(current) : partner.name;
    row.sessions++; row.records.push(event);
    for (const act of ilList(partner.acts)) { if (act.countKnown) row.acts[act.type] = (Object.hasOwn(row.acts, act.type) ? row.acts[act.type] : 0) + act.count; else row.unknownActs++; }
  }
  const latest = records => [...records].sort((a,b)=>Number(b.lastSeq||0)-Number(a.lastSeq||0))[0];
  const result = [...partners.values()].map(row => ({ ...row, first: row.records[0]?.time || '', last: latest(row.records)?.lastTime || latest(row.records)?.time || '' }));
  return { sessions: events.length, partnerCount: result.length, sinceSeq: state?.protagonist?.intimacyHistory?.sinceSeq, last: latest(events)?.lastTime || latest(events)?.time || '', partners: result.sort((a, b) => Number(b.records.at(-1)?.lastSeq || 0) - Number(a.records.at(-1)?.lastSeq || 0)) };
}
export function intimacyContext(state, body = '') {
  if (!intimacyEnabled(state)) return '';
  const summary = intimacySummary(state), events = ilList(state.protagonist?.intimacyHistory?.events);
  const relevant = summary.partners.filter(p => body && (ilText(body).includes(p.name) || ilList(p.names).some(name => name && ilText(body).includes(name))));
  const selected = [...new Map([...relevant, ...summary.partners.slice(0,8)].map(p => [p.id,p])).values()].slice(0,16);
  const ids = new Set(selected.map(p=>p.id));
  return '\n【性经验账本·只读摘要】\n' + JSON.stringify({ sinceSeq: summary.sinceSeq, sessions: summary.sessions, partners: selected.map(p => ({ id: p.id, actorId: p.actorId, name: p.name, sessions: p.sessions, acts: p.acts })), recentEvents: events.filter(e=>e.partners.some(p=>ids.has(p.id))).slice(-8).map(e => ({ id: e.id, time: e.time, open: e.open, partners: e.partners.map(p => ({ partner: p.actorId || p.name, acts: p.acts })) })) });
}
