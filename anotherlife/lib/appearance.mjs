export const APPEARANCE_MIN_LENGTH = 0;
export const APPEARANCE_RULES = [
 '【外貌描写】主角、名册、新角色及明确补全外貌时，写这个人看得见的形象。篇幅按角色和场景需要，不设字数下限，也不因不够某个字数判为不合格；现有短描写可以直接用，不必为了凑长度扩写，也不要为了长度拆成固定字段或清单。',
 '尽量写到脸型与眼、鼻、唇，以及手、脚、腿和发肤体态，按人物已有的外形与尺寸自然衔接。**胸、臀、腰三类只写成年角色**；未成年角色只写脸、发、身形与气质，不写这三处。写成一段紧凑的白描或分成几段都可以；只写脸、其余用一句“体态匀称”带过也可以，不强制逐部位展开。',
 '用具体形态、光影和动作组织句子，不堆“漂亮、甜美、好看”这类空泛评价，也不把生平、职业、关系或性格分析当成外貌。保留既定五官、发色、肤色、年龄与体型，不擅自改年龄、加隐藏伤疤或编精确身体数值；卡内已有的身高体重三围可转成视觉比例，不写成数字清单。',
 '所有年龄都只写普通、年龄相符的外在形象，不写性化描写、私密部位、气味或身体接触。服装与身高体重等数值各有独立字段。',
 '外貌字段只保留肖像文字，不写“根据公开资料”“不涉及现实私生活”这类来源或免责说明。普通回合里已有外貌且无变化时不重复输出。',
].join('\n');
export const APPEARANCE_SCHEMA = {type:'string',description:'这个人的可见形象，按实际需要写；不限字数，一段或几段都行，保留已有外形，不写来源说明或空泛评价。'};
export function appearanceLength(value){return typeof value==='string'?Array.from(value.replace(/\s/gu,'')).length:0;}
export function assertGeneratedAppearances(raw){
  const seen=new Set();
  function visit(record){
    if(!record||typeof record!=='object'||Array.isArray(record)||seen.has(record))return;
    seen.add(record);
    if(Object.prototype.hasOwnProperty.call(record,'外貌')&&record.外貌!=null&&record.外貌!==''){
      const name=String(record.姓名||record.名字||record.name||'').trim();
      if(typeof record.外貌!=='string')throw new Error((name?name+'：':'')+'外貌必须为文字');
    }
    for(const key of ['字段','protagonist','主角','data'])visit(record[key]);
    for(const key of ['角色','npcs','chars'])if(Array.isArray(record[key]))for(const actor of record[key])visit(actor);
  }
  visit(raw);return raw;
}
export function stripAppearanceMeta(value){
 if(typeof value!=='string')return value;
 let changed=false;
 let out=value.replace(/(^|[。！？\n])\s*(?:根据|依据|基于)(?:目前|现有|已有)?(?:公开(?:可见)?(?:资料|照片|影像|形象|信息)|已知资料)[，,:：]\s*/gu,'$1');
 out=out.replace(/[（(][^（()）]{0,24}(?:公开资料|公开信息|仅供参考|不涉及现实)[^（()）]{0,12}[）)]/gu,()=>{changed=true;return'';});
 const parts=out.split(/(?<=[。！？；\n])/u);
 const kept=[];
 for(const sentence of parts){
  const at=sentence.search(/(?:这些|以上|上述|本段|该段|本次|此处)(?:的)?(?:外貌)?(?:描述|描写|文字|内容|信息)/u);
  const s=(at>=0?sentence.slice(at):sentence).trim();
  const lead=/^(?:这些|以上|上述|本段|该段|本次|此处|本描述|外貌描写|形象描述|资料来源[：:]|来源[：:]|注[：:]|备注[：:])/.test(s);
  const meta=/(?:依据|基于|根据|来源|参考|仅供|不涉及|不代表|不推断|未涉及|不包含)/.test(s)&&/(?:公开|资料|现实|私生活|隐私|设定|创作|参考)/.test(s);
  if(lead&&meta){changed=true;if(at>0)kept.push(sentence.slice(0,at));continue;}
  kept.push(sentence);
 }
 out=kept.join('').replace(/\n{3,}/gu,'\n\n').trim();
 return changed?out:value;
}
export function cleanGeneratedAppearanceNotes(raw){
 const seen=new Set();
 function visit(record){
  if(!record||typeof record!=='object'||Array.isArray(record)||seen.has(record))return;
  seen.add(record);
  if(typeof record.外貌==='string'&&record.外貌.trim()){
   const cleaned=stripAppearanceMeta(record.外貌).trim();
   if(cleaned)record.外貌=cleaned;
   else delete record.外貌;
  }
  for(const k of ['字段','protagonist','主角','data'])visit(record[k]);
  for(const k of ['角色','npcs','chars'])if(Array.isArray(record[k]))record[k].forEach(visit);
 }
 visit(raw);return raw;
}
export function appearanceBasis(actor={},year=''){
 const out={};
 for(const k of ['姓名','性别','生日','年龄','种族','外貌','身高','体重','三围','罩杯','肤色','发色','体型']){
  let v=actor[k];
  if(v==null||v===''||v===0||v==='0')continue;
  if(k==='外貌')v=stripAppearanceMeta(v);
  if(v==null||v==='')continue;
  if(k==='三围'&&typeof v==='object'&&!Object.values(v).some(x=>Number(x)>0))continue;
  out[k]=v;
 }
 const age=Number(actor.年龄),birth=typeof actor.生日==='string'?Number(actor.生日.slice(0,4)):NaN,at=Number(year);
 if(age>0&&age<18||at>0&&birth>0&&at-birth>=0&&at-birth<18){delete out.三围;delete out.罩杯;}
 return out;
}
