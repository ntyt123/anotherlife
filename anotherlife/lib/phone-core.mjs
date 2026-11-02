const own = (x, key) => !!x && Object.prototype.hasOwnProperty.call(x, key);
export function phonePlatform(raw = 'sms') {
  const value = String(raw || 'sms').trim();
  if (!['sms', 'wechat', 'qq'].includes(value)) throw new Error('不支持的通讯平台');
  return value;
}
export function contactAddress(n) {
  const c = n?.联系方式 || {};
  return { 电话: String(c.电话 || '').trim(), 微信: String(c.微信 || '').trim(), QQ: String(c.QQ || '').trim() };
}
export function isPhoneContact(state, n, platform) {
  const p = phonePlatform(platform);
  const c = contactAddress(n);
  if (p === 'sms') return !!c.电话;
  const year=Number((String(state.world?.当前日期时间||state.world?.时代与年份||'').match(/\d{4}/)||[])[0]);
  if(year&&year<(p==='wechat'?2011:1999))return false;
  if (p === 'wechat' ? !!c.微信 : !!c.QQ) return true;
  const names = state.手机?.联系人?.[p];
  const nm = String(n?.姓名 || n?.名字 || '').trim();
  return (Array.isArray(names) && names.includes(nm)) || derivedInitialFriends(state, p).includes(nm);
}
export function phoneContactRecord(state, n, platform) {
  const p = phonePlatform(platform);
  return { 姓名: String(n?.姓名 || n?.名字 || '').trim(), ...contactAddress(n), ...(/^000\d{8}$/.test(contactAddress(n).电话)?{电话类型:'游戏虚拟'}:{}), 平台: p, 可发送: isPhoneContact(state, n, p) };
}
// 游戏内不可拨打的号码，不查找或冒充真人私人电话。已有号码永不覆盖。
export function seedGamePhoneNumbers(state) {
  const world=state.world||{},year=Number((String(world.当前日期时间||world.时代与年份||'').match(/\d{4}/)||[])[0]);
  if(!year||year<1992||/古代|古风|仙侠|武侠|宋代|无现代通讯|没有手机/.test(String(world.世界观类型||'')+' '+String(world.文明与技术水平||'')))return [];
  const npcs=Array.isArray(state.npcs)?state.npcs:[],used=new Set([contactAddress(state.protagonist).电话,...npcs.map(n=>contactAddress(n).电话)]),changes=[];
  const familiar=/妻|丈夫|父|母|兄|弟|姐|妹|配偶|家人|朋友|好友|恋人|伴侣|情人|经纪人|助手|助理|同事|合作伙伴|同学|同门|师父|老师/;
  let serial=1;
  for(const n of npcs){
    const name=String(n?.姓名||n?.名字||'').trim(),address=contactAddress(n),age=Number(n?.年龄)||(n?.生日?year-Number((String(n.生日).match(/\d{4}/)||[])[0]):0);
    if(!name||address.电话||age>0&&age<8||n.联系方式&&typeof n.联系方式!=='object')continue;
    const relation=[n.与主角关系,...(state.relationships||[]).filter(r=>r.对象===name).map(r=>r.关系)].filter(Boolean).join('；');
    const note=[n.备注,n.特点,n.当前状态,relation,...[state.parseInput?.character,state.extraInfo].filter(Boolean).flatMap(t=>String(t).split(/[，,。；;\n]/).filter(x=>x.includes(name)))].filter(Boolean).join('；');
    if(/没有手机|不用手机|不使用手机|无手机|拒绝提供电话|未交换号码|未交换电话|不知道电话|没有联系方式|尚未认识|陌生人/.test(note))continue;
    if(!isPhoneContact(state,n,'wechat')&&!isPhoneContact(state,n,'qq')&&!familiar.test(relation))continue;
    let number;do{number='000'+String(serial++).padStart(8,'0');}while(used.has(number));used.add(number);
    n.联系方式={...(n.联系方式||{}),...address,电话:number};changes.push({name,number});
  }
  return changes;
}

export function addPhoneContact(state, name, platform) {
  const p = phonePlatform(platform);
  const npc = (state.npcs || []).find((n) => String(n.姓名 || n.名字 || '').trim() === String(name || '').trim());
  if (!npc) throw new Error('没有这个角色');
  if (p === 'sms' && !contactAddress(npc).电话) throw new Error('没有电话号码');
  if (!state.手机) state.手机 = {};
  if (!state.手机.联系人 || typeof state.手机.联系人 !== 'object' || Array.isArray(state.手机.联系人)) state.手机.联系人 = {};
  const names = Array.isArray(state.手机.联系人[p]) ? state.手机.联系人[p] : [];
  const nm = String(npc.姓名 || npc.名字 || '').trim();
  if (!names.includes(nm)) names.push(nm);
  state.手机.联系人[p] = names;
  return phoneContactRecord(state, npc, p);
}

