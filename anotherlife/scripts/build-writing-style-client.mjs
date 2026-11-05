import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, 'client.js');
const source = fs.readFileSync(target, 'utf8');
const begin = '// WRITING_STYLE_VIEWS_BEGIN', end = '// WRITING_STYLE_VIEWS_END';
if (source.split(begin).length !== 2 || source.split(end).length !== 2) throw new Error('文风界面构建标记缺失或重复');
const start = source.indexOf(begin), finish = source.indexOf(end, start);
const normalize = s => s.replace(/\r\n/g, '\n');
const factory = normalize(fs.readFileSync(path.join(root, 'lib/writing-style-client.js'), 'utf8')).replace('export function createWritingStyleViews', 'function createWritingStyleViews');
const block = begin + '\n' + factory + '\n      const { WritingStylePanel } = createWritingStyleViews(React);\n      ';
if (process.argv.includes('--check')) {
  if (normalize(source.slice(start, finish)) !== block) throw new Error('文风界面与工厂源码不一致，请运行 npm run build:writing-style');
  console.log('文风界面工厂与内嵌源码一致');
} else {
  const next = source.slice(0, start) + block + source.slice(finish);
  if (next !== source) fs.writeFileSync(target, next, 'utf8');
  console.log('文风界面已同步到原生客户端');
}
