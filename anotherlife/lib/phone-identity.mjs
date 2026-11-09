const text = v => typeof v === 'string' ? v.trim() : '';
export function phoneNumberKey(value) {
  const v = text(value);
  return /^[+\d\s()（）-]+$/.test(v) && v.replace(/\D/g, '').length >= 7 ? v.replace(/[\s()（）-]/g, '') : v;
}
// 姓名/actorId和电话号码是不同身份依据；共用号码不能任意绑定第一人。
export function resolveSmsPeer(state, raw) {
  const value = text(raw).replace(/^sms:/, ''), npcs = Array.isArray(state?.npcs) ? state.npcs : [];
  if (!value || value.startsWith('群:')) return null;
  let found = npcs.filter(n => text(n.姓名 || n.名字) === value || text(n.actorId) === value);
  if (found.length === 1) return { npc: found[0], name: text(found[0].姓名 || found[0].名字), actorId: text(found[0].actorId), number: text(found[0].联系方式?.电话) };
  const rows = state.手机?.线程?.['sms:' + value];
  const bound = [...new Set((Array.isArray(rows) ? rows : []).map(m => text(m?.peerActorId)).filter(Boolean))];
  if (bound.length === 1) {
    found = npcs.filter(n => text(n.actorId) === bound[0]);
    if (found.length === 1) return { npc: found[0], name: text(found[0].姓名 || found[0].名字), actorId: text(found[0].actorId), number: text(found[0].联系方式?.电话) };
    return null; // 已绑定角色消失时，不让新号码持有人接管旧记录。
  }
  found = npcs.filter(n => text(n.联系方式?.电话) && phoneNumberKey(n.联系方式.电话) === phoneNumberKey(value));
  return found.length === 1 ? { npc: found[0], name: text(found[0].姓名 || found[0].名字), actorId: text(found[0].actorId), number: text(found[0].联系方式?.电话) } : null;
}
// 复用已存在的存储ID，不因后来补号码/改显示名而另建一条会话。
export function smsThreadId(state, raw) {
  const value = text(raw).replace(/^sms:/, ''), peer = resolveSmsPeer(state, value), threads = state.手机?.线程 || {};
  const ids = [...new Set([...Object.keys(threads),...Object.keys(state.手机?.隐藏会话 || {}).filter(id=>state.手机.隐藏会话[id]===true)])].filter(id => {
    if (!id.startsWith('sms:') || id.startsWith('sms:群:')) return false;
    if (id === 'sms:' + value) return true;
    const other = resolveSmsPeer(state, id);
    return peer && other && (peer.actorId && other.actorId ? peer.actorId === other.actorId : peer.name === other.name);
  });
  return ids.find(id => /^sms:[+\d]/.test(id)) || ids[0] || 'sms:' + (peer?.name || value);
}
export function smsThreadName(state, raw) {
  return resolveSmsPeer(state, raw)?.name || text(raw).replace(/^sms:/, '');
}
export function smsDisplayMessages(state, id, messages) {
  if (!String(id).startsWith('sms:')) return messages;
  const raw = String(id).slice(4), name = smsThreadName(state, id);
  return (messages || []).map(m => m?.方向 === 'in' && (!m.谁 || m.谁 === raw) ? { ...m, 谁: name } : m);
}
export function smsEvidence(state, id, evidence) {
  if (!String(id).startsWith('sms:')) return evidence;
  const raw = String(id).slice(4), name = smsThreadName(state, id);
  return { ...evidence, 会话: name, 说话人: evidence.方向 === 'in' && evidence.说话人 === raw ? name : evidence.说话人,
    可见成员: (evidence.可见成员 || []).map(w => w === raw ? name : w) };
}