export function groupPlatform(phone, key, group) {
  if (['wechat', 'qq'].includes(group?.平台)) return group.平台;
  if (/^(wechat|qq):/.test(key) && group?.群名) return key.split(':')[0];
  const threads = phone?.线程 || {};
  if (own(threads, 'qq:群:' + key) && !own(threads, 'wechat:群:' + key)) return 'qq';
  return 'wechat';
}
export function listPhoneGroups(state, platform) {
  const p = phonePlatform(platform);
  if (p === 'sms') return [];
  const phone = state.手机 || {};
  return Object.entries(phone.群 || {}).filter(([key, g]) => g && groupPlatform(phone, key, g) === p)
    .map(([key, g]) => {
      const name = String(g.群名 || key);
      const arr = Array.isArray(phone.线程?.[p + ':群:' + name]) ? phone.线程[p + ':群:' + name] : [];
      const last = arr.at(-1);
      return { key, 群名: name, 平台: p, 成员: Array.isArray(g.成员) ? g.成员 : [], 建群时间: String(g.建群时间 || ''), 最近: last ? last.内容 : '', 条数: arr.length };
    });
}
export function findPhoneGroup(state, platform, name) {
  return listPhoneGroups(state, platform).find((g) => g.群名 === String(name || '').trim()) || null;
}
export function createPhoneGroup(state, platform, rawNames, rawName, time) {
  const p = phonePlatform(platform);
  if (p === 'sms') throw new Error('短信不支持群聊');
  const lead = String(state.protagonist?.姓名 || '');
  const known = new Set((state.npcs || []).map((n) => String(n.姓名 || n.名字 || '').trim()));
  const names = [...new Set((Array.isArray(rawNames) ? rawNames : []).map((x) => String(x || '').trim()).filter((x) => x && x !== lead))];
  if (names.length < 2) throw new Error('至少拉两个人');
  if (names.some((n) => !known.has(n))) throw new Error('群成员不在角色列表');
  const name = String(rawName || '').trim() || names.slice(0, 3).join('、') + (names.length > 3 ? '等' : '');
  if (name.length > 80) throw new Error('群名过长');
  if (findPhoneGroup(state, p, name)) throw new Error('已经有同名群');
  if (!state.手机) state.手机 = {};
  if (!state.手机.群 || typeof state.手机.群 !== 'object' || Array.isArray(state.手机.群)) state.手机.群 = {};
  if(state.手机.隐藏会话)delete state.手机.隐藏会话[p+':群:'+name];
  state.手机.群[p + ':' + name] = { 群名: name, 平台: p, 成员: names, 建群时间: time };
  return { 群名: name, 平台: p, threadId: p + ':群:' + name };
}
export function listPhoneThreads(state, platform) {
  const p = phonePlatform(platform);
  const phone = state.手机 || {};
  const out = [];
  for (const [tid, arr] of Object.entries(phone.线程 || {})) {
    if (!tid.startsWith(p + ':') || !Array.isArray(arr) || !arr.length) continue;
    const group = tid.startsWith(p + ':群:');
    const last = arr.at(-1);
    out.push({ threadId: tid, 是否群: group, 姓名: tid.slice((p + (group ? ':群:' : ':')).length), 最后: String(last.内容 || (last.类型 === 'image' ? '[图片]' : '')), 时间: String(last.时间 || ''), 方向: String(last.方向 || ''), 条数: arr.length, 未读: arr.length > Number(phone.已读?.[tid] || 0) && last.方向 === 'in' });
  }
  for (const g of listPhoneGroups(state, p)) {
    const tid=p+':群:'+g.群名;
    if (phone.隐藏会话?.[tid]!==true&&!out.some((x) => x.是否群 && x.姓名 === g.群名)) out.push({ threadId: tid, 是否群: true, 姓名: g.群名, 最后: '', 时间: g.建群时间, 方向: '', 条数: 0, 未读: false });
  }
  return out.sort((a, b) => String(b.时间).localeCompare(String(a.时间)));
}

