const rgOwn = (o, k) => o != null && Object.prototype.hasOwnProperty.call(o, k);
const rgClone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const rgText = v => typeof v === 'string' ? v.trim() : '';
const rgRoots = new Set(['protagonist', 'npcs', 'relationships']);
function rgPath(value) {
  let p = value;
  if (typeof p === 'string') {
    try { p = p.trim().startsWith('[') ? JSON.parse(p) : p.startsWith('/') ? p.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~')) : p.replace(/\[(\d+)\]/g, '.$1').split('.'); } catch { return null; }
  }
  if (!Array.isArray(p) || !p.length) return null;
  p = p.map(x => typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x);
  if (!rgRoots.has(p[0]) || p.some(x => typeof x === 'number' ? !Number.isSafeInteger(x) || x < 0 || x > 100000 : typeof x !== 'string' || !x || ['__proto__', 'prototype', 'constructor'].includes(x))) return null;
  return p;
}
function rgSet(root, path, value, remove) {
  let at = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!rgOwn(at, key) || at[key] == null || typeof at[key] !== 'object') {
      if (remove) return;
      at[key] = typeof path[i + 1] === 'number' ? [] : {};
    }
    at = at[key];
  }
  const key = path.at(-1);
  if (remove) {
    if (Array.isArray(at) && typeof key === 'number' && key < at.length) at.splice(key, 1);
    else delete at[key];
  } else at[key] = rgClone(value);
}
export function relationTurns(state) {
  return (Array.isArray(state?.transcript) ? state.transcript : []).filter(t => t && (!t.role || t.role === 'assistant') && Number.isFinite(Number(t.seq))).slice().sort((a, b) => Number(a.seq) - Number(b.seq));
}
export function relationSnapshot(state, round = -1) {
  const frame = { protagonist: rgClone(state?.protagonist || {}), npcs: rgClone(state?.npcs || []), relationships: rgClone(state?.relationships || []) };
  const turns = relationTurns(state), max = turns.length ? Number(turns.at(-1).seq) : 0;
  const latest = round == null || !Number.isFinite(Number(round)) || Number(round) < 0 || Number(round) >= max;
  const selected = latest ? max : Math.max(0, Math.floor(Number(round)));
  let uncertain = 0;
  if (!latest) for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]; if (Number(turn.seq) <= selected) continue;
    const diffs = Array.isArray(turn.diffs) ? turn.diffs : [];
    for (let j = diffs.length - 1; j >= 0; j--) {
      const d = diffs[j], path = rgPath(d?.path); if (!path) continue;
      if (d._had === false) {
        rgSet(frame, path, undefined, true);
        const missing = rgPath(d._missing); if (missing) rgSet(frame, missing, undefined, true);
      } else if (d._had === true) rgSet(frame, path, d._prev, false);
      else if (rgOwn(d, 'from')) rgSet(frame, path, d.from, d.from === undefined);
      else { rgSet(frame, path, undefined, true); uncertain++; }
    }
  }
  frame.protagonist = frame.protagonist && typeof frame.protagonist === 'object' ? frame.protagonist : {};
  frame.npcs = Array.isArray(frame.npcs) ? frame.npcs.filter(n => n && typeof n === 'object') : [];
  frame.relationships = Array.isArray(frame.relationships) ? frame.relationships.filter(n => n && typeof n === 'object') : [];
  return { ...frame, round: selected, latest, uncertain };
}
function rgLabel(value) {
  const s = rgText(value);
  return !s || /^(无|暂无|没有)(?:$|[（(，,。；;])/.test(s) || ['未知', '未记录', '不详', '待补'].includes(s) ? '' : s;
}
const rgRoles = ['父亲', '母亲', '爸爸', '妈妈', '丈夫', '妻子', '哥哥', '姐姐', '弟弟', '妹妹', '儿子', '女儿', '外孙女', '外孙', '孙女', '孙子', '祖父', '祖母', '外公', '外婆', '爷爷', '奶奶', '男友', '女友', '前夫', '前妻', '未婚夫', '未婚妻', '同桌', '室友', '同学', '同事', '朋友', '老师', '学生', '助理', '经纪人'];
const rgEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function relationNetwork(frame) {
  const nodes = [], edges = [], names = new Map(), ids = new Map(), edgeMap = new Map();
  function index(map, key, node) { if (!key) return; map.set(key, map.has(key) ? null : node); }
  function addNode(actor, kind, i) {
    const name = rgText(actor?.姓名 || actor?.name), actorId = rgText(actor?.actorId);
    if (!name) return null;
    const id = kind === 'protagonist' ? 'protagonist' : actorId ? 'actor:' + actorId : kind + ':' + encodeURIComponent(name) + ':' + i;
    const node = { id, name, actorId, kind, identity: rgText(actor.身份), actor };
    nodes.push(node); index(names, name, node); index(ids, actorId, node); return node;
  }
  const protagonist = addNode({ ...frame.protagonist, 姓名: rgText(frame.protagonist?.姓名) || '主角' }, 'protagonist', 0);
  (frame.npcs || []).forEach((n, i) => addNode(n, 'npc', i));
  function resolve(v, allowRecord = false) {
    if (v && typeof v === 'object') { const key = rgText(v.actorId || v.id); if (key && ids.has(key)) return ids.get(key); v = v.姓名 || v.name || v.对象; }
    const key = rgText(v); if (!key) return null;
    if (ids.has(key)) return ids.get(key);
    if (names.has(key)) return names.get(key);
    if (key === '主角' || key === '玩家' || key === 'protagonist') return protagonist;
    return allowRecord ? addNode({ 姓名: key }, 'relation', nodes.length) : null;
  }
  function connect(source, target, label, evidence = '') {
    label = rgLabel(label); if (!source || !target || source.id === target.id || !label) return;
    const key = [source.id, target.id].sort().join('\u0000');
    let edge = edgeMap.get(key);
    if (!edge) { edge = { id: key, source: source.id, target: target.id, label, assertions: [] }; edgeMap.set(key, edge); edges.push(edge); }
    if (!edge.assertions.some(a => a.source === source.id && a.target === target.id && a.label === label)) edge.assertions.push({ source: source.id, target: target.id, sourceName: source.name, targetName: target.name, label, evidence });
  }
  const rootRelations = Array.isArray(frame.relationships) ? frame.relationships : [];
  for (const r of rootRelations) {
    const rawSource = r.主体 ?? r.sourceActorId ?? r.source ?? r.from;
    const source = rawSource == null || rawSource === '' ? protagonist : resolve(rawSource);
    const label = r.关系 ?? r.relation ?? r.type;
    const target = resolve(r.targetActorId ?? r.对象 ?? r.target ?? r.to, Boolean(source && rgLabel(label)));
    connect(source, target, label, rgText(r.备注 || r.当前状况));
  }
  for (const node of nodes.slice()) {
    if (node.kind === 'npc') {
      const hasRoot = edges.some(e => e.assertions.some(a => a.source === protagonist.id && a.target === node.id));
      if (!hasRoot) connect(protagonist, node, node.actor.与主角关系);
    }
    for (const r of Array.isArray(node.actor.relationships) ? node.actor.relationships : Array.isArray(node.actor.人物关系) ? node.actor.人物关系 : []) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      connect(node, resolve(r.actorId || r.对象 || r.target), r.关系 || r.relation);
    }
    for (const role of rgRoles) {
      const value = node.actor[role];
      for (const ref of Array.isArray(value) ? value : value ? [value] : []) connect(node, resolve(ref), role);
    }
    for (const role of ['配偶', '子女']) for (const ref of Array.isArray(node.actor[role]) ? node.actor[role] : node.actor[role] ? [node.actor[role]] : []) connect(node, resolve(ref), role);
  }
  // 只识别档案里明确点名的亲属/同住等短语；不按同姓、同班、共同出场推断。
  const people = nodes.filter(n => n.kind !== 'relation'), rolePattern = rgRoles.slice().sort((a, b) => b.length - a.length).join('|');
  for (const owner of people) for (const field of ['身份', '背景', '与主角关系']) {
    const text = rgText(owner.actor[field]); if (!text) continue;
    for (const other of people) {
      if (owner.id === other.id || names.get(other.name) !== other) continue;
      const nm = rgEscape(other.name);
      const before = new RegExp('(?:^|[，,。；;、：:\\s（(]|与|和|生下|有了|育有)(?:其|他的|她的)?(' + rolePattern + ')\\s*' + nm + '(?=$|[，,。；;、：:\\s）)都是为与和的])', 'g');
      for (const m of text.matchAll(before)) {
        const clause = text.slice(Math.max(0, text.lastIndexOf('。', m.index) + 1), m.index + m[0].length);
        if (/不是|并非|如果|假如|传闻|据说|饰演|扮演|不再/.test(clause)) continue;
        connect(owner, other, m[1], m[0]);
      }
      const after = new RegExp(nm + '(?:的)?(' + rolePattern + ')(?=$|[，,。；;、\\s（）()])', 'g');
      for (const m of text.matchAll(after)) {
        const prefix = text.slice(Math.max(0, text.lastIndexOf('。', m.index) + 1), m.index);
        if (/不是|并非|如果|假如|传闻|据说|饰演|扮演|不再/.test(prefix)) continue;
        connect(other, owner, m[1], m[0]);
      }
      for (const m of text.matchAll(new RegExp(nm + '(?:的)?同宿舍(?:上铺|下铺|室友|同学)?', 'g'))) {
        const clause = text.slice(Math.max(0, text.lastIndexOf('。', m.index) + 1), m.index + m[0].length);
        if (!/不是|并非|如果|假如|传闻|据说|饰演|扮演|不再/.test(clause)) connect(other, owner, '室友', field);
      }
    }
  }
  return { nodes, edges, round: frame.round, latest: frame.latest, uncertain: frame.uncertain || 0 };
}
export function relationLayout(graph) {
  const n = graph.nodes.length, width = Math.max(840, Math.ceil(Math.sqrt(n || 1) * 155)), height = Math.max(600, Math.ceil(Math.sqrt(n || 1) * 112));
  const nodes = graph.nodes.map((v, i) => { let hash = 2166136261; for (const c of v.id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619); const angle = i * 2.399963229728653, radius = Math.sqrt((i + 1) / Math.max(1, n)); return { ...v, x: width / 2 + Math.cos(angle) * width * .36 * radius, y: height / 2 + Math.sin(angle) * height * .34 * radius, seed: hash >>> 0 }; });
  const index = new Map(nodes.map((node, i) => [node.id, i])), forces = nodes.map(() => ({ x: 0, y: 0 }));
  for (let iter = 0; iter < 160; iter++) {
    forces.forEach(f => { f.x = 0; f.y = 0; });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.max(1, Math.hypot(dx, dy));
      if (d < 2) { dx = ((nodes[i].seed % 13) + 1) / 7; dy = 1; d = Math.hypot(dx, dy); }
      const force = 2200 / (d * d) + (d < 80 ? (80 - d) * .19 : 0), fx = dx / d * force, fy = dy / d * force;
      forces[i].x += fx; forces[i].y += fy; forces[j].x -= fx; forces[j].y -= fy;
    }
    for (const edge of graph.edges) {
      const i = index.get(edge.source), j = index.get(edge.target); if (i == null || j == null) continue;
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d = Math.max(1, Math.hypot(dx, dy)), force = (d - 155) * .018;
      forces[i].x += dx / d * force; forces[i].y += dy / d * force; forces[j].x -= dx / d * force; forces[j].y -= dy / d * force;
    }
    for (let i = 0; i < n; i++) {
      const f = forces[i], step = .8 * (1 - iter / 190);
      f.x += (width / 2 - nodes[i].x) * .004; f.y += (height / 2 - nodes[i].y) * .004;
      nodes[i].x = Math.max(60, Math.min(width - 60, nodes[i].x + Math.max(-12, Math.min(12, f.x)) * step));
      nodes[i].y = Math.max(55, Math.min(height - 55, nodes[i].y + Math.max(-12, Math.min(12, f.y)) * step));
    }
  }
  return { nodes, edges: graph.edges, width, height };
}
export function relationChangedTurns(state) {
  return relationTurns(state).filter(t => (t.diffs || []).some(d => { const p = rgPath(d?.path); return p && (p[0] === 'relationships' || p[0] === 'npcs' && (p.length <= 2 || ['与主角关系', '姓名', '身份', '背景', '人物关系', 'relationships', '配偶', '子女'].includes(p[2]))); })).map(t => Number(t.seq));
}
