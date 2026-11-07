import fs from 'node:fs';
const source = new URL('../lib/cp-client.js', import.meta.url), target = new URL('../client.js', import.meta.url);
const begin = '    // CP_PANEL_FACTORY_START', end = '    // CP_PANEL_FACTORY_END';
const factory = fs.readFileSync(source, 'utf8').replace(/^export /, '').trim();
const replacement = begin + '\n' + factory + '\n    const CPPanel = createCPPanel(React);\n' + end;
const client = fs.readFileSync(target, 'utf8'), start = client.indexOf(begin), finish = client.indexOf(end);
if (start < 0 || finish < start) throw new Error('未找到CP面板生成区');
const next = client.slice(0,start) + replacement + client.slice(finish + end.length);
if(process.argv.includes('--check')) { if(next.replace(/\r\n/g,'\n') !== client.replace(/\r\n/g,'\n')) throw new Error('CP面板内嵌源码未同步'); console.log('CP面板工厂与内嵌源码一致'); } else fs.writeFileSync(target,next);
