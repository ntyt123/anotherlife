import {assertSafeValue} from './runtime-core.mjs';
import {INITIAL_LOCATION_PATTERN} from './initial-location.mjs';
const rows=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'?x.trim():'',copy=x=>JSON.parse(JSON.stringify(x));
export const ASSET_DETAIL_FIELDS=[
  {key:'description',label:'简介',aliases:['简介','概况','description'],min:1},
  {key:'purpose',label:'用途',aliases:['用途','用途说明','purpose'],min:1},
  {key:'scale',label:'规模说明',aliases:['规模说明','规模','scale'],min:1},
  {key:'status',label:'运营状态',aliases:['运营状态','状态','status'],min:1},
  {key:'businessScope',label:'主营业务',aliases:['主营业务','经营范围','businessScope'],min:1,businessOnly:true},
  {key:'facilities',label:'主要设施',aliases:['主要设施','设施','facilities']},
  {key:'development',label:'发展情况',aliases:['发展情况','发展状况','development'],min:1,businessOnly:true},
  {key:'location',label:'位置',aliases:['位置','所在地','地址','location']},
];
const required=ASSET_DETAIL_FIELDS.filter(f=>f.min&&!f.businessOnly),empty=/^(?:无|暂无|未知|未提供|未提及|未设定|待补齐|不详)$/;
const meaningful=v=>typeof v==='string'?!!v.trim()&&!empty.test(v.trim()):Array.isArray(v)&&v.some(x=>typeof x==='string'&&x.trim()&&!empty.test(x.trim()));
const read=(asset,f)=>f.aliases.map(k=>asset?.[k]).find(meaningful),valid=(asset,f)=>{const v=read(asset,f);return typeof v==='string'&&Array.from(v.replace(/\s/gu,'')).length>=f.min;};
export const realAssetName=asset=>text(asset?.名称||asset?.名字||asset?.name);
export const REAL_ASSET_DETAIL_RULES=[
 '【实体资产资料】这里只为已经存在、已声明的实体资产补描述，不增设新资产。每条不应只有名称、类型和产权人；按行业和资产类型写清简介、用途、规模说明、运营状态，并补有依据的主营业务、主要设施、发展情况、位置。公司写业务定位和日常职能，厂房写用途与设施，投资房产或土地写使用方式和当前状态，不能套成同一种企业模板。',
 '简介至少40字，具体说明资产如何使用、承担什么功能和当前情况，不只复述名称。用途至少12字，规模说明至少8字，运营状态写实际状态。可结合世界、既定用途和身份设计相容的普通经营功能、组织分工、设施与布局，不要用未知、待补齐、暂无等占位凑字段。未明确员工数、艺人数、产能、面积时用不带编造数字的描述性规模，不暗中建立新人物或经营账户。',
 '已有设定优先，只补缺项；已有短简介扩写时保留原有事实。不改变名称、类型、产权人、归属或任何已确认的资料。现实既有企业只采用已知公开经营信息，不捏造私有经营细节。未知位置可留空，只知城市就保留城市，不编造具体门牌，不写虚拟位置。自住住所和日常用车仍归住所/交通，不能借补资料重复建立产业。',
 '严禁补造或修改余额、注册资本、估值、成本、利润、收入、支出、贷款、债务、股份比例、购入价格、成交日期、合同、账户及产权权益；描述不是资金或经营结算依据，不产生收益、不创建单位或奖励。',
 '使用assetDetails数组按任务的index和name准确提交英文键：description、purpose、scale、status、businessScope、facilities、development、location。任务缺项必须交，有依据的可选描述可交；未知可选字段留空。没有任务不输出assetDetails，不把资料塞进profile或managementOperations。',
].join('\n');
export const REAL_ASSET_DETAIL_GENERATION_RULES=REAL_ASSET_DETAIL_RULES.split("\n").slice(0,-1).join("\n");
export function realAssetDetailTasks(state,{indices}={}){const selected=indices?new Set(indices):null;return rows(state.实体资产).flatMap((asset,index)=>{if(selected&&!selected.has(index))return[];const name=realAssetName(asset);if(!name)return[];const business=/公司|企业|工作室|商行|商店|工厂|店铺/.test(text(asset.类型||asset.类别)||name)&&!/厂房|门面|办公楼/.test(text(asset.类型||asset.类别));const missing=ASSET_DETAIL_FIELDS.filter(f=>f.min&&(!f.businessOnly||business)&&!valid(asset,f)).map(f=>f.key);return missing.length?[{index,name,type:text(asset.类型||asset.类别||asset.kind),owner:text(asset.产权人||asset.归属||asset.owner),current:Object.fromEntries(ASSET_DETAIL_FIELDS.map(f=>[f.key,read(asset,f)]).filter(([,v])=>v!==undefined)),missing}]:[];});}
export function assetDetailSchema(tasks){const properties=Object.fromEntries(ASSET_DETAIL_FIELDS.map(f=>[f.key,f.key==='facilities'?{type:'array',items:{type:'string'}}:{type:'string',...(f.min?{minLength:f.min}:{}),...(f.key==='location'?{pattern:INITIAL_LOCATION_PATTERN}:{})}]));return {type:'array',minItems:tasks.length,maxItems:tasks.length,items:{anyOf:tasks.map(t=>({type:'object',properties:{index:{type:'integer',enum:[t.index]},name:{type:'string',enum:[t.name]},...properties},required:['index','name',...t.missing],additionalProperties:false}))}};}
export function withAssetDetailsSchema(schema,tasks){if(!tasks.length)return schema;return {...schema,properties:{...schema.properties,assetDetails:assetDetailSchema(tasks)},required:[...new Set([...(schema.required||[]),'assetDetails'])]};}
export function inspectAssetDetails(state,tasks,raw){const diffs=[],issues=[],allowed=new Set(['index','name',...ASSET_DETAIL_FIELDS.map(f=>f.key)]),view={实体资产:copy(rows(state.实体资产))};try{assertSafeValue(raw);}catch{ return {diffs,issues:['资产资料返回值格式不安全']};}for(const task of tasks){const matches=rows(raw?.assetDetails).filter(x=>x?.index===task.index&&x.name===task.name),asset=state.实体资产?.[task.index];if(!asset||realAssetName(asset)!==task.name){issues.push(task.name+'的记录已改变');continue;}if(matches.length!==1){issues.push(task.name+'未提交唯一对应的资产资料');continue;}const record=matches[0],extra=Object.keys(record).filter(k=>!allowed.has(k));if(extra.length){issues.push(task.name+'包含不允许变更的字段：'+extra.join('、'));continue;}for(const field of ASSET_DETAIL_FIELDS){const value=record[field.key];if(!meaningful(value))continue;if(field.min&&!task.missing.includes(field.key))continue;if(!field.min&&meaningful(read(asset,field)))continue;if(field.key==='facilities'&&(!Array.isArray(value)||value.some(x=>typeof x!=='string')))continue;if(field.key!=='facilities'&&typeof value!=='string')continue;if(field.min&&Array.from(value.replace(/\s/gu,'')).length<field.min)continue;if(field.key==='location'&&!new RegExp(INITIAL_LOCATION_PATTERN).test(value))continue;let next=copy(value);const previous=read(asset,field);if(field.key==='description'&&text(previous)&&!next.includes(previous))next=previous+(/[。！？.!?]$/.test(previous)?'':'。')+next;view.实体资产[task.index][field.label]=next;diffs.push({path:['实体资产',task.index,field.label],to:next});}}
 for(const t of realAssetDetailTasks(view,{indices:tasks.map(t=>t.index)}))issues.push(t.name+'缺少完整的'+t.missing.map(k=>ASSET_DETAIL_FIELDS.find(f=>f.key===k).label).join('、'));return {diffs,issues:[...new Set(issues)]};}
