import { resolveSmsPeer, smsThreadId } from './phone-identity.mjs';
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
  '正文中的:::sms号码是会话地址，不代表每条都由该号发送。每张卡在内容之前写发件人|、收件人|，使用角色姓名或actorId，并在phoneEvents中以cardIndex关联；方向只在明确时给出，不能把他人手机视角当作主角收信。号码/时间/内容保留原值；缺收发身份的旧卡留待一次核对，不强判收到。其他人的来信、旁观、引用、旧消息回忆或未发草稿，必须在卡中写状态|reference或planned，或用phoneEvents的kind及cardIndex说明，不能当主角新收信。',
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
  const time = text(event.time) || text(fallbackTime), tid = platform === 'sms' ? smsThreadId(s, who) : platform + ':' + who;
  const base = { platform, tid, direction, content, time };
  const id = 'story-phone:' + hash({ ...base, seq, ...(Number.isInteger(event.sourceCardIndex) ? {cardIndex:event.sourceCardIndex} : {}) });
  return { ...base, message: { id, 方向: direction, 谁: outgoing ? text(s.protagonist?.姓名) || '我' : who,
    类型: 'text', 内容: content, 时间: time, 轮次: seq, 来源: '正文', 来源轮次: seq, sender: outgoing ? text(s.protagonist?.姓名) || '主角' : who, recipient: outgoing ? who : text(s.protagonist?.姓名) || '主角', ...(platform === 'sms' && resolveSmsPeer(s,who)?.actorId ? {peerActorId:resolveSmsPeer(s,who).actorId} : {}), ...(Number.isInteger(event.sourceCardIndex) ? {来源卡序号:event.sourceCardIndex} : {}), 来源摘要: hash({ 内容: content, 时间: time, 方向: direction, 谁: outgoing ? text(s.protagonist?.姓名) || '我' : who }) } };
}

