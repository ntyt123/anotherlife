import {assertSafeValue} from './runtime-core.mjs';
const obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const arrays=['角色','npcs','chars','人物'];
const wrappers=['arguments','参数','parameters','args','input'];
export const CAST_PARSE_RULES='【名册提交协议】本次只提交关联人物名册，调用emit_parsed_json时直接返回 {"角色":[{"姓名":"人物姓名","与主角关系":"已声明关系","表性格":"普通外在性格","里性格":"普通内在性格","背景":"已有背景"}]}。顶层必须包含角色数组，不能使用“参数”或arguments再次包装，不能输出XML、确认语或只回ok。没有应登记人物才交 {"角色":[]}；原文已有名字逐字沿用，不把主角放入关联人物，不为满足格式新增人物。其他字段按已有依据填写，缺值留空。';
export function castParseTool(base){return {...base,description:'提交关联人物名册，直接提交含角色数组的对象，不包装为参数字符串，不输出XML。',parameters:{type:'object',properties:{角色:{type:'array',description:'从本次设定提取的关联人物，不含主角；没有关联人物时为空数组。',items:{type:'object',properties:{...Object.fromEntries(['姓名','性别','生日','身份','种族','出生地','与主角关系','外貌','特点','身高','体重','健康状况','疾病与伤病','表性格','里性格','背景'].map(k=>[k,{type:'string',...(k==='身份'?{description:'只录明确设定或可确认的真人公开职业，不推测职业；亲属关系不等于职业改写，未知留空字符串。'}:k==='背景'?{description:'按已知经历填写，不编造未提供的职业、任职单位或工作履历；真人公开履历与剧情关系分开。'}:{})}])),联系方式:{type:'object',description:'仅填写已有明确的联系方式，未知值留空字符串，不推测号码或账号。',properties:Object.fromEntries(['电话','微信','QQ'].map(key=>[key,{type:'string'}])),required:['电话','微信','QQ'],additionalProperties:false},年龄:{type:'number'},标签:{type:'array',items:{type:'string'}}},required:['姓名'],additionalProperties:true}}},required:['角色'],additionalProperties:false}};}
export function decodeCastResult(raw){let value=raw,depth=0;const fail=(kind,error)=>({value:null,error,diagnostic:{accepted:false,kind,wrapperDepth:depth}});
  for(;depth<=8;depth++){
    try{assertSafeValue(value);}catch{return fail('unsafe','关联人物名册包含不安全结构，未接收');}
    if(obj(value)){
      const key=arrays.find(k=>Array.isArray(value[k]));
      if(key){if(value[key].some(x=>!obj(x)))return fail('invalid-item','关联人物名册含非人物对象，未接收');return {value:{角色:value[key]},diagnostic:{accepted:true,kind:depth?'wrapped-json':'direct',wrapperDepth:depth,arrayKey:key,actorCount:value[key].length}};}
      const keys=Object.keys(value).filter(k=>!k.startsWith('_'));
      if(keys.length!==1||!wrappers.includes(keys[0]))return fail('missing-array','关联人物名册没有返回人物数组，请按角色数组提交');
      value=value[keys[0]];
    }
    if(typeof value==='string'){
      const body=value.trim();if(/^<|^```\s*(?:xml|html)/i.test(body))return fail('xml','关联人物名册返回了XML文本，而不是人物数组，未接收');
      try{value=JSON.parse(body);}catch{return fail(/^(?:ok|okay|好|好的|收到|已完成)[.!！。]?$/i.test(body)?'acknowledgement':'text','关联人物名册只返回了文本，未提交人物数组');}
    }else if(!obj(value))return fail('invalid-type','关联人物名册没有返回人物数组，请按角色数组提交');
  }
  return fail('nesting','关联人物名册包装层数异常，未接收');
}