export function realAssetItemSchema(){const properties={名称:{type:'string',minLength:1},类别:{type:'string'},类型:{type:'string'},产权人:{type:'string'}};for(const field of ASSET_DETAIL_FIELDS)properties[field.label]=field.key==='facilities'?{type:'array',items:{type:'string'}}:{type:'string',...(field.min?{minLength:field.min}:{}),...(field.key==='location'?{pattern:INITIAL_LOCATION_PATTERN}:{})};return {type:'object',properties,required:['名称','产权人',...required.map(f=>f.label)],additionalProperties:true};}
export function seedCareerAsset(career,owner){return {名称:realAssetName(career),类别:text(career.类别||career.类型)||'企业',产权人:owner,简介:text(career.简介||career.发展情况),用途:text(career.用途||career.主营业务||career.经营范围),规模说明:text(career.规模说明||career.规模),运营状态:text(career.运营状态||career.状态),主要设施:rows(career.主要设施||career.设施),主营业务:text(career.主营业务||career.经营范围),发展情况:text(career.发展情况)};}

export function realAssetDetailIssues(state){return realAssetDetailTasks(state).map(t=>t.name+'缺少完整的'+t.missing.map(k=>ASSET_DETAIL_FIELDS.find(f=>f.key===k).label).join('、'));}
