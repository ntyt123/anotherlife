const PLACEHOLDER = /(?:虚拟|虚构|示例|占位)(?:的)?(?:位置|地址|地点)|(?:位置|地址|地点)(?:待定|未知|不详)|(?:未指定|未提供|未明确|未知)(?:实际|具体)?(?:位置|地址|地点)|^(?:无|暂无|未知|未提供|待定|不详|某处|某小区|某某小区)$/;
const FIELDS = new Set(['位置','地址','地点','城市','所在地','所在城市','现居地','居住地','出生地','当前地点','起始地点','开局地点','场景地点']);
export const INITIAL_LOCATION_RULES = '【开局位置】位置字段不得填写“虚拟位置”“虚拟地址”“虚构地点”等占位说明。原文已有地名忠实保留；只知道城市就只填城市，具体街道、小区、门牌未明确则留空，不杜撰真实私人住址。架空世界已有名称的城市和地点照原设定保留，不加“虚拟位置”标签。';
export const INITIAL_LOCATION_PATTERN = /^(?![\s\S]*(?:__MARKER__))[\s\S]*$/.source.replace('__MARKER__', PLACEHOLDER.source);
export function cleanInitialLocation(value) {
  if (typeof value !== 'string') return value;
  const text = value.trim(), match = text.match(PLACEHOLDER);
  if (!match) return value;
  const trim = x => String(x).replace(/^[\s，,；;：:（）()【】\[\]、]+|[\s，,；;：:（）()【】\[\]、]+$/g, '');
  let known = trim(text.slice(0, match.index));
  const tail = text.slice(match.index + match[0].length);
  if (!known && /^\s*[:：]/.test(tail)) known = trim(tail);
  if (/^(?:仅作|仅为|仅供|作为|用于|示例|占位|参考|待定|未知|不详|未定|住宅区|居住区|某处)$/.test(known)) known = '';
  known = known.replace(/^(.+(?:省|市|区|县|镇|乡|村))(?:住宅区|居住区|某小区|某处)$/, '$1');
  return PLACEHOLDER.test(known) ? '' : known;
}
export function sanitizeInitialLocations(value) {
  if (Array.isArray(value)) return value.map(sanitizeInitialLocations);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, FIELDS.has(key) && typeof v === 'string' ? cleanInitialLocation(v) : sanitizeInitialLocations(v)]));
}
export function initialLocationIssues(value, path = []) {
  if (!value || typeof value !== 'object') return [];
  const out = [];
  for (const [key, v] of Object.entries(value)) {
    const next = path.concat(key);
    if (FIELDS.has(key) && typeof v === 'string' && PLACEHOLDER.test(v)) out.push(next.join('.') + '不能使用虚拟位置等占位');
    else if (v && typeof v === 'object') out.push(...initialLocationIssues(v, next));
  }
  return out;
}
