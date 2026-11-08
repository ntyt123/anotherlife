import {careerBusinessRepresented} from './management-assets.mjs';
import {VIRTUAL_ASSET_GENERATION_RULES,virtualAssetItemSchema,seedOwnershipAsset} from './virtual-asset-details.mjs';
import {assetOwnerNames,mergeDuplicateAssets,mergeSimilarCareers,mergeHomes,mergeSameSkills,mergeDuplicateRights,sameAssetEntity,assetLabel} from './asset-identity.mjs';
import {REAL_ASSET_DETAIL_GENERATION_RULES,realAssetItemSchema,seedCareerAsset} from './asset-details.mjs';
import { INITIAL_LOCATION_RULES, INITIAL_LOCATION_PATTERN, sanitizeInitialLocations, initialLocationIssues } from './initial-location.mjs';
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const obj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v) => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0);
const label = (x) => String(x?.名称 || x?.名字 || x?.姓名 || x?.车型 || x?.对象 || x?.位置 || '').trim();
export const INITIAL_DATA_RULES = [
  '【开局资料完整性】这是设定提取与普通生活细节补全，不是只抄关键词。',
  '原文明确的人名、数量、归属、物件和能力必须逐项保留，不能只塞进额外信息代替结构化记录。没有声明的房产、车辆、企业和家庭成员不要擅自增设。',
  '原文已声明的每套住所，都必须生成可使用的完整设定：名称、位置、总面积、户型、楼层、产权人、居住人、状态、每一层的设施、简介。位置没有依据可为空，不要为了填满字段写占位地址。',
  INITIAL_LOCATION_RULES,
  '原文没给的面积、户型、楼层、房间布局、普通设施、日常用途可结合时代、城市和身份合理设计；这些是虚构生活细节，不要编造真人实际住址。古代住所按院落和房间布局填写。',
  '同一人上海、北京各有房，就分别给两条，不要合成一条“上海及北京住宅”；已有非空设定忠实沿用。',
  '房价、成交金额、购入时间、贷款、首付和债务不是可随手设计的普通细节：原文或已有设定未明确时留空，不得凭身份或市场行情估价填入。',
  '原文已拥有公司，必须在事业数组记录名称、职务、发展情况；明确名称逐字保留，别名统一到名称，不能只交所有者职务。**同一家公司只写一条**：不要为同一家公司取多个名字（「伊禾文化传媒有限公司」「伊辰文化传媒有限公司」这种同业务、同字辈的变体算同一家），原文明确有多家不同公司才分别写。未命名的虚构企业可结合玩家设定补一个普通名称；现实既有企业不能猜测名称，需标为缺项。所有者身份要保留。物品和技能按各自数组记录。',
  '已声明的经营主体、投资房产或土地在顶层实体资产记录，产权人和名称与事业一致；股权、版权、合约权益在顶层虚拟资产记录。自住住房和日常用车仍在住所/交通，不重复当产业。股份比例、成交价、估值、成本、借贷与余额未知留空，不按身份猜测。已有普通技能物品与状态值可在顶层技能物品对象记录；不得留到开场补发。',
  REAL_ASSET_DETAIL_GENERATION_RULES,
  VIRTUAL_ASSET_GENERATION_RULES,
  '只给自己有依据或获准补全的字段内容；没有内容用空字符串、空数组或0，不写未知/暂无/未提供等占位说明。',
].join('\n');
export function mergeInitialData(base, incoming) {
  if (!nonempty(incoming)) return clone(base === undefined ? incoming : base);
  if (Array.isArray(incoming)) {
    const out = Array.isArray(base) ? clone(base) : [];
    for (const value of incoming) {
      if (!obj(value)) { if (!out.some((x) => JSON.stringify(x) === JSON.stringify(value))) out.push(clone(value)); continue; }
      const nm = label(value);
      const at = out.findIndex((x) => obj(x) && ((nm && label(x) === nm) || (value.位置 && x.位置 === value.位置 && (!(x.名称 || x.名字) || !(value.名称 || value.名字))) || (value.对象 && x.对象 === value.对象)));
      if (at < 0) out.push(clone(value)); else out[at] = mergeInitialData(out[at], value);
    }
    return out;
  }
  if (obj(incoming)) {
    const out = obj(base) ? clone(base) : {};
    for (const [k, v] of Object.entries(incoming)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k) || k.startsWith('_')) continue;
      out[k] = mergeInitialData(out[k], v);
    }
    return out;
  }
  return incoming;
}
export function sanitizeInitialHomes(data, text, base = {}) {
  const result = sanitizeInitialLocations(data);
  if (!Array.isArray(result?.住所)) return result;
  const source = String(text || '');
  for (const home of result.住所) {
    if (!obj(home)) continue;
    const old = (Array.isArray(base.住所) ? base.住所 : []).find((x) => label(x) === label(home) || (x.位置 && x.位置 === home.位置));
    for (const key of ['买入价格', '购入价格', '购入时间', '贷款', '按揭', '首付', '定金']) {
      if (!nonempty(home[key])) { if(nonempty(old?.[key])) home[key]=clone(old[key]); continue; }
      const isDate = key === '购入时间';
      const evidence = isDate ? /(?:买|购|取得).{0,12}(?:\d{4}年|\d{4}-)|(?:\d{4}年|\d{4}-).{0,24}(?:买|购|取得)/.test(source) : /房价|买入价|购入价|成交|价格|房款|贷款|按揭|首付|定金/.test(source);
      const token = String(home[key]).replace(/[\s,，元]/g, '');
      const amount=(v)=>{const m=String(v).replace(/[\s,，元￥¥]/g,'').match(/^(\d+(?:\.\d+)?)(万|亿)?$/);return m?Number(m[1])*(m[2]==='亿'?1e8:m[2]==='万'?1e4:1):NaN;};
      const n=amount(home[key]);
      const numericEvidence=!isDate&&Number.isFinite(n)&&[...source.matchAll(/(?:房价|买入价|购入价|成交价|价格|房款|贷款|按揭|首付|定金)[约为是：: ]*(\d[\d,，]*(?:\.\d+)?)[ ]*(万|亿)?/g)].some(m=>amount(m[1]+(m[2]||''))===n);
      if (!evidence || (!source.replace(/[\s,，元]/g, '').includes(token)&&!numericEvidence)) home[key] = nonempty(old?.[key])?clone(old[key]):'';
    }
  }
  return result;
}
export function initialDataIssues(data, text = '') {
  const out = initialLocationIssues(data), source = String(text || '');
  const homes = Array.isArray(data?.住所) ? data.住所 : [];
  if (/房产|住宅|住所|有.{0,12}(?:房子|别墅|住房)/.test(source) && !homes.length) out.push('已声明的住所没有记录');
  for (const h of homes) {
    const nm = label(h) || '住所';
    if (!nonempty(h?.名称 || h?.名字) && !nonempty(h?.位置)) out.push(nm + '缺少名称或位置');
  }
  const pair = source.match(/在([^，。；\n]{1,40}?)(?:均有|各有|都有)房产/);
  if (pair) for (const city of pair[1].split(/[、和与及]/).map((x) => x.trim()).filter(Boolean)) if (!homes.some((h) => (label(h) + String(h.位置 || '')).includes(city))) out.push('缺少' + city + '的独立住所');
  if (/(?:有自己的|拥有|创办|经营|成立).{0,12}(?:公司|企业|工作室)/.test(source) && !(Array.isArray(data?.事业) && data.事业.length)) out.push('已声明的事业没有记录');
  for(const c of Array.isArray(data?.事业)?data.事业:[])if(!label(c))out.push('事业条目缺少名称');
  for (const m of source.matchAll(/拥有(?:一[把辆台件只本部套张]|[两三四五六七八九十]+[把辆台件只本部套张])?([^，。；\n]+)/g)) {
    const name = m[1].trim();
    if (!name || /公司|企业|房产|住宅|能力|技能|系统|法术/.test(name)) continue;
    if (!(Array.isArray(data?.物品) ? data.物品 : []).some((x) => label(x).includes(name) || name.includes(label(x)) && label(x))) out.push('已声明物品未落实：' + name);
  }
  return [...new Set(out)];
}
export function initialRepairPatch(raw) {
  const fields={住所:['名称','名字','类别','位置','总面积','户型','楼层','产权人','居住人','状态','每一层的设施','简介','安保与配套','周边','备注','买入价格','购入时间'],交通:['名称','名字','车型','位置','状态','简介','买入价格'],事业:['名称','名字','职务','发展情况'],物品:['名称','名字','品质','数量','获取时间','简介','来历','来源','属性提升'],技能:['名称','名字','等级','说明','来源','类别','状态']};
  const out={};
  for(const[k,allowed]of Object.entries(fields))if(Array.isArray(raw?.[k]))out[k]=raw[k].filter(obj).map(x=>Object.fromEntries(Object.entries(x).filter(([key])=>allowed.includes(key))));
  return out;
}

