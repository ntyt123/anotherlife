export const NEWS_MIN_EACH=5;
const RUMOR_META=/(未经(?:独立)?核实|未经证实|尚未证实|有待证实|莫衷一是|小道消息|坊间传闻|据传|有人称|据说)/gu;
// 只去掉机制免责，不删否认、未回应、证据不足等会影响消息含义的口径。
const clauseMeta=c=>/此(?:消息|说法|传闻)不构成(?:合同|排期|收入)/u.test(c);
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
export const GOSSIP_RULES=[
 '【传闻专用范围】传闻是娱乐圈全局八卦，采用玩家可见的全知视角，不是行业简报或主角任务板。不依据主角身份、所在地、人脉、近期剧情、出场名单或经营单位选题，不围着主角制造机遇；旧模板若有此类要求，本次传闻不采用。',
 '必须写对应年代真实存在的艺人、导演、制片人、经纪人等真实姓名，不能编造人物或用某演员、某男性、圈内人士代替姓名。全局取材，不限于已登场人物，也不把主角本人自动编成新闻人物。',
 '重点是人物和关系的瓜：感情分合与避嫌、搭档疏远或关系变化、合作矛盾、选角竞争、番位争议、资源倾斜、解约拉扯、团队分歧，以及台前回应与已披露幕后进展的反差。事业消息也要落到具体人和关系，不通篇罗列开机、上映、日程公告，不靠空泛行业评论凑数。',
 '以输入的游戏当前日期为时间锚点，不使用电脑今天。尽量选当天或近日的真实动向；较早事件仅在当前确有新进展时续写。可用后来可靠披露的资料还原当时已发生但未公开的情况，不能把未来才发生的结果搬到当前。',
 '人物行为要贴合本人当年的年龄、身份、资历、处事方式、职业处境与已知关系，不把后来成名后的地位套回新人时期，不统一套野心家、恋爱脑或阴谋家模板，不为戏剧性制造OOC。',
 '全知视角不等于编造内幕：核心事件、重大选择与人物关系尽量依据可确认的资料；细节只作克制衔接，不杜撰私下对话或确定内心动机。有记录的未证实传闻可写当时的议论、回应或否认，不能升级成实锤；不凭空制造真人的违法、性丑闻或其他重大负面指控。不知道就换有依据的消息，不编人名黑料补位。',
 '传闻每条约40至100字，写清具体姓名、具体事件、当前进展与关系张力，有吃瓜感但不煽造假料；不另写标题，不反复附机制免责。不同条目尽量覆盖不同人物和事件。',
 '传闻仅供玩家阅读与自主决策，不代表主角知情，不生成行动指令、系统任务、主角反应或正文续写，也不要求创建角色、修改关系或结算状态。'
].join('\n');
export const NEWS_RULES=[
 '【世界动态】每次要传闻和大事各至少 5 条，两类都要有。每条只交 kind、time、content 三个字段：kind 为 rumor 或大事 event；time 用游戏中的实际日期或月份；content 紧接时间成句。大事一句话20至60字，传闻按下方专用规则。',
 '不写来源、地区、确认状态等独立展示字段，不写合同、排期或收入的机制免责；必要地点可自然写入事件正文。',
 '传闻就是传闻：有据的幕后进展与未证实的议论要区分，不把尚未确认的关系或指控写成确定事实；未回应、否认等实质口径必须保留。',
 '大事写已经发生、可以确认的公开事件（政策发布、节日、行业变动、公开报道的新闻），仍只写时间和内容，不加评价。不要把传闻写成大事，两类内容不互相重复。',
 GOSSIP_RULES
].join('\n');
export function newsGenerationRules(template=NEWS_RULES){return template===NEWS_RULES?NEWS_RULES:String(template)+'\n'+GOSSIP_RULES;}
// 新闻选题只读世界时间，不读主角、剧情、经营资料或旧传闻。
export function newsRequestContext(state,turn){const world=state?.world||{};return{world:Object.fromEntries(['世界观类型','时代与年份','当前日期时间'].filter(k=>world[k]!=null).map(k=>[k,world[k]])),turn,tasks:{news:true,units:[]}};}
export function cleanNewsItems(state){const items=state?.simulation?.news?.items;if(!Array.isArray(items))return state;for(const item of items)if(item&&typeof item==='object'&&typeof item.content==='string'&&item.content.trim())item.content=cleanNewsContent(item.content).trim();return state;}
