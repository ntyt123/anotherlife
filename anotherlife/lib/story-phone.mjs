import { createHash } from 'node:crypto';
import { contactAddress } from './phone-core.mjs';

const text = v => typeof v === 'string' ? v.trim() : '';
const own = (v, k) => !!v && Object.prototype.hasOwnProperty.call(v, k);
const clone = v => JSON.parse(JSON.stringify(v));
const platforms = ['sms', 'wechat', 'qq'];
const hash = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normTime = v => {
  const raw = text(v), m = raw.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:日)?[ T]+[^0-9]*?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? m[1] + '-' + m[2].padStart(2,'0') + '-' + m[3].padStart(2,'0') + ' ' + m[4].padStart(2,'0') + ':' + m[5] + (m[6] && m[6] !== '00' ? ':' + m[6] : '') : raw;
};
const selfNames = s => new Set([text(s.protagonist?.姓名), text(s.protagonist?.actorId), '主角', '我', '你'].filter(Boolean));
const person = (s, value) => (s.npcs || []).find(n => text(n.姓名 || n.名字) === value || text(n.actorId) === value);
const nameOf = (s, value) => text(person(s, text(value))?.姓名 || value);

export const PHONE_EVENTS_SCHEMA = {
  type: 'array', description: '本轮正文中新发生且涉及主角的短信/微信/QQ私聊；不是重复手机输入。未发生/回忆/引用的卡块用kind标明，不编消息原话。无事件可不填。',
  items: { type: 'object', properties: {
    platform: { type: 'string', enum: platforms }, sender: { type: 'string' }, recipient: { type: 'string' },
    content: { type: 'string', description: '已写出的消息原文，不另写回复' }, time: { type: 'string' },
    kind: { type: 'string', enum: ['occurred', 'reference', 'planned', 'alreadyRecorded'] },
    cardIndex: { type: 'integer', description: '对应正文sms卡的从0开始序号；不对应卡块时省略' },
  }, required: ['platform', 'sender', 'recipient', 'content'], additionalProperties: false },
};
export const STORY_PHONE_RULES = [
  '【正文通讯入手机】phoneEvents只提交本轮新发生、主角实际收发的私聊。普通叙述也要提取平台、发件人、收件人、已写出的消息内容和时间；不杜撰未写出的原话，不代主角回复。',
  '正文中的:::sms默认为主角当场收到的短信，号码/时间/内容保留原值；新卡建议在内容之前写发件人|、收件人|、方向|。其他人的来信、旁观、引用、旧消息回忆或未发草稿，必须在卡中写状态|reference或planned，或用phoneEvents的kind及cardIndex说明，不能当主角新收信。',
  '已存在的手机输入只承接后果，不再次提交为新消息（可标alreadyRecorded）。没有原文的消息不编造文案。微信/QQ私聊不会自动建立好友或授予未参与者知情；程序只路由、去重、记账与回退，不复核剧情语义。',
].join('\n');

// 只解析显式排版协议，不以叙事关键词猜测通讯事实。内容字段后的文本原样保留。
export function parseStorySms(body) {
  const result = [];
  for (const match of String(body || '').matchAll(/^:::sms[^\S\r\n]*\r?\n([\s\S]*?)^:::[^\S\r\n]*$/gmi)) {
    const fields = {}, lines = match[1].replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*([^|]+)\|(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      if (key === '内容') { fields[key] = [m[2], ...lines.slice(i + 1)].join('\n').trim(); break; }
      fields[key] = m[2].trim();
    }
    result.push({ ...fields, cardIndex: result.length });
  }
  return result;
}

