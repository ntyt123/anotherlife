import{splitStory,stripNoteTags}from'./story-parser.mjs';
// 仅解析同次请求的可见回复，不读取reasoning，不调用模型，不把其他工具参数当正文。
export function plainStoryFallback(raw){
  let text=String(raw??'').trim();if(!text)return{accepted:false,why:'没有可见正文'};
  const fence=text.match(/^```(?:json|markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i);if(fence)text=fence[1].trim();
  let payload=null;
  if(/^[\[{]/.test(text)){
    try{payload=JSON.parse(text);}catch{if(/^\{\s*["']|^\[\s*[\[{\"]/.test(text))return{accepted:false,why:'普通回复是未完成的JSON，而不是正文'};}
    if(payload!==null){
      if(!payload||typeof payload!=='object'||Array.isArray(payload))return{accepted:false,why:'JSON回复没有正文字段'};
      const value=['game_content','正文','body','story','content'].map(k=>payload[k]).find(v=>typeof v==='string'&&v.trim());
      if(!value)return{accepted:false,why:'JSON回复没有正文字段'};
      text=value;
    }
  }
  let story=splitStory(text);
  const wrapped=String(story.body||'').match(/^\s*<(正文|story|game_content)>\s*([\s\S]*?)\s*<\/\1>\s*$/i);
  if(wrapped){const inner=splitStory(wrapped[2]);story={think:[story.think,inner.think].filter(Boolean).join('\n\n'),body:inner.body,options:[...story.options,...inner.options]};}
  if(payload){if(!story.think&&typeof payload.think==='string')story.think=stripNoteTags(payload.think);if(Array.isArray(payload.options))story.options=payload.options.filter(v=>typeof v==='string'&&v.trim());}
  const body=String(story.body||'').trim();
  if(!body)return{accepted:false,why:'可见回复只有笔记或选项，没有正文'};
  if(/^(?:好(?:的)?|收到|明白(?:了)?|可以|没问题|ok(?:ay)?|sure|understood|done)[。.!！\s]*$/i.test(body))return{accepted:false,why:'可见回复只是确认，没有正文'};
  if(/^(?:抱歉[，,\s]*)?(?:我)?(?:无法|不能)(?:完成|满足|协助)(?:此|该|这个|这一)(?:请求|任务)[。.!！\s]*$/.test(body)||/^(?:抱歉[，,\s]*)?我无法完成这个请求[。.!！\s]*$/.test(body))return{accepted:false,why:'可见回复不是叙事正文'};
  if(/^(?:error|api error|request failed|provider error)\s*[:：]/i.test(body))return{accepted:false,why:'可见回复是接口错误'};
  return{accepted:true,story};
}
