// 剧情由模型判断；此模块只统一传参，不替换模型，也不写死思考档。
export const REASONING_SLOTS = ['body', 'settle', 'retrieve', 'summary', 'weibo', 'phone', 'assistant', 'misc', 'writingStyle'];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const effort = value => typeof value === 'string' && value.trim() !== '__inherit__' ? value.trim() : '';
export function reasoningFor(state, slot = 'body') {
  const config = state?.config || {}, values = config.reasoning || {};
  const key = slot === 'story' ? 'body' : slot;
  if (own(values, key) && values[key] !== '__inherit__') return effort(values[key]) || undefined;
  return effort(values.default) || effort(values.body) || undefined;
}
export function normalizeReasoning(input, previous = {}) {
  const out = {};
  for (const key of ['default', ...REASONING_SLOTS]) {
    if (own(input, key)) out[key] = effort(input[key]);
    else if (own(previous, key)) out[key] = effort(previous[key]);
  }
  return out;
}
export function modelRequestOptions(state, slot, options = {}) {
  if (own(options, 'reasoningEffort')) return { ...options };
  return { ...options, reasoningEffort: reasoningFor(state, slot) };
}
