export function createCPPanel(React) {
  const h = React.createElement;
  return function CPPanel({ state, onAction, renderFace }) {
    const [sort, setSort] = React.useState('recent');
    const [pinned, setPinned] = React.useState([]);
    const [all, setAll] = React.useState(false);
    if (state?.protagonist?.是否艺人 !== true) return null;
    const me = state.protagonist, pairs = Array.isArray(me.cpState?.pairs) ? me.cpState.pairs : [];
    const events = p => Array.isArray(p.events) ? p.events : [];
    const lastSeq = [...(state.transcript || [])].reverse().find(t => t.role === 'assistant')?.seq;
    const num = n => Number(n || 0).toLocaleString('zh-CN');
    const sign = n => (n > 0 ? '+' : '') + num(n);
    const delta = p => events(p).flatMap(e => e.changes || [e]).filter(e => e.seq === lastSeq).reduce((n,e) => n + Number(e.delta || 0), 0);
    const order = pairs.slice().sort((a,b) => (Number(pinned.includes(b.id))-Number(pinned.includes(a.id))) || (sort==='count'?b.count-a.count:sort==='heat'?b.heat-a.heat:Number(b.updatedSeq||0)-Number(a.updatedSeq||0)));
    const latest = pairs.flatMap(p => events(p).map(e => ({p,e}))).sort((a,b)=>b.e.seq-a.e.seq)[0];
    const meter = (label,value) => h('div',{className:'sim-cp-meter',key:label},h('span',null,label),h('progress',{max:100,value:Number(value)||0,'aria-label':label}),h('span',null,num(value)));
    const chart = p => {
      const points = events(p).flatMap(e => e.changes || [e]).slice().sort((a,b)=>a.seq-b.seq); const rows = all ? points : points.slice(-10); if(!rows.length)return null;
      const max=Math.max(1,...rows.map(e=>e.count)),min=Math.min(...rows.map(e=>e.count));
      const xy = (e,i) => [12+(rows.length<2?0:i*276/(rows.length-1)),64-(e.count-min)*50/Math.max(1,max-min)];
      return h('div',{className:'sim-cp-chart'},h('div',{className:'sim-hint'},'人数趋势 · '+(all?'全部活动':'最近10次变化')),h('svg',{viewBox:'0 0 300 78',role:'img','aria-label':p.name+'人数趋势'},h('polyline',{points:rows.map((e,i)=>xy(e,i).join(',')).join(' '),fill:'none',stroke:'var(--sim-ac)',strokeWidth:2}),rows.map((e,i)=>{const [cx,cy]=xy(e,i);return h('circle',{key:e.id,cx,cy,r:3,fill:'var(--sim-ac)'},h('title',null,[e.date,e.title,num(e.count),sign(e.delta)].filter(Boolean).join(' · ')));})),h('div',{className:'sim-cp-chart-label'},h('span',null,rows[0].date||'成立'),h('span',null,rows.at(-1).date||'最近活动')));
    };
    return h('section',{className:'sim-panel sim-cp'},h('div',{className:'sim-panel-h'},'CP局势'),!pairs.length?h('div',{className:'sim-hint'},'正文尚未出现与主角相关的CP党。'):h(React.Fragment,null,
      h('div',{className:'sim-cp-summary'},h('span',null,pairs.length+' 对CP'),h('span',null,'本轮 '+sign(pairs.reduce((n,p)=>n+delta(p),0))),latest?h('span',null,'焦点：'+latest.p.name):null),
      h('div',{className:'sim-cp-tools'},h('label',null,'排序 ',h('select',{value:sort,onChange:e=>setSort(e.target.value)},h('option',{value:'recent'},'最近活动'),h('option',{value:'count'},'人数'),h('option',{value:'heat'},'热度'))),h('label',null,h('input',{type:'checkbox',checked:all,onChange:e=>setAll(e.target.checked)}),' 全部活动')),
      h('div',{className:'sim-cp-grid'},order.map(p=>h('article',{className:'sim-cp-card',key:p.id},
        h('div',{className:'sim-cp-heading'},renderFace?h('div',{className:'sim-cp-faces'},renderFace(me.姓名,true),renderFace(p.partner,false)):null,h('strong',null,p.name),h('span',{className:'sim-tag'},p.status||'初生'),h('button',{className:'sim-ibtn',title:pinned.includes(p.id)?'取消置顶':'置顶',onClick:()=>setPinned(old=>old.includes(p.id)?old.filter(x=>x!==p.id):old.concat(p.id))},pinned.includes(p.id)?'★':'☆')),
        h('div',{className:'sim-cp-numbers'},h('span',{title:p.countKnown?(p.countSource==='estimated'?'根据已发生事件估算':'来自正文人数记录'):'尚未返回人数估算'},'支持人数 ',h('b',null,p.countKnown?num(p.count):'—')),h('span',null,'本轮 ',h('b',null,sign(delta(p))))),
        meter('热度',p.heat),p.origin?h('div',{className:'sim-hint'},p.origin):null,
        events(p).length?h('div',{className:'sim-cp-last'},'最近：'+events(p).slice().sort((a,b)=>b.seq-a.seq)[0].title):null,
        h('details',null,h('summary',null,'趋势、活动与讨论'),meter('凝聚力',p.cohesion),meter('争议度',p.controversy),h('div',{className:'sim-hint'},'成立：'+(p.createdAt||'—')+' · 峰值 '+num(p.peak)),chart(p),
          (all?events(p):events(p).slice(-10)).slice().reverse().map(e=>h('section',{className:'sim-cp-event',key:e.id},h('strong',null,e.title),h('div',{className:'sim-hint'},[e.date,e.source==='weibo'?'微博互动':'正文事件','人数 '+sign(e.delta),e.estimated?'估算':''].filter(Boolean).join(' · ')),e.evidence?h('details',null,h('summary',null,'查看依据'),h('blockquote',null,e.evidence),h('small',null,'正文序号 '+e.seq)):null,
            (e.topics||[]).map(t=>h('div',{className:'sim-cp-topic',key:t.id},h('b',null,'#'+t.title+'#'),(t.comments||[]).map((c,i)=>h('p',{key:i},h('span',{className:'sim-tag'},c.stance||'网友'),' '+c.text))))))
        ),
        onAction?h('details',{className:'sim-cp-actions'},h('summary',null,'公开互动选择'),['与'+p.partner+'及双方团队讨论一次联合宣传。','在公开回应中强调与'+p.partner+'的作品合作，不替双方确认私人关系。','与团队讨论减少与'+p.partner+'的捆绑宣传。'].map((action,i)=>h('button',{className:'sim-btn',key:i,onClick:()=>onAction(action)},['商议联合宣传','强调作品合作','商议减少捆绑'][i]))):null
      )))
    ));
  };
}
