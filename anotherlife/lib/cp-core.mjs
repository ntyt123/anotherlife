import { createHash } from 'node:crypto';
import { findReplyAction } from './weibo-core.mjs';
const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 24);
const text = x => String(x ?? '').trim();
const list = x => Array.isArray(x) ? x : [];
const cleanName = x => text(x).replace(/[@＠\s]/g, '').replace(/[Vv]$/, '');
export const cpEnabled = s => s?.protagonist?.是否艺人 === true;
export function cpNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const t = text(value).replace(/[,，\s]/g, ''); if (!t) return null;
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)(万|亿|千|百)?(?:人|名|位)?$/); if (m) { const n=Number(m[1]) * ({ 万: 10000, 亿: 1e8, 千: 1000, 百: 100 }[m[2]] || 1); return Number.isFinite(n)?n:null; }
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/^[负正零〇一二两三四五六七八九十百千万亿]+(?:人|名)?$/.test(t)) return null;
  let total = 0, section = 0, n = 0; for (const ch of t.replace(/[负正人名]/g, '')) { if (Object.hasOwn(digits, ch)) n = digits[ch]; else { const unit = { 十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 1e8 }[ch]; if (unit < 10000) { section += (n || 1) * unit; n = 0; } else { total += (section + n || 1) * unit; section = 0; n = 0; } } } return (total + section + n) * (t.startsWith('负') ? -1 : 1);
}
function resolveActor(s, value) {
  const key = cleanName(value); const me = s.protagonist || {};
  if (['player', '我', '自己', '主角', '玩家', cleanName(me.姓名), cleanName(me.微博账号)].filter(Boolean).includes(key)) return { actor: me, id: 'player' };
  const matches = list(s.npcs).filter(n => [n.actorId, n.姓名, n.微博账号, ...list(n.曾用名), ...list(n.aliases)].some(v => cleanName(v) === key));
  return matches.length === 1 ? { actor: matches[0], id: matches[0].actorId || 'name:' + cleanName(matches[0].姓名) } : null;
}
function partnerFor(s, a, b) { const x = resolveActor(s, a), y = resolveActor(s, b); if (!x || !y || x.id === y.id) return null; return x.id === 'player' ? y : y.id === 'player' ? x : null; }
function makeFact(s, id, type, a, b, content, postId = '', seq = 0) { const partner = partnerFor(s, a, b); if (!partner || !text(partner.actor.性别).includes('女')) return null; return { id: 'weibo:' + id, partnerId: partner.id, partner: partner.actor.姓名, type, actor: text(a), target: text(b), text: text(content), postId, seq }; }
function cardPosts(body) { const posts = []; for (const m of text(body).matchAll(/:::weibo\s*\n([\s\S]*?)\n:::/g)) { const p = { 评论列表: [] }; for (const line of m[1].split(/\r?\n/)) { const i = line.indexOf('|'); if (i < 0) continue; const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim(); if (k.startsWith('评论-')) p.评论列表.push({ 谁: k.slice(3), 内容: v }); else if (!['__proto__','constructor','prototype'].includes(k)) p[k] = v; } if (p.作者 && p.正文) posts.push(p); } return posts; }
// 只收可明确确定操作者、对象的公开互动，数字点赞/转发总数不是互动身份。
export function cpWeiboFacts(s, { cache, pending = [], body = '', seq = 0, includeReplyCards = false } = {}) {
  if (!cpEnabled(s)) return { facts: [], cacheIds: [] };
  const facts = [], cacheFacts = [], me = s.protagonist.姓名;
  const push = (arr, value) => { if (value && !arr.some(x => x.id === value.id)) arr.push(value); };
  for (const a of list(s.weiboInteractions)) { if (a.epoch !== (s.protagonist.cpEpoch || 0) || Number(a.seq) > seq) continue; push(facts, makeFact(s, a.id, ({like:'点赞',unlike:'取消点赞',repost:'转发'}[a.type] || a.type), me, a.target, a.text || a.postBody, a.postId, a.seq)); }
  for (const a of pending.filter(a => a.cpEpoch === (s.protagonist.cpEpoch || 0))) push(facts, makeFact(s, a.id, '评论', me, a.回谁 || a.微博作者, a.评论, a.postId, a.轮次));
  const posts = list(cache?.时间线);
  const fromPost = (p, target) => {
    const id = p.id || 'card_' + hash([p.作者, p.正文, p.时间 || '']);
    for (const c of list(p.评论列表 || p.评论).filter(c => c.轮次 == null || Number(c.轮次) <= seq)) push(target, makeFact(s, c.id || hash([id,c.谁,c.内容]), c.回复 ? '回复' : '评论', c.谁, c.回谁 || c.回复谁 || p.作者, c.内容, id, c.轮次 ?? seq));
    for (const who of list(p.点赞者 || p.赞的人 || (Array.isArray(p.赞) ? p.赞 : []))) push(target, makeFact(s, 'like:' + id + ':' + cleanName(who), '点赞', who, p.作者, p.正文, id, seq));
    for (const [k,v] of Object.entries(p)) if (/^(?:赞|点赞)-/.test(k)) push(target, makeFact(s, 'like:' + id + ':' + cleanName(k.replace(/^(?:赞|点赞)-/,'')), '点赞', k.replace(/^(?:赞|点赞)-/,''), p.作者, p.正文, id, seq));
    if (p.原作者 || p.转发自) push(target, makeFact(s, 'repost:' + id, '转发', p.作者, p.原作者 || p.转发自, p.正文, id, seq));
  };
  for (const p of posts) fromPost(p, cacheFacts);
  for (const p of cardPosts(body)) { const match = posts.find(x => cleanName(x.作者) === cleanName(p.作者) && text(x.正文) === text(p.正文)); fromPost(match ? { ...p, id: match.id } : p, facts); }
  if (includeReplyCards) { const counts = new Map(); for (const m of text(body).matchAll(/:::weibo_reply\s*\n([\s\S]*?)\n:::/g)) { const c = {}; for (const ln of m[1].split(/\r?\n/)) { const i=ln.indexOf('|'); if(i>=0 && !['__proto__','constructor','prototype'].includes(ln.slice(0,i).trim()))c[ln.slice(0,i).trim()]=ln.slice(i+1).trim(); } const a=findReplyAction(c,pending); if(!a||!c.内容)continue; const k=a.id+'|'+c.谁, n=counts.get(k)||0; counts.set(k,n+1); const id='wr_'+createHash('sha256').update(seq+'|'+k+'|'+n).digest('hex').slice(0,32); push(facts,makeFact(s,id,'回复',c.谁,me,c.内容,a.postId,seq)); } }
  const cp = s.protagonist.cpState;
  if (cp?.weiboBaseline) for (const f of cacheFacts) push(facts, f);
  const used = new Set(list(cp?.seenSources));
  return { facts, cacheIds: cacheFacts.map(f => f.id) };
}
export function cpContext(s, facts = []) {
  if (!cpEnabled(s)) return '';
  return '\n【CP局势·只读】\n' + JSON.stringify({ pairs: list(s.protagonist.cpState?.pairs).map(p => ({ id:p.id, partner:p.partner, partnerId:p.partnerId, name:p.name, count:p.count, countKnown:p.countKnown, heat:p.heat, cohesion:p.cohesion, controversy:p.controversy, status:p.status, recentEvents:list(p.events).slice(-3).map(e=>({id:e.id,title:e.title,evidence:e.evidence,sourceIds:e.sourceIds})) })), publicWeiboInteractions: facts.filter(f => !list(s.protagonist.cpState?.seenSources).includes(f.id)) });
}
export const CP_SCHEMA = { type: 'array', description: '星途开启时提交有正文或已提供微博事实依据的CP事件；没有就空数组。禁止直接修改protagonist.cpState。', items: { type:'object', properties: { partner:{type:'string'}, type:{type:'string',enum:['create','activity']}, evidence:{type:'string'}, title:{type:'string'}, sourceIds:{type:'array',items:{type:'string'}}, count:{}, delta:{}, percent:{}, estimated:{type:'boolean'}, name:{type:'string'}, heat:{type:'number'}, cohesion:{type:'number'}, controversy:{type:'number'}, status:{type:'string'}, origin:{type:'string'}, topics:{type:'array',items:{type:'object',properties:{title:{type:'string'},comments:{type:'array',items:{type:'object',properties:{stance:{type:'string'},text:{type:'string'}},required:['text'],additionalProperties:true}}},required:['title','comments'],additionalProperties:true}} }, required:['partner','type','evidence','title'], additionalProperties:true } };
export const CP_RULES = `【星途CP结算】仅在主角是否艺人=true时有效。只统计主角与明确女性艺人/演艺从业者的CP，不统计其他人的CP，不把嗑CP当真实恋情，不改好感/婚恋/现金/旧粉丝圈层。
返回cpUpdates数组。首次type=create，必须引用本轮正文中明确已形成CP粉群体的原文证据；同框/私下喜欢/未来计划/否认尚未成立不能创建。partner写对应人物姓名或actorId。CP成立不能仅由微博普通点赞推断。成立前的旧微博不追溯补算。
已有CP的公开活动、避嫌、澄清、退坑等正文新事实可用type=activity；evidence须引用本轮正文。已提供publicWeiboInteractions的实际点赞/取消点赞/评论/回复/转发也须纳入已有CP评估，填写对应sourceIds；同一互动被正文复述时合并为一项，不另外再记故事涨幅；输入中每条相关新互动都要覆盖，不能忽略。纯转述旧事不重复计数，延续同一活动可写已有eventId并追加讨论。
数字：正文有明确总数写count，有增减写delta，有比例写percent（如-30表示下降30%）；同时有总数和增量优先count，只算一次。仅定性描述则依据已知规模、曝光、反应强弱给合理估算delta并estimated=true，不编造精确事实。形成但无明确人数时可估算初始人数。没相关事实不变，不随时间自动涨跌。
每个有效事件给title、origin（作品/综艺/舞台/真人向等）、必要的heat/cohesion/controversy(0到100)及status。活动至少一个topics话题，每题3到5条不同立场comments:{stance,text}（CP粉/作品粉/唯粉/路人等），只讨论已发生的公开事实，不编造私下见面/官方声明/黑料；讨论猜测不是下轮新事件依据。没有更新不覆盖旧状态，缺失项留空而非写无/暂无。
示例：cpUpdates:[{partner:'女艺人甲',type:'create',evidence:'观众为他们成立了CP应援群。',title:'合作作品带来第一批CP粉',delta:600,estimated:true,heat:28,cohesion:35,controversy:5,status:'初生',topics:[{title:'这对搭档的合作表现',comments:[{stance:'CP粉',text:'这次合作确实让人想继续关注。'},{stance:'作品粉',text:'先看作品本身。'},{stance:'路人',text:'观众喜欢搭档不代表两人已经恋爱。'}]}]}]。`;
export function cpPayload(sj) { return sj?.cpUpdates ?? sj?.CP动态 ?? sj?.CP更新; }
function cpDiffs(before, after, path = ['protagonist','cpState']) {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const object = v => v && typeof v === 'object';
  if (object(before) && object(after) && Array.isArray(before) === Array.isArray(after) && (!Array.isArray(after) || after.length >= before.length)) {
    return Object.keys(after).flatMap(k => cpDiffs(before[k], after[k], path.concat(Array.isArray(after) ? Number(k) : k)));
  }
  return [{path,from:clone(before),to:clone(after),by:'cp',_had:before!==undefined,_prev:before===undefined?null:clone(before)}];
}
export function applyCPUpdates(s, payload, { body = '', facts = [], cacheIds = [], seq = 0, textVersion = '', date = '', enabledAtStart = true } = {}) {
  const issues = [], diffs = [];
  if (!enabledAtStart || !cpEnabled(s)) return { diffs, issues };
  if (payload == null) { if (facts.length && list(s.protagonist.cpState?.pairs).some(p=>facts.some(f=>f.partnerId===p.partnerId&&!list(s.protagonist.cpState?.seenSources).includes(f.id)))) issues.push({step:'CP',why:'有新的微博互动，本轮结算未提交CP结果，已保留等待后续结算'}); return { diffs, issues }; }
  const updates = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : payload.partner || payload.搭档 ? [payload] : null;
  if (!updates) return { diffs, issues:[{step:'CP',why:'CP结果格式不可识别，旧数据保留'}] };
  const before = clone(s.protagonist.cpState), next = clone(before || { version:1,pairs:[],seenSources:[],weiboBaseline:false });
  next.pairs = list(next.pairs); next.seenSources=list(next.seenSources); const used=new Set(next.seenSources), fm=new Map(facts.map(f=>[f.id,f]));
  const warn = why => issues.push({step:'CP',why});
  for (const u of updates) {
    if (!u || typeof u !== 'object') continue;
    const actor=resolveActor(s,u.partnerId||u.partner||u.搭档||u.姓名); if (!actor || actor.id==='player' || !text(actor.actor.性别).includes('女')) { warn('CP搭档无法唯一对应女性人物，该项未更新'); continue; }
    let p=next.pairs.find(p=>p.partnerId===actor.id || (String(p.partnerId).startsWith('name:') && [actor.actor.姓名,...list(actor.actor.曾用名),...list(actor.actor.aliases)].map(cleanName).includes(cleanName(p.partner)))); const create=!p;
    const evidence=text(u.evidence||u.依据||u.正文依据), title=text(u.title||u.活动||u.事件);
    const refs=list(u.sourceIds||u.微博来源).map(text), unique=[...new Set(refs)];
    if(unique.some(id=>!fm.has(id)||fm.get(id).partnerId!==actor.id)){warn('CP微博来源无法核对，该项未更新');continue;}
    const sourceFacts=unique.map(id=>fm.get(id));
    const storyValid=!!evidence&&text(body).includes(evidence);
    if(!storyValid&&!sourceFacts.length){warn('CP事件没有本轮正文或实际微博依据，该项未更新');continue;}
    if(!create && !sourceFacts.length && (!storyValid || !text(body).includes(text(actor.actor.姓名)) || !/CP|cp|西皮|嗑|磕|粉|同台|同框|合照|合作|路演|直播|采访|微博|澄清|避嫌|退坑|应援|节目|播出|公开|出席|首映|红毯|颁奖|典礼|发布会|签售|见面会/.test(evidence) || /私下|无人知晓|尚未公开|没有公开|未公开/.test(evidence))){warn('该CP没有新的公开活动依据，人数保留');continue;}
    if(create){ const identity=text(actor.actor.身份); const near=text(body).split(/[。！？\n]/).filter(x=>x.includes(actor.actor.姓名)).join(' '); if(!storyValid||!/(?:CP|cp|西皮|嗑|磕|应援群|超话|CP党|粉丝群|粉丝.{0,40}(?:两人|一对|一起)|(?:两人|一对|搭档).{0,40}(?:粉|党|应援))/.test(evidence)||/(?:没有|尚未|并未|不曾|计划|打算|如果|假如|将会|可能|准备|不会|尚无|不要).{0,8}(?:成立|形成|建立|CP党|CP粉|应援群)/.test(evidence)||!text(body).includes(text(actor.actor.姓名))||!(actor.actor.是否艺人===true||/演员|艺人|歌手|女星|模特|偶像|音乐剧|表演|戏剧|练习生|舞者|乐手/.test(identity+' '+near))){warn('正文尚未确认该CP粉群体成立或搭档演艺身份，该项未建档');continue;} }
    const allUsed=unique.length>0&&unique.every(id=>used.has(id)); if(allUsed)continue;
    // 正文证据若直接引用已知微博互动，也绑定其来源，避免换成正文来源再加一次。
    if(!unique.length&&p){ for(const f of facts)if(f.partnerId===p.partnerId&&evidence&&(evidence.includes(f.text)||f.text.includes(evidence)||(/微博|点赞|取消点赞|转发|回复|评论/.test(evidence)&&evidence.includes(f.type))))unique.push(f.id); if(unique.length&&unique.every(id=>used.has(id)))continue; }
    const eventKey=text(u.eventId||u.事件ID), oldEvent=p&&eventKey?list(p.events).find(e=>e.id===eventKey):null;
    if(eventKey&&!oldEvent){warn('CP活动ID不存在，该项未更新');continue;}
    const key=unique.length?'sources:'+unique.slice().sort().join('|'):'story:'+hash([actor.id,evidence]);
    if(list(p?.events).some(e=>list(e.keys).includes(key)))continue;
    let count=cpNumber(u.count??u.人数??u.总人数), delta=cpNumber(u.delta??u.增减), percent=cpNumber(text(u.percent??u.百分比).replace(/%$/,''));
    if(create){p={id:'cp_'+hash(['player',actor.id]),partnerId:actor.id,partner:actor.actor.姓名,name:text(u.name||u.CP名)||s.protagonist.姓名+' × '+actor.actor.姓名,count:0,countKnown:false,heat:0,cohesion:0,controversy:0,status:'初生',origin:text(u.origin||u.来源),createdSeq:seq,createdAt:date,peak:0,events:[]};next.pairs.push(p);}
    p.partner=actor.actor.姓名; p.partnerId=actor.id; if(text(u.name||u.CP名))p.name=text(u.name||u.CP名);
    const previous=p.count, changed=count!=null||delta!=null||percent!=null;
    if(changed){ const n=count!=null?count:delta!=null?previous+delta:previous*(1+percent/100); p.count=Math.max(0,Math.round(n));p.countKnown=true;p.countSource=u.estimated===true||u.估算===true?'estimated':'stated'; }
    for(const k of ['heat','cohesion','controversy']){const n=cpNumber(u[k]??u[{heat:'热度',cohesion:'凝聚力',controversy:'争议度'}[k]]);if(n!=null)p[k]=Math.max(0,Math.min(100,n));}
    if(text(u.status||u.状态))p.status=text(u.status||u.状态); if(text(u.origin||u.来源))p.origin=text(u.origin||u.来源);p.peak=Math.max(p.peak||0,p.count);p.updatedSeq=seq;p.lastDelta=p.count-previous;
    let topics=list(u.topics||u.话题).map((t,i)=>({id:'cpt_'+hash([p.id,key,i]),title:text(t.title||t.标题),comments:list(t.comments||t.讨论).map(c=>typeof c==='string'?{stance:'网友',text:c}:{stance:text(c.stance||c.立场)||'网友',text:text(c.text||c.内容)}).filter(c=>c.text)})).filter(t=>t.title&&t.comments.length);
    if(!topics.length){topics=[{id:'cpt_'+hash([p.id,key]),title:p.name+' · '+(title||'公开动态'),comments:[{stance:'CP粉',text:'关注这次公开互动，后续仍看正式消息。'},{stance:'作品粉',text:'合作表现本身也值得讨论。'},{stance:'路人',text:'公开互动不能直接证明私人关系。'}]}];warn('CP话题未完整返回，已用公开事实讨论兜底，未额外请求模型');}
    const event={id:oldEvent?.id||'cpe_'+hash([p.id,key]),title:title||'公开动态',evidence,source:unique.length?'weibo':'story',sourceIds:unique,seq,textVersion,date,delta:p.count-previous,count:p.count,estimated:p.countSource==='estimated',topics,keys:[key]};
    const point = {id:'cpp_'+hash([p.id,key]),title:event.title,date,seq,textVersion,delta:event.delta,count:p.count};
    if(oldEvent){oldEvent.changes=list(oldEvent.changes).length?oldEvent.changes:[{id:oldEvent.id,title:oldEvent.title,date:oldEvent.date,seq:oldEvent.seq,textVersion:oldEvent.textVersion,delta:oldEvent.delta,count:oldEvent.count}]; oldEvent.changes.push(point);oldEvent.delta+=event.delta;oldEvent.count=event.count;oldEvent.seq=seq;oldEvent.textVersion=textVersion;oldEvent.topics.push(...topics);oldEvent.sourceIds=[...new Set([...oldEvent.sourceIds,...unique])];oldEvent.keys.push(key);oldEvent.date=date;oldEvent.evidence=evidence||oldEvent.evidence;}else {event.changes=[point];p.events.push(event);}
    for(const id of unique)used.add(id);
  }
  if(next.pairs.length&&!next.weiboBaseline){next.weiboBaseline=true;for(const id of cacheIds)used.add(id);}
  next.seenSources=[...used];
  if(JSON.stringify(next)!==JSON.stringify(before)&&next.pairs.length){diffs.push(...cpDiffs(before,next));s.protagonist.cpState=next;}
  for(const f of facts)if(!used.has(f.id)&&next.pairs.some(p=>p.partnerId===f.partnerId))warn('微博互动尚未得到CP结算：'+f.type+'，已保留等待后续结算');
  return {diffs,issues};
}
