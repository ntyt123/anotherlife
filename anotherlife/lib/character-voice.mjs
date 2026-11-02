export const CHARACTER_VOICE_RULES='【人物资料直述】给玩家看的性格、背景和经历直接描述这个人的相处方式、价值取向与生活事实，使用人物所处世界内的叙述。已确认的职业、婚姻、亲属和相识经历直接写，不加作者框架。不要出现“本故事中”“本作设定”“用户提供的虚构情节”“作为虚构角色”“现实公开身份”“不指向现实私生活”等元说明或免责声明；这些材料边界只供内部判断，不能抄进人物资料。既有关系不变，不为去旁白编造新经历、改性格或增删亲属。人物自己讲故事、写小说、重视现实生活等真实爱好或观念不受此限制。';
export function cleanCharacterText(value){
 if(typeof value!=='string')return value;
 value=value.replace(/(^|[。！？；，\n])\s*(在)?(?:本故事|本作|本设定|本剧情|本作品|本卡)的/gu,'$1$2');
 let out=value.replace(/(^|[。！？；，\n])\s*(?:本故事|本作|本设定|本剧情|本作品|本卡)(?:将|把)([^。！？；，,\n]{1,40}?)设定为/gu,'$1$2是');
 out=out.replace(/(^|[。！？；，\n])\s*(?:在)?(?:本故事|本作|本设定|本剧情|本作品|本卡)(?:中|里|内|当中|之中)[，,、：:\s]*/gu,'$1');
 out=out.replace(/(^|[。！？；，\n])\s*(?:根据|依据|按照|按)(?:用户|玩家)(?:提供的)?(?:设定|描述|情节)[，,:：]\s*/gu,'$1');
 out=out.replace(/(^|[。！？；，\n])\s*作为(?:一个|一名)?(?:虚构)?(?:人物|角色)[，,:：]\s*/gu,'$1');
 out=out.replace(/(^|[。！？；，\n])\s*(她|他|它)被设定为/gu,'$1$2是').replace(/现实(?:中)?(?:的)?(?:公开)?身份(?:为|是)/gu,'身份是');
 out=out.replace(/[^。！？\n]+[。！？]?/gu,sentence=>{
  const at=sentence.search(/(?:(?:家庭|婚姻|亲属|人物)?关系(?:仅|只)(?:属于|属|是|来自|为)|(?:以上|上述|这些)(?:的)?(?:描述|设定|内容|关系)|(?:不指向|不涉及|不代表|不反映)(?:任何|其)?现实|(?:具体)?(?:身份与经历|身份和经历|经历|关系)(?:均)?(?:沿用|依据)(?:本故事|本设定))/u);
  const s=(at>=0?sentence.slice(at):sentence).trim();
  const lead=at>=0||/^(?:注|备注|说明)[：:]/u.test(s),source=/(?:用户|玩家|作者|虚构情节|虚构设定|本故事|本设定|公开资料|现实(?:中)?(?:人物|本人)?(?:的)?(?:私生活|隐私|关系))/u.test(s),explain=/(?:仅属于|仅属|仅为|仅供|只是|属于|不指向|不涉及|不代表|不反映|依据|基于|来源|提供的|沿用)/u.test(s);
  if(!lead||!source||!explain)return sentence;
  const prefix=(at>=0?sentence.slice(0,at):'').replace(/[，,；;：:\s]+$/gu,'');return prefix?prefix+(/[。！？]$/u.test(prefix)?'':'。'):'';
 });
 return out.replace(/\n[ \t]*\n[ \t]*\n/gu,'\n\n').trim();
}
// 只处理人物档案；不遍历正文、手机消息、账本或历史差分。
export function cleanCharacterProfiles(raw){
 const seen=new Set(),fields=['表性格','里性格','背景','人物背景','个人经历','background','surface_personality','inner_personality'];
 const clean=value=>typeof value==='string'?cleanCharacterText(value):Array.isArray(value)&&value.every(x=>typeof x==='string')?value.map(cleanCharacterText).filter(Boolean):value;
 function visit(record){if(!record||typeof record!=='object'||Array.isArray(record)||seen.has(record))return;seen.add(record);for(const key of fields)if(Object.prototype.hasOwnProperty.call(record,key))record[key]=clean(record[key]);if(typeof record.性格==='string')record.性格=clean(record.性格);else if(record.性格&&typeof record.性格==='object'&&!Array.isArray(record.性格))for(const key of ['表','里','表性格','里性格'])if(Object.prototype.hasOwnProperty.call(record.性格,key))record.性格[key]=clean(record.性格[key]);for(const key of ['字段','protagonist','主角','data'])visit(record[key]);for(const key of ['npcs','chars','角色','profiles'])if(Array.isArray(record[key]))record[key].forEach(visit);}
 visit(raw);return raw;
}
