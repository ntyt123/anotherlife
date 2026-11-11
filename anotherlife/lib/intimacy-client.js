import { createViewFolds } from './view-folds.js';

export function createIntimacyPanel(React, { intimacyEnabled, intimacySummary, foldProps = createViewFolds() }) {
  const h = React.createElement;
  const css = `.sim-intimacy-panel{margin:16px 0;border:1px solid var(--sim-bd,#dfd5c8);border-radius:12px;overflow:hidden;color:var(--sim-t,inherit)}.sim-intimacy-head{padding:14px 18px;font-weight:700;font-size:var(--sim-fs-4,17px);background:var(--sim-bg2,#f8f5ef)}.sim-intimacy-panel>summary,.sim-intimacy-card>summary,.sim-intimacy-older>summary{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none}.sim-intimacy-panel>summary::-webkit-details-marker,.sim-intimacy-card>summary::-webkit-details-marker,.sim-intimacy-older>summary::-webkit-details-marker{display:none}.sim-intimacy-panel>summary::before,.sim-intimacy-card>summary::before,.sim-intimacy-older>summary::before{content:'▸';display:inline-block;flex:0 0 auto;opacity:.55;transition:transform .12s}.sim-intimacy-panel[open]>summary::before,.sim-intimacy-card[open]>summary::before,.sim-intimacy-older[open]>summary::before{transform:rotate(90deg)}.sim-intimacy-content{padding:16px 18px}.sim-intimacy-card{border:1px solid var(--sim-bd,#dfd5c8);border-radius:10px;overflow:hidden;margin:0 0 14px}.sim-intimacy-card:last-child{margin-bottom:0}.sim-intimacy-card>summary{padding:15px 18px;line-height:1.6}.sim-intimacy-name{min-width:0;max-width:18em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:var(--sim-fs-4,17px);font-weight:700}.sim-intimacy-count{margin-left:auto;white-space:nowrap;color:var(--sim-accent,#8b4c3c);font-size:var(--sim-fs-3,14px)}.sim-intimacy-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:var(--sim-fs-3,14px);line-height:1.8}.sim-intimacy-table th{font-weight:500;background:var(--sim-bg2,#f8f5ef);text-align:left;opacity:.75}.sim-intimacy-table th,.sim-intimacy-table td{padding:12px 18px;border-top:1px solid var(--sim-bd,#dfd5c8);vertical-align:top;overflow-wrap:anywhere}.sim-intimacy-table th:nth-child(1){width:32%}.sim-intimacy-table th:nth-child(2){width:30%}.sim-intimacy-chip{display:inline-block;margin:2px 6px 2px 0;border:1px solid var(--sim-bd,#dfd5c8);border-radius:6px;padding:2px 8px;font-size:var(--sim-fs-2,12px);line-height:1.7}.sim-intimacy-older{border-top:1px solid var(--sim-bd,#dfd5c8)}.sim-intimacy-older>summary{padding:10px 18px;font-size:var(--sim-fs-2,12px);opacity:.7}.sim-intimacy-empty{opacity:.65;margin:0;text-indent:0}.sim-intimacy-panel summary:focus-visible{outline:2px solid var(--sim-accent,#8b4c3c);outline-offset:-3px}@media(max-width:640px){.sim-intimacy-content{padding:10px}.sim-intimacy-card>summary{padding:12px}.sim-intimacy-table thead{display:none}.sim-intimacy-table,.sim-intimacy-table tbody,.sim-intimacy-table tr,.sim-intimacy-table td{display:block;width:auto}.sim-intimacy-table tr{padding:8px 12px;border-top:1px solid var(--sim-bd,#dfd5c8)}.sim-intimacy-table td{display:grid;grid-template-columns:3.5em minmax(0,1fr);gap:8px;padding:4px 0;border:0}.sim-intimacy-table td::before{content:attr(data-label);opacity:.55}.sim-intimacy-card .sim-intimacy-name{font-size:var(--sim-fs-3,15px)}}`;
  function recordsTable(records, partner) {
    return h('table', { className: 'sim-intimacy-table', 'aria-label': (partner.name || '未命名对象') + '的性经历' },
      h('thead', null, h('tr', null, ['时间', '地点', '性行为'].map(label => h('th', { key: label, scope: 'col' }, label)))),
      h('tbody', null, records.map(event => {
        const own = event.partners.find(p => p.id === partner.id);
        const start = event.time || '', end = event.lastTime || '';
        const when = start && end && start !== end ? start + ' 至 ' + end : start || end || '—';
        return h('tr', { key: event.id },
          h('td', { 'data-label': '时间' }, h('time', null, when)),
          h('td', { 'data-label': '地点' }, event.location || '—'),
          h('td', { 'data-label': '性行为' }, h('div', null, (own?.acts || []).map(act => h('span', { className: 'sim-intimacy-chip', key: act.type }, act.type + (act.countKnown ? ' ' + act.count + '次' : ' · 次数未明确'))))));
      })));
  }
  return function IntimacyPanel({ state, gameId }) {
    if (state?.phase !== 'play' || !intimacyEnabled(state)) return null;
    const data = intimacySummary(state), scope = state.gameId || gameId || '';
    return h('details', { className: 'sim-intimacy-panel', 'aria-label': '性经历', key: 'intimacy:' + scope, ...foldProps(scope, 'intimacy', true) },
      h('summary', { className: 'sim-intimacy-head' }, '性经历'), h('style', null, css),
      h('div', { className: 'sim-intimacy-content' }, data.partners.length ? data.partners.map((partner, index) => {
        const records = [...partner.records].reverse().sort((a, b) => Number(b.lastSeq || b.sourceSeq || 0) - Number(a.lastSeq || a.sourceSeq || 0));
        return h('details', { className: 'sim-intimacy-card', key: partner.id, ...foldProps(scope, 'intimacy:partner:' + partner.id, index === 0) },
          h('summary', null, h('span', { className: 'sim-intimacy-name', title: partner.name }, partner.name || '未命名对象'), h('span', { className: 'sim-intimacy-count' }, '共' + partner.sessions + '次')),
          recordsTable(records.slice(0, 3), partner),
          records.length > 3 ? h('details', { className: 'sim-intimacy-older', ...foldProps(scope, 'intimacy:older:' + partner.id, false) },
            h('summary', null, '更早经历 · ' + (records.length - 3) + '次'), recordsTable(records.slice(3), partner)) : null);
      }) : h('p', { className: 'sim-intimacy-empty' }, '还没有记录。')));
  };
}