export function storyPhoneBodyHash(body) { return hash(String(body || '')); }
export function resolveStoryPhoneEvents(s, { body = '', events = [] } = {}) {
  const cards = parseStorySms(body), supplied = Array.isArray(events) ? events : [], used = new Set(), resolved = [], unresolved = [];
  for (const card of cards) {
    let matches = supplied.map((e,i)=>({e,i})).filter(({e})=>e && Number.isInteger(Number(e.cardIndex)) && e.cardIndex !== undefined && Number(e.cardIndex) === card.cardIndex);
    if (!matches.length) matches = supplied.map((e,i)=>({e,i})).filter(({e})=>e?.platform === 'sms' && text(e.content) === text(card.内容) && (!text(e.time) || !text(card.时间) || normTime(e.time) === normTime(card.时间)));
    let e = matches.at(-1)?.e;
    for (const m of matches) used.add(m.i);
    const status = card.状态 || card.kind;
    if (!e && ['reference','planned','alreadyRecorded'].includes(status)) e = { kind: status, sender:'',recipient:'' };
    if (!e && text(card.发件人 || card.发送者) && text(card.收件人)) e = { sender:card.发件人 || card.发送者,recipient:card.收件人,kind:'occurred' };
    if (!e && ['in','out','发出','发送','收到'].includes(card.方向)) {
      const me = text(s.protagonist?.姓名) || '主角', other = text(card.联系人) || resolveSmsPeer(s,card.号码)?.name || text(card.号码), out = ['out','发出','发送'].includes(card.方向);
      if (other) e = { sender:out?me:other,recipient:out?other:me,kind:'occurred' };
    }
    if (!e || (!e.kind || e.kind === 'occurred') && (!text(e.sender) || !text(e.recipient))) { unresolved.push(card.cardIndex); continue; }
    resolved.push({ platform:'sms',sender:text(e.sender),recipient:text(e.recipient),content:text(card.内容),time:text(card.时间),kind:e.kind || 'occurred',cardIndex:card.cardIndex });
  }
  return { cards, unresolved, events:[...resolved,...supplied.filter((e,i)=>!used.has(i) && !(e && e.cardIndex !== undefined && cards[Number(e.cardIndex)]))] };
}
export function previewStoryPhone(s, entry) {
  const value = resolveStoryPhoneEvents(s,{body:entry.body,events:entry.phoneEventsBodyHash && entry.phoneEventsBodyHash!==storyPhoneBodyHash(entry.body)?[]:entry.phoneEvents || []}), me=selfNames(s);
  return { seq:entry.seq, textVersion:entry.textVersion || '', bodyHash:storyPhoneBodyHash(entry.body), needsReview:value.unresolved.length>0,
    cards:value.cards.map(card=>{const e=value.events.find(e=>Number(e.cardIndex)===card.cardIndex),peer=e?(me.has(e.sender)?e.recipient:e.sender):resolveSmsPeer(s,card.号码)?.name || text(card.号码);return{cardIndex:card.cardIndex,content:card.内容 || '',time:card.时间 || '',peer:peer || '',sender:e?.sender || '',recipient:e?.recipient || '',kind:e?.kind || '',direction:e?e.kind!=='occurred'?'skip':me.has(e.sender)?'out':me.has(e.recipient)?'in':'skip':''};}),
    contacts:(s.npcs || []).map(n=>({name:text(n.姓名 || n.名字),actorId:text(n.actorId)})).filter(n=>n.name), protagonist:text(s.protagonist?.姓名) || '主角' };
}
function sourceRows(s, seq, index) {
  const out=[];
  for(const[tid,arr]of Object.entries(s.手机?.线程 || {}))if(Array.isArray(arr))arr.forEach((m,i)=>{if(m?.来源==='正文' && Number(m.来源轮次)===Number(seq) && Number(m.来源卡序号)===Number(index))out.push({tid,index:i,message:m});});
  return out;
}
export function planStoryPhone(s, { body = '', events = [], seq = Number(s.story?.current_message_index) || 0, time = '', skipIds = [] } = {}) {
  const issues=[], value=resolveStoryPhoneEvents(s,{body,events}), plans=new Map(), diffs=[];
  for(const i of value.unresolved)issues.push({step:'手机',code:'phone-direction',cardIndex:i,why:'该短信卡未注明收发双方，请用📩核对后同步'});
  if(!Array.isArray(events)&&events!=null)issues.push({step:'手机',why:'phoneEvents不是事件数组，未写入该提交'});
  for(const e of value.events){
    if(e?.kind && e.kind!=='occurred' && e.cardIndex!==undefined){const old=sourceRows(s,seq,Number(e.cardIndex));if(old.length)diffs.push({path:['手机','线程',old[0].tid],to:[],_storyPhone:{version:2,seq,hadThread:true,previous:clone(old),omit:true}});continue;}
    const c=candidate(s,{...e,sourceCardIndex:e.platform==='sms'&&Number.isInteger(Number(e.cardIndex))&&e.cardIndex!==undefined?Number(e.cardIndex):undefined},seq,time,issues);if(!c)continue;
    const cardIndex=c.message.来源卡序号, known=Number.isInteger(cardIndex)?sourceRows(s,seq,cardIndex):[];
    if(known.length){
      if(new Set(known.map(r=>JSON.stringify([r.message.内容,r.message.时间]))).size>1){issues.push({step:'手机',code:'phone-conflict',why:'同一短信来源存在不同文本修订，已保留全部消息，未强行合并'});continue;}
      const primary=known.find(r=>r.tid===c.tid)||known[0], edited=!isStoryPhoneMessage(primary.message);
      const updated={...primary.message,...c.message,id:primary.message.id,...(edited?{内容:primary.message.内容,时间:primary.message.时间}: {})};
      const peer=resolveSmsPeer(s,c.tid),oldPeer=resolveSmsPeer(s,primary.tid);
      const target=!oldPeer || peer && oldPeer.name===peer.name ? primary.tid : c.tid;
      if(known.length===1 && target===primary.tid && JSON.stringify(updated)===JSON.stringify(primary.message))continue;
      diffs.push({path:['手机','线程',target],to:[updated],_storyPhone:{version:2,seq,hadThread:own(s.手机?.线程,target),previous:clone(known)}});continue;
    }
    if(skipIds.includes(c.message.id)||Number.isInteger(cardIndex)&&skipIds.includes('source-card:'+seq+':'+cardIndex))continue;
    const existing=Array.isArray(s.手机?.线程?.[c.tid])?s.手机.线程[c.tid]:[], planned=plans.get(c.tid)||[];
    const duplicate=[...existing,...planned].some(m=>m?.id===c.message.id || Number(m?.轮次)===Number(seq)&&(!Number.isInteger(cardIndex)||m?.来源!=='正文'||m.来源卡序号===cardIndex)&&m?.方向===c.direction&&text(m?.内容)===c.content&&normTime(m?.时间)===normTime(c.time));
    if(!duplicate){planned.push(c.message);plans.set(c.tid,planned);}
  }
  for(const[tid,added]of plans)if(added.length)diffs.push({path:['手机','线程',tid],to:added,_storyPhone:{version:1,seq,hadThread:own(s.手机?.线程,tid),createdPhone:!s.手机,createdThreads:!s.手机?.线程}});
  return{diffs,issues,events:value.events,needsReview:value.unresolved.length>0};
}

