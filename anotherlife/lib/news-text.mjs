export const NEWS_MIN_EACH=5;
const RUMOR_META=/(未经(?:独立)?核实|未经证实|尚未证实|有待证实|莫衷一是|小道消息|坊间传闻|据传|有人称|据说)/gu;
const clauseMeta=c=>/(未经(?:独立)?核实|未经证实|尚未证实|有待证实|莫衷一是)/u.test(c)||/此(?:消息|说法|传闻)不构成/u.test(c)||/(没有|并无|无)(?:明确|直接)?证据/u.test(c);
export function cleanNewsContent(value){
 if(typeof value!=='string')return value;
 const parts=value.split(/(?<=[。！？；\n])/u);
 const kept=[];
 for(const sentence of parts){
  const clauses=sentence.split(/(?<=[，,])/u).filter(Boolean);
  const remain=clauses.filter(c=>!clauseMeta(c));
  if(!remain.length)continue;
  kept.push(remain.join(''));
 }
 return kept.join('').replace(/[，,](?=[。！？；]|$)/gu,'').replace(/[，,]{2,}/gu,'，').trim();
}
export const NEWS_RULES=[
 '【世界动态】每次要传闻和大事各至少 5 条，两类都要有。每条只交 kind、time、content 三个字段：kind 为 rumor 或大事 event；time 写成「2024年10月1日」或「2024年10月」；content 只写发生了什么，一句话，20~60字，紧接在时间后面。',
 '输出形如「2024年10月1日，国庆假期正式开始。」「2024年10月，爆料某男性出轨。」——把时间和内容连成一句通顺的话，不另写标题。',
 '传闻就是传闻：只写传闻说了什么，不写「未经核实的说法」「尚未证实」「据说」「坊间传闻」这类重复限定，也不写来源、地区、确认状态或「不构成合同、排期或收入」的免责句；分类标签已经表明它是传闻。传闻可以有具体人名与数字，但不能当作已发生事实。',
 '大事写已经发生、可以确认的公开事件（政策发布、节日、行业变动、公开报道的新闻），同样只写时间和内容，不写来源与地点，不加评价。不要为了凑数把传闻写成大事，也不要两类内容互相重复。',
].join('\n');

export function cleanNewsItems(state){const items=state?.simulation?.news?.items;if(!Array.isArray(items))return state;for(const item of items)if(item&&typeof item==='object'&&typeof item.content==='string'&&item.content.trim())item.content=cleanNewsContent(item.content).trim();return state;}