export function derivedInitialFriends(state, platform = 'wechat', opening = false) {
  const p = phonePlatform(platform);
  if (p === 'sms') return [];
  const year = Number((String(state.world?.当前日期时间 || state.world?.时代与年份 || '').match(/(\d{4})/) || [])[1]);
  if (year && year < (p === 'wechat' ? 2011 : 1999)) return [];
  const recorded = state.手机?.初始好友?.[p];
  if (Array.isArray(recorded) && !opening) return recorded.slice();
  const first = (state.transcript || []).find((t) => t.role === 'assistant' && t.seq === 0);
  const names = new Set();
  for (const d of first?.diffs || []) {
    if (d.path?.[0] !== 'npcs') continue;
    if (Array.isArray(d.to)) for (const n of d.to) if (n?.姓名) names.add(n.姓名);
    if (d.to && typeof d.to === 'object' && d.to.姓名) names.add(d.to.姓名);
    if (d.path?.[2] === '姓名' && typeof d.to === 'string') names.add(d.to);
  }
  const declared = String(state.starting?.protagonist?.人物关系 || state.protagonist?.人物关系 || '');
  const familiar = /妻|丈夫|父|母|兄|弟|姐|妹|配偶|家人|朋友|好友|恋人|伴侣|情人|经纪人|助手|助理|同事|合作伙伴|同学|同门|师父|老师/;
  return (state.npcs || []).filter((n) => {
    const name = String(n.姓名 || n.名字 || '').trim();
    if (!name) return false;
    const age = Number(n.年龄) || (year && n.生日 ? year - Number((String(n.生日).match(/\d{4}/) || [])[0]) : 0);
    if (age > 0 && age < 8) return false;
    const relation = [n.与主角关系, ...(state.relationships || []).filter((r) => String(r.对象 || '') === name).map((r) => r.关系)].filter(Boolean).join('；');
    const explicitlyKnown = declared.includes(name);
    const source=[state.parseInput?.character,state.starting?.extraInfo,state.extraInfo,declared].filter(Boolean).join('；');
    const negatives=p==='wechat'?/未加微信|没有加微信|没加微信|未添加微信|已删除微信|删了微信|互删|拉黑|不用微信|不使用微信/:/未加QQ|没有加QQ|已删除QQ|不用QQ|不使用QQ/;
    if(source.split(/[，,。；;\n]/).some(x=>x.includes(name)&&negatives.test(x)))return false;
    return (opening || names.has(name) || explicitlyKnown) && (explicitlyKnown || familiar.test(relation));
  }).map((n) => String(n.姓名 || n.名字));
}
export function seedInitialFriends(state) {
  if (!state.手机) state.手机 = {};
  if (!state.手机.联系人) state.手机.联系人 = {};
  if (!state.手机.初始好友) state.手机.初始好友 = {};
  for (const p of ['wechat', 'qq']) {
    const names = derivedInitialFriends(state, p, true);
    state.手机.初始好友[p] = names;
    state.手机.联系人[p] = [...new Set([...(state.手机.联系人[p] || []), ...names])];
  }
}

// 群实体与会话列表分离：删除会话不解散群，新消息恢复会话。
export function syncPhoneThreadVisibility(state){
  const phone=state?.手机,hidden=phone?.隐藏会话;
  if(!hidden||typeof hidden!=='object'||Array.isArray(hidden))return;
  for(const tid of Object.keys(hidden))if(hidden[tid]===true&&Array.isArray(phone.线程?.[tid])&&phone.线程[tid].length)delete hidden[tid];
}
export function deletePhoneThread(state,rawId){
  const tid=String(rawId||'').trim();
  if(!tid)throw new Error('没指明会话');
  const colon=tid.indexOf(':');
  if(colon<1)throw new Error('会话编号不正确');
  const p=phonePlatform(tid.slice(0,colon)),group=tid.startsWith(p+':群:'),name=tid.slice((p+(group?':群:':':')).length);
  if(!name||p==='sms'&&group)throw new Error('会话编号不正确');
  const phone=state.手机||{},hasThread=own(phone.线程,tid),groupExists=group&&!!findPhoneGroup(state,p,name),hidden=phone.隐藏会话&&typeof phone.隐藏会话==='object'&&!Array.isArray(phone.隐藏会话)?phone.隐藏会话:{};
  if(!hasThread&&!groupExists&&hidden[tid]!==true)throw new Error('没有这个会话');
  const alreadyDeleted=hidden[tid]===true&&!hasThread;
  for(const field of ['线程','已读','线程历史'])if(phone[field]&&own(phone[field],tid))delete phone[field][tid];
  phone.隐藏会话={...hidden,[tid]:true};
  state.手机=phone;
  return{threadId:tid,alreadyDeleted};
}