function validDiff(d) {
  return [1,2].includes(d?._storyPhone?.version) && d.path?.length === 3 && d.path[0] === '手机' && d.path[1] === '线程' &&
    platforms.some(p => String(d.path[2]).startsWith(p + ':')) && Array.isArray(d.to) &&
    d.to.every(m => typeof m?.id === 'string' && m.id.startsWith('story-phone:') && m.来源 === '正文' && Number(m.来源轮次) === Number(d._storyPhone.seq));
}
// 专用事件入库，不放开模型的普通diff对手机根的任意覆盖。
export function applyStoryPhoneDiff(s, d) {
  if (!validDiff(d)) return false;
  if (d._storyPhone.version === 2) return applyCorrection(s,d);
  s.手机 ||= {}; s.手机.线程 ||= {};
  const tid = d.path[2], old = Array.isArray(s.手机.线程[tid]) ? s.手机.线程[tid] : [], ids = new Set(old.map(m => m?.id));
  s.手机.线程[tid] = [...old, ...d.to.filter(m => !ids.has(m.id)).map(clone)];
  return true;
}
// 只撤销本轮导入的消息。后续手机自主聊天、手动删除及其他线程不能被旧快照覆盖。
export function rollbackStoryPhoneDiff(s, d) {
  if (!validDiff(d)) return false;
  if (d._storyPhone.version === 2) return rollbackCorrection(s,d);
  const found = Object.entries(s.手机?.线程 || {}).find(([tid,arr])=>Array.isArray(arr)&&arr.some(m=>d.to.some(x=>x.id===m?.id)));
  const phone = s.手机, tid = found?.[0] || d.path[2], arr = phone?.线程?.[tid];
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
  const present=new Set(Object.values(s.手机?.线程 || {}).flatMap(a=>Array.isArray(a)?a.map(m=>m?.id):[])),ids=[],anchors=new Map();
  for(const d of entry?.diffs || [])if(validDiff(d))for(const m of d.to){if(!present.has(m.id))ids.push(m.id);if(Number.isInteger(m.来源卡序号)){const k='source-card:'+m.来源轮次+':'+m.来源卡序号;anchors.set(k,anchors.get(k)||present.has(m.id));}}
  for(const[k,alive]of anchors)if(!alive)ids.push(k);
  return ids;
}
function owned(m,seq,ids){return m?.来源==='正文'&&Number(m.来源轮次)===Number(seq)&&ids.has(m.id);}
function insert(arr,message,index){const next=[...arr];next.splice(Math.min(index??next.length,next.length),0,clone(message));return next;}
function applyCorrection(s,d){
  const meta=d._storyPhone, previous=meta.previous || [], ids=new Set(previous.map(r=>r.message.id)), target=d.path[2], updated=d.to[0];
  s.手机 ||= {};s.手机.线程 ||= {};
  let at=previous.find(r=>r.tid===target)?.index;
  const targetWasRead=previous.some(r=>r.tid===target && r.index<Number(s.手机.已读?.[target] || 0));
  for(const[tid,arr]of Object.entries(s.手机.线程))if(Array.isArray(arr)){
    const read=Number(s.手机.已读?.[tid] || 0),remove=m=>owned(m,meta.seq,ids),removedRead=arr.slice(0,read).filter(remove).length;
    const next=arr.filter(m=>!remove(m));
    if(next.length||tid===target)s.手机.线程[tid]=next;else delete s.手机.线程[tid];
    if(own(s.手机.已读,tid))s.手机.已读[tid]=Math.max(0,Math.min(next.length,read-removedRead));
  }
  if(updated)s.手机.线程[target]=insert(s.手机.线程[target] || [],updated,at);
  // 当前旧消息已读，则校正后仍保持相应已读位置；不将后来独立消息标未读。
  if(updated&&own(s.手机.已读,target)&&targetWasRead)s.手机.已读[target]=Math.min(s.手机.线程[target].length,Number(s.手机.已读[target])+1);
  for(const[tid,hist]of Object.entries(s.手机.线程历史 || {}))if(Array.isArray(hist))s.手机.线程历史[tid]=hist.map(a=>{
    if(!Array.isArray(a))return a;const index=a.findIndex(m=>owned(m,meta.seq,ids));if(index<0)return a;
    const kept=a.filter(m=>!owned(m,meta.seq,ids));return tid===target&&updated?insert(kept,updated,index):kept;
  });
  return true;
}
function rollbackCorrection(s,d){
  const meta=d._storyPhone,updated=d.to[0], previous=meta.previous || [];
  if(!updated)return true;
  const ids=new Set([updated.id]);
  const current=Object.entries(s.手机?.线程 || {}).flatMap(([tid,a])=>Array.isArray(a)?a.map((m,index)=>({tid,index,m})):[]).find(r=>owned(r.m,meta.seq,ids));
  if(!current)return true; // 手动删除后不能因回退修复而复活。
  const userEdited=current.m.内容!==updated.内容||current.m.时间!==updated.时间, wasRead=current.index<Number(s.手机.已读?.[current.tid] || 0);
  for(const[tid,a]of Object.entries(s.手机.线程))if(Array.isArray(a)){const read=Number(s.手机.已读?.[tid] || 0);if(own(s.手机.已读,tid))s.手机.已读[tid]=Math.max(0,read-a.slice(0,read).filter(m=>owned(m,meta.seq,ids)).length);const kept=a.filter(m=>!owned(m,meta.seq,ids));if(kept.length||tid!==d.path[2]||meta.hadThread)s.手机.线程[tid]=kept;else delete s.手机.线程[tid];}
  for(const p of [...previous].sort((a,b)=>a.index-b.index)){
    const m=p.message.id===updated.id&&userEdited?{...p.message,内容:current.m.内容,时间:current.m.时间}:p.message;
    const read=Number(s.手机.已读?.[p.tid] || 0);s.手机.线程[p.tid]=insert(s.手机.线程[p.tid] || [],m,p.index);
    if(own(s.手机.已读,p.tid)&&wasRead&&p.index<=read)s.手机.已读[p.tid]=read+1;
  }
  for(const[tid,hist]of Object.entries(s.手机.线程历史 || {}))if(Array.isArray(hist))s.手机.线程历史[tid]=hist.map(a=>{
    if(!Array.isArray(a)||!a.some(m=>owned(m,meta.seq,ids)))return a;let kept=a.filter(m=>!owned(m,meta.seq,ids));
    for(const p of previous.filter(p=>p.tid===tid).sort((a,b)=>a.index-b.index))kept=insert(kept,p.message,p.index);return kept;
  });
  return true;
}