function candidate(s, event, seq, fallbackTime, issues) {
  if (!event || typeof event !== 'object') return null;
  if (event.kind && event.kind !== 'occurred') return null;
  const platform = text(event.platform), sender = text(event.sender), recipient = text(event.recipient), content = text(event.content);
  if (!platforms.includes(platform) || !sender || !recipient || !content) { issues.push({ step: '手机', why: '通讯事件缺少有效平台、收发方或消息原文，未写入手机' }); return null; }
  const me = selfNames(s), outgoing = me.has(sender), incoming = me.has(recipient);
  if (outgoing === incoming) return null; // 他人私聊/自己对自己不属于本机私聊线程。
  const who = nameOf(s, outgoing ? recipient : sender), direction = outgoing ? 'out' : 'in';
  if (!who || who.startsWith('群:')) { issues.push({ step: '手机', why: '该通讯不是可归属的私聊，未擅自建立群或联系人' }); return null; }
  const time = text(event.time) || text(fallbackTime), tid = platform + ':' + who;
  const base = { platform, tid, direction, content, time };
  const id = 'story-phone:' + hash({ ...base, seq, ...(Number.isInteger(event.sourceCardIndex) ? {cardIndex:event.sourceCardIndex} : {}) });
  return { ...base, message: { id, 方向: direction, 谁: outgoing ? text(s.protagonist?.姓名) || '我' : who,
    类型: 'text', 内容: content, 时间: time, 轮次: seq, 来源: '正文', 来源轮次: seq, ...(Number.isInteger(event.sourceCardIndex) ? {来源卡序号:event.sourceCardIndex} : {}), 来源摘要: hash({ 内容: content, 时间: time, 方向: direction, 谁: outgoing ? text(s.protagonist?.姓名) || '我' : who }) } };
}

export function planStoryPhone(s, { body = '', events = [], seq = Number(s.story?.current_message_index) || 0, time = '', skipIds = [] } = {}) {
  const issues = [], supplied = Array.isArray(events) ? events : [], cards = parseStorySms(body), candidates = [];
  if (!Array.isArray(events) && events != null) issues.push({ step: '手机', why: 'phoneEvents不是事件数组，未写入该提交' });
  const phone = s.手机 || {}, threads = phone.线程 || {};
  for (const card of cards) {
    const overrides = supplied.filter(e => e && Number.isInteger(e.cardIndex) && e.cardIndex === card.cardIndex);
    if (overrides.some(e => e.kind && e.kind !== 'occurred')) continue;
    const status = card.状态 || card.kind;
    if (status && !['occurred', '已发生', '已发送', '已收到'].includes(status)) continue;
    const number = text(card.号码), matching = (s.npcs || []).filter(n => number && contactAddress(n).电话 === number);
    const me = text(s.protagonist?.姓名) || '主角';
    const outgoing = ['out', '发出', '发送'].includes(card.方向) || card.状态 === '已发送';
    const other = text(outgoing ? card.收件人 : card.发件人 || card.发送者) || (matching.length === 1 ? text(matching[0].姓名) : number);
    const e = { platform: 'sms', sender: outgoing ? me : other, recipient: outgoing ? text(card.收件人) || other : text(card.收件人) || me,
      content: card.内容, time: card.时间, kind: 'occurred', sourceCardIndex: card.cardIndex };
    // 模型可确认参与者；消息原文与时间以卡块为准，不重写现成内容。
    if (overrides.length === 1) { e.sender = text(overrides[0].sender) || e.sender; e.recipient = text(overrides[0].recipient) || e.recipient; }
    const c = candidate(s, e, seq, time, issues); if (c) candidates.push(c);
  }
  for (const e of supplied) {
    if (e && Number.isInteger(e.cardIndex) && cards[e.cardIndex]) continue;
    const c = candidate(s, e, seq, time, issues); if (!c) continue;
    const duplicateCard = candidates.find(x => x.tid === c.tid && x.direction === c.direction && x.content === c.content &&
      (!text(e.time) || normTime(x.time) === normTime(c.time)));
    if (!duplicateCard) candidates.push(c);
  }
  const plans = new Map();
  for (const c of candidates) {
    const existing = Array.isArray(threads[c.tid]) ? threads[c.tid] : [];
    const planned = plans.get(c.tid) || [];
    const duplicate = [...existing, ...planned].some(m => m?.id === c.message.id ||
      Number(m?.轮次) === Number(seq) && (!Number.isInteger(c.message.来源卡序号) || m?.来源 !== '正文' || m.来源卡序号 === c.message.来源卡序号) && m?.方向 === c.direction && text(m?.内容) === c.content && normTime(m?.时间) === normTime(c.time));
    if (!duplicate && !skipIds.includes(c.message.id)) { planned.push(c.message); plans.set(c.tid, planned); }
  }
  const diffs = [...plans].filter(([, added]) => added.length).map(([tid, added]) => ({
    path: ['手机', '线程', tid], to: added,
    _storyPhone: { version: 1, seq, hadThread: own(threads, tid), createdPhone: !s.手机, createdThreads: !phone.线程 },
  }));
  return { diffs, issues };
}

