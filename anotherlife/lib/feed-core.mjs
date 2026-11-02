import { isPhoneContact } from './phone-core.mjs';
export const feedPlatform = (p) => p === '说说' ? 'qq' : 'wechat';
const nameOf = (n) => String(n?.姓名 || n?.名字 || '').trim();
export function feedPeople(state, platform) {
  const p = feedPlatform(platform);
  return (state.npcs || []).filter((n) => isPhoneContact(state, n, p));
}
export function canReadFeed(state, platform, author) {
  const name = String(author || '').trim();
  if (!name) return false;
  if (name === String(state.protagonist?.姓名 || '')) return true;
  return !!name && feedPeople(state, platform).some((n) => nameOf(n) === name);
}
export function assertFeedAccess(state, platform, post) {
  if (!post || !canReadFeed(state, platform, post.作者)) throw new Error('这条动态不可见');
}
export function commentRecords(post) {
  const seen = new Set();
  return (Array.isArray(post.评论) ? post.评论 : []).map((c, i) => {
    let id = String(c.id || post.id + ':legacy:' + i);
    if (seen.has(id)) id = String(post.id) + ':legacy:' + i;
    seen.add(id);
    return { ...c, id };
  });
}
export function visibleFeed(state, platform, post) {
  assertFeedAccess(state, platform, post);
  const me = String(state.protagonist?.姓名 || '');
  const allowed = (name) => name === me || canReadFeed(state, platform, name);
  return { ...post,
    赞: (Array.isArray(post.赞) ? post.赞 : []).filter((name) => allowed(String(name))),
    评论: commentRecords(post).filter((c) => allowed(String(c.谁 || '')) && (!c.回复谁 || allowed(String(c.回复谁)))),
  };
}
export function replyTarget(state, platform, post, id) {
  assertFeedAccess(state, platform, post);
  if (!id) return { name: String(post.作者), comment: null };
  const c = visibleFeed(state, platform, post).评论.find((c) => String(c.id) === String(id));
  if (!c) throw new Error('要回复的评论已不可见');
  return { name: String(c.谁 || ''), comment: c };
}
export function appendFeedComment(post, { id, actionId, who, text, parentId = '', target = '' }) {
  post.评论 = commentRecords(post);
  const existing = post.评论.find((c) => c.id === id);
  if (existing) return existing;
  const value = { id, actionId: String(actionId || ''), 谁: who, 内容: text, 回复评论id: String(parentId || ''), 回复谁: String(target || '') };
  post.评论.push(value);
  return value;
}
export function findFeedAction(post, actionId) {
  if (!actionId) return null;
  return commentRecords(post).find((c) => c.actionId === actionId && !c.自动回复) || null;
}
export function normalizeGeneratedFeed(state, platform, rows, { now, round, nextId }) {
  const me = String(state.protagonist?.姓名 || '');
  const allowed = new Set(feedPeople(state, platform).map(nameOf));
  return (Array.isArray(rows) ? rows : []).slice(0, 4).flatMap((raw) => {
    const author = String(raw?.作者 || '').trim(), text = String(raw?.正文 || '').trim();
    if (!allowed.has(author) || !text || author === me) return [];
    const id = nextId();
    const post = { id, 作者: author, 时间: now, 轮次: round, 正文: text.slice(0, 300), 图片: String(raw.图片 || '').trim() ? [{ 相册id: '', 库id: '', 描述: String(raw.图片).trim().slice(0, 60) }] : [],
      赞: (Array.isArray(raw.赞) ? raw.赞 : []).map(String).filter((n) => allowed.has(n) && n !== me).slice(0, 5),
      评论: (Array.isArray(raw.评论) ? raw.评论 : []).filter((c) => allowed.has(String(c?.谁 || '')) && String(c?.内容 || '').trim()).slice(0, 4).map((c, i) => ({ id: id + ':c:' + i, 谁: String(c.谁), 内容: String(c.内容).trim().slice(0, 100) })),
    };
    return [post];
  });
}
