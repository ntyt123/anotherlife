import {BASIC_WEAR_KEYS,basicWear} from './data-integrity.mjs';
import {wardrobeCompletionTool,inspectWardrobeResult} from './wardrobe-repair.mjs';
export const CREATION_WEAR_KEYS=['头部','上衣','内衣','内裤','下衣','袜子','鞋子','饰品'];
const innerKeys=['内衣','内裤'];
export const creationWear=wear=>basicWear(wear,CREATION_WEAR_KEYS);
export const requiredCreationWear=actor=>String(actor?.性别||'').includes('女')?innerKeys.slice():[];
export const CREATION_WARDROBE_RULES=[
 '你为虚构人物设计普通日常衣物，不写故事，不处理身体、气味或其他私密资料。',
 '必须按任务姓名逐人用complete_records提交chars，每人穿着包含头部、上衣、内衣、内裤、下衣、袜子、鞋子、饰品八个对象；不要漏掉贴身衣物。主角也放chars，不新增名单外人物。',
 '每槽只提交物品、稀有度、状态、简介四个字符串。非空物品稀有度用N/R/SR/SSR/UR，简介10至25字，说明普通由来或状态，状态可以为空；不写气味、身体数据、成人描写或沾染。',
 'requiredSlots是本次必须有普通衣物的部位。女性任务中的内衣、内裤不能因外衣已经完整就遗漏；不准用“未穿”“无”“暂无”当作物品名充数。',
 '严格按年龄、身份、年代、季节选择普通款式。婴幼儿使用适龄的棉质贴身小衣、尿布或纸尿裤等，儿童只写普通背心和日常内裤，不套成人款式或成人描述。婴幼儿的贴身衣物只写款式与材质，不写使用状态或更换情况。男性没有适用内衣时可以留空，不强配女性内衣。',
 '头部、饰品、鞋袜确实不佩戴时四字段都留空，连衣裙可放上衣并将下衣留空；上衣和下衣不能同时全空。不要为凑槽位强加配饰。',
 '沿用任务已有穿着的物品名与事实，只补缺项和格式，不能换掉已确认衣物。外衣已齐时原样带回，只补缺少的贴身衣物；不要改任何人物资料、现金、资产或职业。',
 '缺项时交实际衣物数据，不用“已完成”等文字代替；不支持工具时只交同结构JSON。'
].join('\n');
export const creationWardrobeTool=tasks=>wardrobeCompletionTool(tasks,false,{keys:CREATION_WEAR_KEYS});
export function inspectCreationWardrobe(state,tasks,raw){return inspectWardrobeResult(state,tasks,raw,{keys:CREATION_WEAR_KEYS,preserveExistingFields:true,requiredSlotsForTask:task=>task.requiredSlots||[],optionalSlotsForTask:task=>(task.requiredSlots||[]).length?[]:innerKeys});}
export {BASIC_WEAR_KEYS};
