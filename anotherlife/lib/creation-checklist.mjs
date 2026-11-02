// 自包含纯检查器：宿主与浏览器构建使用同一份源码，不请求模型。
export function createCreationChecklist(){
  const rows=x=>Array.isArray(x)?x:[],obj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
  const empty=/^(?:无|暂无|未知|未提供|未提及|未设定|待补齐|不详|暂无明确设定|暂无资料|不知道|不清楚|待定)$/u;
  const text=x=>typeof x==='string'?x.trim():'';
  const filled=x=>typeof x==='number'?Number.isFinite(x):typeof x==='boolean'?true:typeof x==='string'?!!text(x)&&!empty.test(text(x)):Array.isArray(x)?x.some(filled):obj(x)?Object.values(x).some(filled):false;
  const get=(s,path)=>path.reduce((v,k)=>v?.[k],s);
  const pointer=path=>'/'+path.map(x=>String(x).replace(/~/g,'~0').replace(/\//g,'~1')).join('/');
  const name=x=>text(x?.姓名||x?.名称||x?.名字||x?.name);
  const assetFields=[['简介','概况','description'],['用途','用途说明','purpose'],['规模说明','规模','scale'],['运营状态','状态','status']];
  const businessFields=[['主营业务','经营范围','businessScope'],['发展情况','发展状况','development']];
  const virtualFields=[['简介','说明','description'],['权利标的','关联标的','标的','subject'],['权利内容','权益内容','权利范围','rights'],['行使方式','权利行使方式','exercise'],['限制与义务','权利限制','限制条件','boundaries']];
  const profileFields=[['表性格','surface_personality'],['里性格','inner_personality'],['背景','人物背景','个人经历','background']];
  function inspect(s,previous=s?.simulation?.creation?.checklist){
    s=s||{};const before=rows(previous).filter(x=>obj(x)&&typeof x.id==='string'&&Array.isArray(x.path));const byId=new Map(before.map(x=>[x.id,x])),used=new Set(),checks=[];
    function add({path,paths=[path],label,rule='text',target=null,field=String(path.at(-1)),group='主角',test}){
      const identity=target?(target.uid||target.identityName||target.name||'row:'+target.index):'root';let id=JSON.stringify([target?.root||path.slice(0,-1),identity,field]);
      let old=byId.get(id);
      if(!old&&target)old=before.find(x=>{if(used.has(x.id)||x.field!==field||x.target?.root!==target.root)return false;const prior=x.target;if(target.uid&&prior.uid===target.uid)return true;const oldStillExists=!!prior.uid&&rows(get(s,target.collection)).some(row=>text(row?.actorId||row?.id)===prior.uid);if(target.name&&prior.name===target.name&&(!target.uid||!prior.uid||!oldStillExists))return true;return !prior.name&&prior.index===target.index&&!oldStillExists;});
      if(old)id=old.id;used.add(id);
      const complete=test?!!test():rule==='list'?rows(get(s,path)).length>0:paths.some(p=>typeof get(s,p)==='string'&&filled(get(s,p))||rule==='profile'&&Array.isArray(get(s,p))&&get(s,p).every(v=>typeof v==='string')&&get(s,p).some(filled));
      if(!complete||old)checks.push({id,label,group,field,path,paths,rule,target,pointer:pointer(path),status:complete?'done':'missing'});
    }
    function field(root,entity,keys,title){const paths=keys.map(k=>[...root,k]),profile=profileFields.some(x=>x[0]===keys[0]);if(profile&&keys[0]!=='背景')paths.push([...root,'性格',keys[0]],[...root,'性格',keys[0]==='表性格'?'表':'里']);add({path:[...root,keys[0]],paths,rule:profile?'profile':'text',label:title+' · '+({name:'名称',description:'简介'}[keys[0]]||keys[0]),field:keys[0],group:title,target:entity});}
    function target(root,row,index){return {root:JSON.stringify(root),collection:root,identityName:name(row)&&rows(get(s,root)).filter(x=>name(x)===name(row)).length>1?name(row)+'#'+index:name(row),uid:text(row?.actorId||row?.id),name:name(row),index};}
    field(['protagonist'],null,['姓名'],'主角');
    const actors=[{actor:s.protagonist||{},path:['protagonist'],entity:null,title:'主角'},...rows(s.npcs).map((actor,index)=>({actor,path:['npcs',index],entity:target(['npcs'],actor,index),title:name(actor)||'关联角色 '+(index+1)}))];
    for(const a of actors){
      if(a.entity){field(a.path,a.entity,['姓名'],a.title);for(const keys of profileFields)field(a.path,a.entity,keys,a.title);}
      const n=name(a.actor);if(n)add({path:[...a.path,'姓名'],label:a.title+' · 姓名不重复',field:'uniqueName',target:a.entity,group:a.title,test:()=>actors.filter(x=>name(x.actor)===n).length===1});
      add({path:[...a.path,'穿着','上衣','物品'],paths:[[...a.path,'穿着','上衣','物品'],[...a.path,'穿着','下衣','物品']],label:a.title+' · 普通穿着',field:'ordinaryWear',target:a.entity,group:a.title});
      if(text(a.actor?.性别).includes('女'))for(const slot of ['内衣','内裤'])field([...a.path,'穿着',slot],a.entity?{...a.entity,root:a.entity.root+':wear:'+slot}:null,['物品'],a.title+' · '+slot);
    }
    for(const [collection,label]of [['住所','住所'],['事业','事业'],['物品','物品'],['技能','技能'],['交通','交通']])rows(s.protagonist?.[collection]).forEach((row,index)=>{
      const root=['protagonist',collection,index],t=target(['protagonist',collection],row,index),title=name(row)||label+' '+(index+1);
      field(root,t,collection==='住所'?['名称','名字','位置']:collection==='技能'?['名称','名字','name','技能名']:['名称','名字','name','车型'],title);
    });
    const source=String(s.parseInput?.character||'');
    if(/房产|住宅|住所|有.{0,12}(?:房子|别墅|住房)/.test(source))add({path:['protagonist','住所'],label:'主角 · 已声明的住所',rule:'list'});
    if(/(?:有自己的|拥有|创办|经营|成立).{0,12}(?:公司|企业|工作室)/.test(source))add({path:['protagonist','事业'],label:'主角 · 已声明的事业',rule:'list'});
    const pair=source.match(/在([^，。；\n]{1,40}?)(?:均有|各有|都有)房产/);if(pair)for(const city of pair[1].split(/[、和与及]/).map(text).filter(Boolean))add({path:['protagonist','住所'],field:'home:'+city,label:'主角 · '+city+'的独立住所',test:()=>rows(s.protagonist?.住所).some(h=>(name(h)+text(h.位置)).includes(city))});
    for(const m of source.matchAll(/拥有(?:一[把辆台件只本部套张]|[两三四五六七八九十]+[把辆台件只本部套张])?([^，。；\n]+)/g)){const item=text(m[1]);if(!item||/公司|企业|房产|住宅|能力|技能|系统|法术/.test(item))continue;add({path:['protagonist','物品'],field:'item:'+item,label:'主角 · 已声明物品：'+item,test:()=>rows(s.protagonist?.物品).some(x=>name(x)&&(name(x).includes(item)||item.includes(name(x))))});}
    const relationText=(text(s.protagonist?.人物关系)+' '+source).replace(/(?:没有|不涉及|未提及)[^，。；]{0,5}(?:父母|父亲|母亲|妻子|丈夫|兄弟姐妹)/g,'');
    const relations=new Set(/父母/.test(relationText)?['父亲','母亲']:[]);for(const r of ['父亲','母亲','妻子','丈夫','妹妹','姐姐','弟弟','哥哥','儿子','女儿','师父'])if(relationText.includes(r))relations.add(r);
    for(const note of [...rows(s.simulation?.creation?.warnings),...rows(s.simulation?.creation?.issues)]){const match=String(note).match(/^缺少关联角色资料：(.+)$/);if(match)relations.add(match[1]);}
    for(const relation of relations)add({path:['npcs'],field:'relation:'+relation,label:'关联角色 · '+relation,test:()=>rows(s.npcs).some(n=>text(n?.与主角关系||n?.关系).includes(relation))});
    for(const collection of ['实体资产','虚拟资产'])rows(s[collection]).forEach((row,index)=>{
      const root=[collection,index],t=target([collection],row,index),title=name(row)||collection+' '+(index+1);field(root,t,['名称','名字','name'],title);
      const business=/公司|企业|工作室|商行|商店|工厂|店铺/.test(text(row?.类型||row?.类别)||name(row))&&!/厂房|门面|办公楼/.test(text(row?.类型||row?.类别));
      for(const keys of collection==='虚拟资产'?virtualFields:[...assetFields,...(business?businessFields:[])])field(root,t,keys,title);
    });
    if(s.simulation?.enabled&&s.simulation?.settings?.managementEnabled)rows(s.simulation?.management?.units).forEach((row,index)=>{
      const root=['simulation','management','units',index],t=target(['simulation','management','units'],row,index),title=name(row)||'经营单位 '+(index+1);field(root,t,['name'],title);field(root,t,['description'],title);
      for(const [key,label]of [['businessScope','业务范围'],['organization','组织与规模'],['development','发展情况'],['operatingStatus','经营状态']])add({path:[...root,'businessProfile',key],target:t,field:key,label:title+' · '+label,group:title});
    });
    // 删除对象不等于补齐其字段；不让后移的同索引条目冒领旧状态。
    for(const old of before)if(!used.has(old.id))checks.push({...old,status:'removed'});
    return checks;
  }
  function has(s){const info=s?.simulation?.creation||{};return info.checklistOrigin==='parsed'||Number(info.version)>0||typeof info.basis==='string'||info.ready===true;}
  function read(s,previous){if(!has(s))return [];const info=s?.simulation?.creation||{};const baseline=Array.isArray(previous)?previous:info.checklistSchema===2?rows(info.checklist):inspect(s,[]);const ids=new Set(baseline.map(x=>x.id));return inspect(s,baseline).filter(x=>ids.has(x.id));}
  function attach(s,previous,options={}){const parsed=options.seed===true||has(s);const checks=options.seed===true?inspect(s,[]).filter(x=>x.status==='missing'):read(s,previous);s.simulation={...(s.simulation||{}),creation:{...(s.simulation?.creation||{}),blocking:false,checklistSchema:2,checklistOrigin:parsed?'parsed':'unparsed',checklist:checks}};return checks;}
  function notices(info){return [...new Set([...rows(info?.warnings),...rows(info?.issues)])].filter(x=>typeof x==='string').filter(x=>/返回|工具|解析失败|type|未提交|未读取|已停止|保存失败/.test(x)||!/(主角缺少姓名|关联角色缺少姓名|姓名重复|缺.*(?:表性格|里性格|背景)|已声明.*(?:住所|事业|物品)|事业条目缺少名称|条目缺少名称|独立住所|缺少完整的|缺少名称或位置|缺少关联角色资料|普通衣着|服装|槽位|缺少单位简介|业务范围|组织与规模|发展情况|经营状态)/.test(x));}
  return {inspect,read,has,attach,notices,filled};
}
export const {inspect:buildCreationChecklist,read:readCreationChecklist,has:hasCreationChecklist,attach:refreshCreationChecklist,notices:creationProcessNotices}=createCreationChecklist();
