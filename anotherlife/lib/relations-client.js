export function createRelationsPanel(React, { relationSnapshot, relationNetwork, relationLayout, relationTurns, relationChangedTurns }) {
  const h = React.createElement;
  const layouts = new Map();
  return function RelationsPanel({ state, round = -1, onRoundChange = () => {}, selectedId = '', onSelect = () => {}, zoom = 1, onZoom = () => {}, onOpenCurrent }) {
    const frame = relationSnapshot(state, round), graph = relationNetwork(frame), turns = relationTurns(state);
    const max = turns.length ? Number(turns.at(-1).seq) : 0, current = frame.round;
    const signature = JSON.stringify([graph.nodes.map(n => n.id), graph.edges.map(e => [e.source, e.target])]);
    let layout = layouts.get(signature);
    if (!layout) {
      const result = relationLayout(graph);
      layout = { width: result.width, height: result.height, nodes: result.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })) };
      layouts.set(signature, layout); if (layouts.size > 8) layouts.delete(layouts.keys().next().value);
    }
    const positions = new Map(layout.nodes.map(n => [n.id, n])), selected = graph.nodes.find(n => n.id === selectedId);
    const adjacent = new Set(selected ? [selected.id] : []);
    const related = selected ? graph.edges.filter(e => e.source === selected.id || e.target === selected.id) : [];
    related.forEach(e => { adjacent.add(e.source); adjacent.add(e.target); });
    const changes = [...new Set(relationChangedTurns(state))], prev = changes.filter(n => n < current).at(-1), next = changes.find(n => n > current);
    const switchRound = value => onRoundChange(Number(value) >= max ? -1 : Math.max(0, Number(value)));
    const scale = Math.max(.6, Math.min(2, Number(zoom) || 1));
    const facts = edge => edge.assertions.map(a => a.targetName + '是' + a.sourceName + '的' + a.label).join('\n');
    const lineElements = graph.edges.flatMap(edge => {
      const a = positions.get(edge.source), b = positions.get(edge.target); if (!a || !b) return [];
      const active = !selected || edge.source === selected.id || edge.target === selected.id;
      const color = /父|母|兄|妹|姐|弟|儿|女|妻|夫|亲/.test(edge.label) ? '#ac7997' : '#628fa6';
      return [h('g', { key: 'edge:' + edge.id, 'data-relation-source': edge.source, 'data-relation-target': edge.target, opacity: active ? .8 : .1 },
        h('title', null, facts(edge)),
        h('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, strokeWidth: selected && active ? 2.1 : 1.2 }),
        active && (selected || graph.edges.length <= 18) ? h('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 7, fill: color, fontSize: 11, textAnchor: 'middle', style: { paintOrder: 'stroke', stroke: 'var(--sim-bg, #fff)', strokeWidth: 3 } }, edge.label.length > 14 ? edge.label.slice(0, 13) + '…' : edge.label) : null)];
    });
    const nodeElements = graph.nodes.map(node => {
      const point = positions.get(node.id), active = !selected || adjacent.has(node.id), focused = selected?.id === node.id;
      const choose = () => onSelect(focused ? '' : node.id);
      return h('g', { key: 'node:' + node.id, 'data-relation-node': node.name, role: 'button', tabIndex: 0, 'aria-label': '查看' + node.name + '的关系', 'aria-pressed': Boolean(focused), style: { cursor: 'pointer', opacity: active ? 1 : .25 }, onClick: choose, onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault?.(); choose(); } } },
        h('title', null, node.name + (node.identity ? '\n' + node.identity : '')),
        h('circle', { cx: point.x, cy: point.y, r: focused ? 14 : node.kind === 'protagonist' ? 11 : 9, fill: focused ? '#386f91' : node.kind === 'protagonist' ? '#5a90ac' : '#91a8b4', stroke: focused ? '#285772' : 'transparent', strokeWidth: 3 }),
        h('text', { x: point.x, y: point.y + 29, fill: 'var(--sim-t1, #333)', fontSize: 13, fontWeight: focused || node.kind === 'protagonist' ? 700 : 500, textAnchor: 'middle' }, node.name.length > 8 ? node.name.slice(0, 7) + '…' : node.name));
    });
    return h('div', { className: 'sim-page sim-relation-network' },
      h('div', { className: 'sim-card' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'space-between' } },
          h('h3', { style: { margin: 0 } }, '人物关系网'),
          h('span', { className: 'sim-hint' }, graph.nodes.length + '个人物 · ' + graph.edges.length + '条关系')),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 } },
          h('span', null, frame.latest ? '现在 · 第' + max + '轮' : '第' + current + '轮'),
          h('input', { type: 'range', min: 0, max, step: 1, value: current, 'aria-label': '关系回溯', style: { flex: '1 1 200px' }, onChange: e => switchRound(e.target.value) }),
          h('button', { className: 'sim-btn mini', disabled: prev == null, onClick: () => switchRound(prev) }, '上一处变化'),
          h('button', { className: 'sim-btn mini', disabled: next == null, onClick: () => switchRound(next) }, '下一处变化'),
          !frame.latest ? h('button', { className: 'sim-btn mini', onClick: () => onRoundChange(-1) }, '回到现在') : null),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
          h('button', { className: 'sim-btn mini', 'aria-label': '缩小关系网', disabled: scale <= .6, onClick: () => onZoom(Math.max(.6, scale - .2)) }, '−'),
          h('button', { className: 'sim-btn mini', 'aria-label': '还原关系网缩放', onClick: () => onZoom(1) }, Math.round(scale * 100) + '%'),
          h('button', { className: 'sim-btn mini', 'aria-label': '放大关系网', disabled: scale >= 2, onClick: () => onZoom(Math.min(2, scale + .2)) }, '＋'),
          selected ? h('button', { className: 'sim-btn mini', onClick: () => onSelect('') }, '清除选择') : h('span', { className: 'sim-hint' }, '点击人物查看相关连线')),
        frame.uncertain ? h('div', { className: 'sim-hint', style: { marginTop: 8 } }, '部分旧记录缺少回退依据，历史关系可能不完整') : null,
        h('div', { className: 'sim-relation-canvas', style: { overflow: 'auto', maxHeight: '72vh', marginTop: 12, border: '1px solid rgba(110,140,160,.18)', borderRadius: 10 } },
          h('svg', { className: 'sim-relation-svg', role: 'img', 'aria-label': '人物关系网', width: Math.round(layout.width * scale), height: Math.round(layout.height * scale), viewBox: '0 0 ' + layout.width + ' ' + layout.height, style: { display: 'block' } }, lineElements, nodeElements)),
        selected ? h('section', { className: 'sim-relation-selection', style: { marginTop: 14, padding: 12, borderTop: '1px solid rgba(110,140,160,.18)' } },
          h('strong', null, selected.name),
          selected.identity ? h('div', { className: 'sim-hint', style: { marginTop: 4 } }, selected.identity) : null,
          related.length ? h('ul', { style: { margin: '10px 0', paddingLeft: 20, lineHeight: 1.9 } }, related.flatMap(edge => edge.assertions.map((a, i) => h('li', { key: edge.id + ':' + i }, a.targetName + '是' + a.sourceName + '的' + a.label)))) : h('div', { className: 'sim-hint', style: { marginTop: 8 } }, '尚无关系记录'),
          frame.latest && selected.kind === 'npc' && typeof onOpenCurrent === 'function' ? h('button', { className: 'sim-btn mini', onClick: () => onOpenCurrent(selected) }, '查看当前档案') : null) : null));
  };
}