export function seedInitialAssets(state) {
  const career = Array.isArray(state.protagonist?.事业) ? state.protagonist.事业 : [];
  state.实体资产 = Array.isArray(state.实体资产) ? state.实体资产 : [];
  const 主体名=assetOwnerNames(state);
 if(state.protagonist&&Array.isArray(state.protagonist.住所))state.protagonist.住所=mergeHomes(state.protagonist.住所);
 if(state.protagonist&&Array.isArray(state.protagonist.技能))state.protagonist.技能=mergeSameSkills(state.protagonist.技能);
 if(state.skills_items&&Array.isArray(state.skills_items.技能))state.skills_items.技能=mergeSameSkills(state.skills_items.技能); if(state.protagonist&&Array.isArray(state.protagonist.事业)){const before=state.protagonist.事业.length;state.protagonist.事业=mergeSimilarCareers(state.protagonist.事业,主体名);if(before!==state.protagonist.事业.length)state._careersDeduped=true;}
  state.实体资产=mergeDuplicateAssets(state.实体资产,主体名);
  state.虚拟资产=mergeDuplicateRights(state.虚拟资产,主体名);
  state.虚拟资产 = Array.isArray(state.虚拟资产) ? state.虚拟资产 : [];
  for (const c of career) {
    const nm = label(c);
    if (!nm || !/公司|企业|工作室/.test(nm) || !/所有者|创办人|创始人|老板|拥有者/.test(String(c.职务 || ''))) continue;
    if (!state.实体资产.some((x) => sameAssetEntity(x,{名称:nm,产权人:String(state.protagonist.姓名||'')},主体名)) && !careerBusinessRepresented(state.实体资产,c,state.protagonist.姓名)) state.实体资产.push(seedCareerAsset(c,String(state.protagonist.姓名 || '')));
    const 同名权益=state.虚拟资产.find((x) => sameAssetEntity({名称:String(x.权利标的||x.名称||''),产权人:String(x.归属||x.产权人||'')}, {名称:nm,产权人:String(state.protagonist.姓名||'')}, 主体名));
    if (!同名权益) state.虚拟资产.push(seedOwnershipAsset(c,String(state.protagonist.姓名 || '')));
    else for (const k of ['持股比例','主角所占股份']) if ((同名权益[k]==null||同名权益[k]==='') && c[k]!=null && c[k]!=='') 同名权益[k]=c[k];
  }
}

export function initialParseTool(base) {
  const string={type:'string'},quantity={type:['string','number']};
  const location={...string,description:'原文已有地名；只知城市则填城市，未知为空，不得用虚拟位置等占位',pattern:INITIAL_LOCATION_PATTERN};
  const fields={名称:string,位置:location,总面积:quantity,户型:string,楼层:quantity,产权人:string,居住人:{type:['string','array'],items:string},状态:string,每一层的设施:string,简介:string,买入价格:quantity,购入时间:string};
  return {...base,parameters:{...base.parameters,properties:{...base.parameters?.properties,虚拟资产:{type:'array',items:virtualAssetItemSchema()},实体资产:{type:'array',items:realAssetItemSchema()},住所:{type:'array',items:{type:'object',properties:fields,required:['名称','位置','总面积','户型','楼层','产权人','居住人','状态','每一层的设施'],additionalProperties:true}},事业:{type:'array',items:{type:'object',properties:{名称:{type:'string',minLength:1},职务:string,发展情况:string},required:['名称','职务','发展情况'],additionalProperties:true}}}}};
}
