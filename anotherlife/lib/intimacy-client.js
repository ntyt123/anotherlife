export function createIntimacyPanel(React, { intimacyEnabled, intimacySummary }) {
  const h = React.createElement;
  const css = `.sim-intimacy-panel{margin:16px 0;border:1px solid var(--sim-bd,#dfd5c8);border-radius:12px;overflow:hidden;color:var(--sim-t,inherit)}.sim-intimacy-head{padding:12px 16px;background:var(--sim-bg2,#f6f1e9);font-weight:700}.sim-intimacy-content{padding:14px 16px}.sim-intimacy-stats{display:flex;flex-wrap:wrap;gap:8px 20px;margin-bottom:12px;font-size:var(--sim-fs-3,14px)}.sim-intimacy-stats strong{color:var(--sim-accent,#8b3a2e)}.sim-intimacy-card{border-top:1px solid var(--sim-bd,#dfd5c8);padding:10px 0}.sim-intimacy-card>summary{display:flex;align-items:center;gap:12px;cursor:pointer;line-height:1.6}.sim-intimacy-name{min-width:0;max-width:14em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:650}.sim-intimacy-count{margin-left:auto;white-space:nowrap;font-size:var(--sim-fs-2,12px);opacity:.7}.sim-intimacy-types{display:flex;flex-wrap:wrap;gap:6px;margin:9px 0}.sim-intimacy-chip{border:1px solid var(--sim-bd,#dfd5c8);border-radius:6px;padding:2px 7px;font-size:var(--sim-fs-2,12px)}.sim-intimacy-dates{font-size:var(--sim-fs-2,12px);opacity:.7;line-height:1.8;margin:8px 0}.sim-intimacy-records{list-style:none;padding:0;margin:10px 0 0}.sim-intimacy-records li{padding:9px 0;border-top:1px dashed var(--sim-bd,#dfd5c8);font-size:var(--sim-fs-3,14px);line-height:1.8;overflow-wrap:anywhere}.sim-intimacy-records time{font-weight:600}.sim-intimacy-records p{margin:0;text-indent:0}.sim-intimacy-source{opacity:.65;font-size:var(--sim-fs-2,12px)}.sim-intimacy-empty{opacity:.65;margin:0;text-indent:0}.sim-intimacy-since{font-size:var(--sim-fs-2,12px);opacity:.6;margin-top:10px}`;
  return function IntimacyPanel({ state }) {
    if (state?.phase !== 'play' || !intimacyEnabled(state)) return null;
    const data = intimacySummary(state);
    return h('section', { className: 'sim-intimacy-panel', 'aria-label': '性经验' },
      h('style', null, css), h('div', { className: 'sim-intimacy-head' }, '性经验'),
      h('div', { className: 'sim-intimacy-content' },
        h('div', { className: 'sim-intimacy-stats' }, h('span', null, '已记录对象 ', h('strong', null, data.partnerCount), ' 人'), h('span', null, '累计 ', h('strong', null, data.sessions), ' 场'), data.last ? h('span', null, '最近一次 ', data.last) : null),
        data.partners.length ? data.partners.map(partner => h('details', { className: 'sim-intimacy-card', key: partner.id },
          h('summary', null, h('span', { className: 'sim-intimacy-name', title: partner.name }, partner.name || '未命名对象'), h('span', { className: 'sim-intimacy-count' }, partner.sessions + '场')),
          h('div', { className: 'sim-intimacy-types' }, Object.entries(partner.acts).map(([type, count]) => h('span', { className: 'sim-intimacy-chip', key: type }, type + ' ' + count + '次')), partner.unknownActs ? h('span', { className: 'sim-intimacy-chip' }, partner.unknownActs + '项次数未明确') : null),
          h('div', { className: 'sim-intimacy-dates' }, h('div', null, '首次记录 ', partner.first), h('div', null, '最近记录 ', partner.last)),
          h('ol', { className: 'sim-intimacy-records' }, [...partner.records].reverse().map(event => {
            const own = event.partners.find(p => p.id === partner.id);
            return h('li', { key: event.id }, h('time', null, event.time || ''), event.location ? h('span', null, ' · ' + event.location) : null,
              h('p', null, own.acts.map(act => act.type + (act.countKnown ? ' ' + act.count + '次' : ' · 次数未明确')).join('、')),
              h('div', { className: 'sim-intimacy-source' }, '来源第' + event.sourceSeq + '轮' + (event.lastSeq !== event.sourceSeq ? ' · 最近更新第' + event.lastSeq + '轮' : '')));
          })))) : h('p', { className: 'sim-intimacy-empty' }, '还没有记录。'),
        data.sinceSeq != null ? h('div', { className: 'sim-intimacy-since' }, '记录起于第' + data.sinceSeq + '轮') : null));
  };
}
