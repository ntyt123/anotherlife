import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'client.js');
const normalize = text => text.replace(/\r\n/g, '\n');
const source = fs.readFileSync(target, 'utf8');
const begin = '// INTIMACY_PANEL_BEGIN', end = '// INTIMACY_PANEL_END';
const a = source.indexOf(begin), b = source.indexOf(end, a);
if (a < 0 || b < 0) throw Error('缺少性经验界面构建标记');
const core = normalize(fs.readFileSync(path.join(root, 'lib/intimacy-core.mjs'), 'utf8')).replace(/^export /gm, '');
const client = normalize(fs.readFileSync(path.join(root, 'lib/intimacy-client.js'), 'utf8')).replace(/^export /gm, '');
const block = begin + '\n      const IntimacyPanel = (() => {\n' + core + '\n' + client + '\nreturn createIntimacyPanel(React, { intimacyEnabled, intimacySummary });\n})();\n      ';
if (process.argv.includes('--check')) {
  if (normalize(source.slice(a, b)) !== block) throw Error('性经验内嵌界面与源码不一致，请运行node scripts/build-intimacy-client.mjs');
  console.log('性经验界面工厂与内嵌源码一致');
} else { fs.writeFileSync(target, source.slice(0, a) + block + source.slice(b)); console.log('性经验界面已同步到客户端'); }
