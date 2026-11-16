import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'client.js'), source = fs.readFileSync(target, 'utf8');
const normalize = s => s.replace(/\r\n/g, '\n');
const begin = '      // RELATIONS_PANEL_BEGIN', end = '      // RELATIONS_PANEL_END';
const a = source.indexOf(begin), b = source.indexOf(end);
if (a < 0 || b < a || source.indexOf(begin, a + 1) >= 0) throw Error('关系网构建标记缺失或不唯一');
const core = normalize(fs.readFileSync(path.join(root, 'lib/relations-core.mjs'), 'utf8')).replace(/^export /gm, '');
const client = normalize(fs.readFileSync(path.join(root, 'lib/relations-client.js'), 'utf8')).replace(/^export /gm, '');
const block = begin + '\n      const RelationsPanel = (() => {\n' + core + '\n' + client + '\nreturn createRelationsPanel(React, { relationSnapshot, relationNetwork, relationLayout, relationTurns, relationChangedTurns });\n})();\n';
if (process.argv.includes('--check')) {
  if (normalize(source.slice(a, b)) !== block) throw Error('关系网内嵌源码不一致，请运行 node scripts/build-relations-client.mjs');
  console.log('关系网工厂与内嵌源码一致');
} else { fs.writeFileSync(target, source.slice(0, a) + block + source.slice(b)); console.log('关系网已同步到客户端'); }
