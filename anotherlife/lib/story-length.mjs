const count = value => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};
// 只识别是否涉及篇幅，不提取数字、不解释上下限。原输入仍原样交给模型。
export function hasStoryLengthRequest(input) {
  const text = String(input ?? '').normalize('NFKC');
  return /字数|篇幅|[\d一二两三四五六七八九十百千万]+\s*(?:[kKwW]\s*)?字/u.test(text)
    || /(?:本轮|本次|这轮|这次|正文|输出|回复|生成|回答|写)(?:请|尽量|稍微|再|更|写|不要|别|太|得|的|那么|这么|\s){0,8}(?:长|短|多|少|简短|简要|精简|详细|详写|一句|一段|几句|几段|不限|不限制)/u.test(text)
    || /^\s*(?:简短|简要|精简|详细)(?:一点|一些|点|些)?[。！!]?\s*$/u.test(text)
    || /(?:多写|少写)(?:点|些|一点|一些|[一二两三四五六七八九十几\d]+\s*[句段])/u.test(text);
}
export function storyLengthInstruction(config = {}, input = '') {
  if (hasStoryLengthRequest(input)) return '【正文长度】依据玩家本轮输入自行判断并执行篇幅要求；玩家本轮的明确要求优先，不沿用历史轮次的字数指令。';
  const min = count(config.bodyMinWords), max = count(config.bodyMaxWords);
  if (!min && !max) return '';
  if (min && max) {
    if (min > max) throw new Error('最小字数不能大于最大字数，请调整正文输出设置');
    return `【正文长度】本轮正文输出${min}到${max}字之间。`;
  }
  return min ? `【正文长度】本轮正文按${min}字左右输出。` : `【正文长度】本轮正文不得大于${max}字。`;
}
// 兼容已保存的旧输出模板：不再从占位符注入第二套数字或相反的下限。
// 只处理含该程序占位符的行；作者直接手填的具体数字不删改。
export function neutralizeLegacyWordPlaceholder(value) {
  return String(value ?? '').split('\n').map(line => {
    if (!line.includes('{{字数}}')) return line;
    return line.replace(/(?:参考本轮|每轮|本轮)?\s*(?:(?:不少于|不得少于|不低于|不超过|不得大于|不得超过|至少|最多|大约|约)\s*)?\{\{字数\}\}\s*字(?:的篇幅要求|左右|上下|以上|以下|以内)?/g, '依本轮有效篇幅要求')
      .replaceAll('{{字数}}', '依本轮有效篇幅要求').replace(/[,，]\s*不设截断上限/g, '');
  }).join('\n');
}
