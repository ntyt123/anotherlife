const META_TAIL=/(留空|未提及|未提供|未说明|未设定|待补充|待补齐|尚未确定|暂无|不详)$/u;
const DESCRIPTIVE=['说明','简介','描述','来源','备注','详情'];
export function stripPlaceholderNotes(value){
 if(typeof value!=='string')return value;
 let changed=false;
 let out=value.replace(/[（(][^（()）]{0,24}(?:留空|未提及|未提供|未说明|未设定|待补充|待补齐|尚未确定|暂无|不详)[^（()）]{0,12}[）)]/gu,()=>{changed=true;return'';});
 const parts=out.split(/(?<=[。！？；\n])/u);
 const kept=[];
 for(const sentence of parts){
  const clauses=sentence.split(/(?<=[，,])/u).filter(Boolean);
  const remain=[];
  for(const clause of clauses){
   const body=clause.replace(/[，,。！？；\s]/gu,'');
   if(body.length<=30&&META_TAIL.test(body)){changed=true;continue;}
   remain.push(clause);
  }
  if(!remain.length){changed=true;continue;}
  kept.push(remain.join(''));
 }
 out=kept.join('').replace(/[，,](?=[。！？；]|$)/gu,'').replace(/[，,]{2,}/gu,'，').replace(/\n{3,}/gu,'\n\n').trim();
 out=out.replace(/[；;，,]$/u,'。');
 if(changed&&out&&!/[。！？；!?]$/u.test(out))out+='。';
 return changed?out:value;
}
export function cleanSkillAndItemNotes(state){
 const seen=new Set();
 function fix(record){if(!record||typeof record!=='object'||Array.isArray(record)||seen.has(record))return;seen.add(record);for(const k of DESCRIPTIVE)if(typeof record[k]==='string'&&record[k].trim())record[k]=stripPlaceholderNotes(record[k]).trim();}
 function visitList(list){for(const item of Array.isArray(list)?list:[]){if(!item||typeof item!=='object'||Array.isArray(item))continue;fix(item);for(const k of ['属性提升','属性'])if(item[k]&&typeof item[k]==='object')fix(item[k]);}}
 const si=state?.skills_items;
 if(si&&typeof si==='object'){visitList(si.技能);visitList(si.背包);}
 visitList(state?.protagonist?.物品);
 if(state?.simulation?.management)for(const u of Array.isArray(state.simulation.management.units)?state.simulation.management.units:[]){fix(u);if(u?.businessProfile&&typeof u.businessProfile==='object')fix(u.businessProfile);}
 return state;
}
export const PLACEHOLDER_RULE='未知的字段直接不写或留空字符串，不要把「留空」「未提及」「未提供」「待补充」「暂无」这些词写进说明、简介、来源、备注等任何内容里；技能说明只写已经知道的效果与用法，不知道的作用范围、持续时间、限制就不提。';

const LIST_KEYS=[['隐患',['事情','内容','名称'],['知情者']],['债务',['对象','名称'],['内容']],['凭证',['名称','名字'],[]],['私人关系',['对象','姓名','名字'],[]],['物品',['名字','名称'],[]],['技能',['名字','名称'],[]],['住所',['名称','名字'],[]],['交通',['名称','名字'],[]],['事业',['名称','名字'],[]]];
function listKeyOf(item,keys){for(const k of keys){const v=item&&typeof item==='object'?item[k]:undefined;if(v!=null&&String(v).trim())return String(v).trim();}return '';}
export function dedupeStoryLists(state){
 if(!state||typeof state!=='object')return 0;
 let changed=0;
 for(const [field,primary,secondary] of LIST_KEYS){
  const holder=state.protagonist;
  if(!holder||!Array.isArray(holder[field]))continue;
  const seen=new Map(),out=[];
  for(const item of holder[field]){
   const key=listKeyOf(item,primary)+'\u0000'+listKeyOf(item,secondary);
   if(!key.trim()||key==='\u0000'){out.push(item);continue;}
   const hit=seen.get(key);
   if(!hit){seen.set(key,item);out.push(item);continue;}
   changed++;
   for(const [k,v] of Object.entries(item))if((hit[k]==null||hit[k]==='')&&v!=null&&v!=='')hit[k]=v;
  }
  holder[field]=out;
 }
 return changed;
}
