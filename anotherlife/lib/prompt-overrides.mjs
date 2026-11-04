export const PROMPT_FILE_NAME='simulator-prompts.json';
const DEFINITIONS=[
 {key:'writer',label:'正文写作要求',note:'视角、去神化、节奏、身体戏写法'},
 {key:'anti',label:'反模式清单',note:'结尾替他做决定、情绪一步到位、全知、形容词堆叠等'},
 {key:'output',label:'输出格式',note:'导演笔记模板、正文与行动选项的提交方式'},
 {key:'world',label:'世界运转',note:'其他人有自己的事，不围着他转'},
 {key:'appearance',label:'外貌规范',note:'正文与解析用的外貌规则'},
 {key:'npcProfile',label:'人物档案规范',note:'表性格、里性格、背景'},
 {key:'wardrobe',label:'衣着规范',note:'游玩中的普通衣着维护'},
 {key:'creationWardrobe',label:'开局衣着规范',note:'开局补齐八槽普通衣物'},
 {key:'worldCreation',label:'世界解析规范',note:'世界观与玩法解析'},
 {key:'news',label:'世界动态规范',note:'传闻与大事各至少五条'},
 {key:'simulation',label:'通用结算规范',note:'经营、系统、生涯与技能'},
 {key:'phone',label:'手机连续性规范',note:'对话与朋友圈带入剧情'},
 {key:'initialData',label:'开局资料规范',note:'主角字段与资产初值'},
 {key:'secrets',label:'私密字段规范',note:'性癖、敏感点、底线、经验的生成与更新'},
 {key:'secretsRefresh',label:'私密补录规范',note:'角色详情点刷新时的补录提示'},
];
let storeDir='';
let cache={};
let defaults={};
let io={read:async()=>'',write:async()=>{}};
export function initPromptStore(dir,handler){
 storeDir=String(dir||'').replace(/\\/g,'/').replace(/\/?$/,'/');
 if(handler){io={read:handler.read||io.read,write:handler.write||io.write};}
 cache={};
}
export function promptFilePath(){return storeDir+PROMPT_FILE_NAME;}
export async function loadPrompts(){
 try{
   const raw=await io.read(promptFilePath());
   const parsed=typeof raw==='string'?(raw?JSON.parse(raw):{}):(raw||{});
   cache=parsed&&typeof parsed==='object'&&parsed.prompts&&typeof parsed.prompts==='object'?parsed.prompts:{};
 }catch{cache={};}
 return cache;
}
export function registerPromptDefaults(map){for(const [k,v] of Object.entries(map||{}))if(typeof v==='string'&&v)defaults[k]=v;}
export function promptOverride(key){const v=cache[key];return typeof v==='string'&&v.trim()?v:'';}
export function promptText(key,fallback){return promptOverride(key)||fallback;}
export function promptBlock(key,lines){const hit=promptOverride(key);return hit?hit.split('\n'):lines;}
export const BLOCK_TITLES={output:'【输出格式】',anti:'【反模式清单】',world:'【世界怎么运转】',writer:'【写作要求】'};
const renderedBlocks={};
function blockKeyOf(title){for(const [key,prefix] of Object.entries(BLOCK_TITLES))if(title.startsWith(prefix))return key;return '';}
export function applyBlockOverrides(text){
 const lines=String(text||'').split('\n'),sections=[];let current=-1,prefixEnd=lines.length;
 for(const line of lines){
   const t=line.trim();
   if(t.startsWith('【')){if(current<0)prefixEnd=lines.indexOf(line);sections.push({title:t,lines:[line]});current++;}
   else if(current>=0)sections[current].lines.push(line);
 }
 const prefix=prefixEnd>0?lines.slice(0,prefixEnd):[];
 const rebuilt=sections.map(section=>{
   const key=blockKeyOf(section.title),original=section.lines.join('\n');
   if(key)renderedBlocks[key]=original;
   const hit=key?promptOverride(key):'';
   return hit||original;
 });
 return [...prefix,...rebuilt].join('\n');
}
export function renderedBlock(key){return renderedBlocks[key]||'';}
export function listPrompts(){return DEFINITIONS.map(d=>({...d,default:defaults[d.key]||'',text:typeof cache[d.key]==='string'?cache[d.key]:'',rendered:renderedBlock(d.key),modified:typeof cache[d.key]==='string'&&!!cache[d.key].trim()}));}
async function write(next){await io.write(promptFilePath(),JSON.stringify({version:1,updatedAt:new Date().toISOString(),prompts:next},null,2));cache=next;return next;}
export async function savePrompt(key,text){
 if(!DEFINITIONS.some(d=>d.key===key))throw new Error('未知提示词：'+key);
 if(key==='writer'){const v=String(text==null?'':text);if(!v.includes('{{人称}}')||!v.includes('{{视角人物}}'))throw new Error('正文写作要求必须保留 {{人称}} 与 {{视角人物}} 两个占位符，删掉后无法确定人称');}
 const value=String(text==null?'':text),next={...cache},base=defaults[key]||'';
 if(!value.trim()||value.trim()===String(base).trim())delete next[key];else next[key]=value;
 return write(next);
}
export async function resetPrompt(key){if(!DEFINITIONS.some(d=>d.key===key))throw new Error('未知提示词：'+key);const next={...cache};delete next[key];return write(next);}
