import { createHash } from 'node:crypto';

const fingerprint = (prefix, values) => prefix + createHash('sha256').update(JSON.stringify(values)).digest('hex').slice(0, 32);
const clean = (value) => String(value || '').replace(/[@＠\s]/g, '').replace(/[Vv]$/, '');

// 老缓存按完整内容补稳定 ID，不能使用列表位置或正文前几十字作身份。
export function normalizeWeiboCache(cache) {
  if (!cache || typeof cache !== 'object') return cache;
  const lists = [cache.时间线, cache.微博].filter(Array.isArray);
  for (const list of lists) for (const post of list) {
    if (!post || typeof post !== 'object') continue;
    if (!post.id) post.id = fingerprint('wp_', [cache.日期 || '', post.作者 || '', post.正文 || '', post.发布时间 || post.时间 || post.分钟前 || '']);
    const occurrences = new Map();
    for (const comment of Array.isArray(post.评论列表) ? post.评论列表 : []) {
      if (!comment || typeof comment !== 'object' || comment.id) continue;
      const signature = JSON.stringify([comment.谁 || '', comment.内容 || '', comment.轮次 ?? '', !!comment.回复]);
      const occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      comment.id = fingerprint('wc_', [post.id, signature, occurrence]);
    }
  }
  return cache;
}

export function matchWeiboPost(cache, action) {
  const posts = cache && Array.isArray(cache.时间线) ? cache.时间线 : [];
  const id = String(action && action.postId || '');
  if (id) return posts.find((post) => post && String(post.id || '') === id) || null;
  const author = clean(action && (action.微博作者 || action.作者));
  const body = clean(action && (action.微博正文 || action.正文));
  if (!author || !body) return null;
  const matches = posts.filter((post) => {
    if (!post || clean(post.作者) !== author) return false;
    const full = clean(post.正文);
    return full === body || (body.length >= 8 && full.startsWith(body));
  });
  // 有歧义就不猜，不能悄悄把回复挂到另一条微博。
  return matches.length === 1 ? matches[0] : null;
}

export function mergeWeiboActions(...lists) {
  const result = [];
  const seen = new Set();
  for (const list of lists) for (const action of Array.isArray(list) ? list : []) {
    if (!action || typeof action !== 'object') continue;
    const id = String(action.id || action.actionId || fingerprint('wa_legacy_', [action.微博作者, action.微博正文, action.回谁, action.评论, action.轮次, action.时]));
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ ...action, id });
  }
  return result;
}

export function findReplyAction(reply, actions) {
  const list = Array.isArray(actions) ? actions : [];
  const id = String(reply && (reply.动作ID || reply.actionId || reply.动作编号) || '');
  if (id) {
    const exact = list.find((action) => action.id === id);
    if (exact) return exact;
  }
  const index = Number(reply && (reply.第几条 || reply.序号));
  if (Number.isSafeInteger(index) && index > 0 && index <= list.length) return list[index - 1];
  if (list.length === 1) return list[0];
  const byAuthor = list.filter((action) => clean(action.微博作者) === clean(reply && reply.谁));
  return byAuthor.length === 1 ? byAuthor[0] : null;
}
