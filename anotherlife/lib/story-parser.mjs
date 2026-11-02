export const ROUTE_NAMES = ['稳健路线', '激进路线', '创新路线', '视角切换', '双线叙事', '镜头转换', '时间跳转', 'NSFW-A'];

export function stripNoteTags(text) {
  return String(text == null ? '' : text)
    .replace(/<\s*\/?\s*(?:导演笔记|think|思考过程|思考)\s*>/gi, '')
    .replace(/^\s*```[a-zA-Z]*\s*\n/, '').replace(/\n\s*```\s*$/, '').trim();
}
function optionParts(line) {
  let text = String(line == null ? '' : line).replace(/[\u200b\ufeff]/g, '').trim();
  // 星号列表必须有空白；不能把 **[路线]** 的第一颗星当成列表符号。
  for (let i = 0; i < 2; i++) text = text.replace(/^(?:\d{1,2}\s*[.．、)）]\s*|[①②③④⑤⑥⑦⑧⑨⑩]\s*|[-•]\s*|\*\s+)/, '').trim();
  if ((text.startsWith('**') && text.endsWith('**')) || (text.startsWith('__') && text.endsWith('__'))) text = text.slice(2, -2).trim();
  const routes = ROUTE_NAMES.join('|');
  const bracket = text.match(new RegExp('^(?:\\*\\*|__)?[\\[【]\\s*(' + routes + ')\\s*[\\]】](?:\\*\\*|__)?\\s*[:：-]?\\s*(.*)$', 'i'));
  const bare = bracket || text.match(new RegExp('^(?:\\*\\*|__)?(' + routes + ')(?:\\*\\*|__)?\\s*[:：]\\s*(.*)$', 'i'));
  if (!bare) return null;
  return { route: ROUTE_NAMES.find((r) => r.toLowerCase() === bare[1].toLowerCase()), text: bare[2].trim().replace(/^\*\*\s*/, '') };
}
export function optionLineText(line) {
  const part = optionParts(line);
  if (part) return '[' + part.route + '] ' + part.text;
  return String(line == null ? '' : line).trim().replace(/^\d+\s*[.、)）]\s*/, '').replace(/^(?:[-•]\s*|\*\s+)/, '').trim();
}
export function isOptionLine(line) {
  const part = optionParts(line);
  return !!(part && part.text);
}
export function collectOptionLines(lines) {
  return (lines || []).filter(isOptionLine).map(optionLineText);
}
export function splitTrailingOptions(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let end = lines.length - 1;
  while (end >= 0 && !lines[end].trim()) end--;
  let start = end;
  while (start >= 0 && (!lines[start].trim() || isOptionLine(lines[start]))) start--;
  const options = collectOptionLines(lines.slice(start + 1, end + 1));
  if (options.length < 2) return null;
  return { body: lines.slice(0, start + 1).join('\n').trimEnd(), options };
}

// 笔记可以有多组；选项只收合法路线行，不能吞掉随后继续出现的叙事。
export function splitStory(raw) {
  let rest = String(raw == null ? '' : raw).replace(/\r/g, '').trim();
  const notes = [];
  rest = rest.replace(/<\s*(导演笔记|think|思考过程|思考)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/gi, (_, tag, content) => {
    const note = stripNoteTags(content);
    if (note) notes.push(note);
    return '';
  });
  const open = /<\s*(?:导演笔记|think|思考过程|思考)\s*>/gi;
  let match;
  while ((match = open.exec(rest))) {
    const after = rest.slice(match.index + match[0].length);
    const lines = after.split('\n');
    let end = 0;
    let numbered = false;
    while (end < lines.length && (!lines[end].trim() || /^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|^[·•\-*]\s|^\d+[.、)]/.test(lines[end].trim()))) {
      if (lines[end].trim()) numbered = true;
      end++;
    }
    if (!numbered) end = lines.length;
    const note = stripNoteTags(lines.slice(0, end).join('\n'));
    if (note) notes.push(note);
    rest = rest.slice(0, match.index) + lines.slice(end).join('\n');
    open.lastIndex = match.index;
  }
  rest = rest.replace(/<\s*\/\s*(?:导演笔记|think|思考过程|思考)\s*>/gi, '');
  const lines = rest.split('\n');
  // 路线名称单独占一行、正文在下一行的格式也归一化，不吞后面的普通叙事。
  for (let i = 0; i + 1 < lines.length; i++) {
    const part = optionParts(lines[i]);
    if (part && !part.text && lines[i + 1].trim() && !optionParts(lines[i + 1]) && !/^\s*#/.test(lines[i + 1])) {
      lines[i] = '[' + part.route + '] ' + lines[i + 1].trim();
      lines[i + 1] = '';
    }
  }
  const body = [];
  const options = [];
  const heading = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?(?:\[行动选项\]|【行动选项】|(?:行动选项|可选行动)(?=\s*(?:(?:\*\*|__)\s*)?(?:[:：]|$)))(?:\*\*|__)?\s*[:：]?\s*(.*)$/;
  for (let index = 0; index < lines.length; index++) {
    const title = lines[index].match(heading);
    if (!title) { body.push(lines[index]); continue; }
    if (title[1]) {
      if (isOptionLine(title[1])) options.push(optionLineText(title[1]));
      else body.push(title[1]);
    }
    while (index + 1 < lines.length && (!lines[index + 1].trim() || isOptionLine(lines[index + 1]))) {
      const next = lines[++index];
      if (isOptionLine(next)) options.push(optionLineText(next));
    }
  }
  let story = body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const trailing = splitTrailingOptions(story);
  if (trailing) { story = trailing.body; options.push(...trailing.options); }
  return { think: notes.join('\n\n'), body: story, options: [...new Set(options)] };
}