function validDiff(d) {
  return d?._storyPhone?.version === 1 && d.path?.length === 3 && d.path[0] === '手机' && d.path[1] === '线程' &&
    platforms.some(p => String(d.path[2]).startsWith(p + ':')) && Array.isArray(d.to) &&
    d.to.every(m => typeof m?.id === 'string' && m.id.startsWith('story-phone:') && m.来源 === '正文' && Number(m.来源轮次) === Number(d._storyPhone.seq));
}
// 专用事件入库，不放开模型的普通diff对手机根的任意覆盖。
export function applyStoryPhoneDiff(s, d) {
  if (!validDiff(d)) return false;
  s.手机 ||= {}; s.手机.线程 ||= {};
  const tid = d.path[2], old = Array.isArray(s.手机.线程[tid]) ? s.手机.线程[tid] : [], ids = new Set(old.map(m => m?.id));
  s.手机.线程[tid] = [...old, ...d.to.filter(m => !ids.has(m.id)).map(clone)];
  return true;
}
// 只撤销本轮导入的消息。后续手机自主聊天、手动删除及其他线程不能被旧快照覆盖。
export function rollbackStoryPhoneDiff(s, d) {
  if (!validDiff(d)) return false;
  const phone = s.手机, tid = d.path[2], arr = phone?.线程?.[tid];
  const ids = new Set(d.to.map(m => m.id));
  const remove = m => ids.has(m?.id) && m?.来源 === '正文' && Number(m?.来源轮次) === Number(d._storyPhone.seq);
  if (Array.isArray(phone?.线程历史?.[tid])) phone.线程历史[tid] = phone.线程历史[tid].map(snapshot => Array.isArray(snapshot) ? snapshot.filter(m=>!remove(m)) : snapshot);
  if (!Array.isArray(arr)) return true;
  const read = Number(phone.已读?.[tid] || 0);
  const deletedRead = arr.slice(0, read).filter(remove).length, next = arr.filter(m => !remove(m));
  if (!next.length && !d._storyPhone.hadThread) delete phone.线程[tid]; else phone.线程[tid] = next;
  if (own(phone.已读, tid)) { if (!own(phone.线程, tid)) delete phone.已读[tid]; else phone.已读[tid] = Math.max(0, Math.min(next.length, read - deletedRead)); }
  if (d._storyPhone.createdThreads && !Object.keys(phone.线程).length) delete phone.线程;
  if (d._storyPhone.createdPhone && !Object.keys(phone).length) delete s.手机;
  return true;
}

export function isStoryPhoneMessage(m) {
  return m?.来源 === '正文' && typeof m.来源摘要 === 'string' && m.来源摘要 === hash({ 内容:m.内容, 时间:m.时间, 方向:m.方向, 谁:m.谁 });
}
export function deletedStoryPhoneIds(s, entry) {
  const ids = [];
  for (const d of entry?.diffs || []) if (validDiff(d)) {
    const current = s.手机?.线程?.[d.path[2]] || [];
    for (const m of d.to) if (!current.some(x=>x?.id===m.id)) ids.push(m.id);
  }
  return ids;
}
