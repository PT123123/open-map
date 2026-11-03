// 通勤干线图构建：同线路站点按地理位置排序相邻连接（近似大巴/城际沿干线走）
// 输出 transit/tgraph.js：window.TRAFFIC_GRAPH = { nodes(站点引用 stations 数组下标), adj(邻接表), routes }
'use strict';
const fs = require('fs');
const H = 'C:/Users/ted/Desktop/housing';
const OUTS = [
  'C:/Users/ted/Desktop/map/web',
  'C:/Users/ted/Desktop/map/mobile',
  'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets',
];

const raw = fs.readFileSync(H + '/traffic/data/stations.data.js', 'utf8');
const ST = JSON.parse(raw.slice(raw.search(/window\.STATIONS\s*=\s*\[/), raw.lastIndexOf(']') + 1).slice(raw.slice(raw.search(/window\.STATIONS\s*=\s*\[/)).indexOf('[')));
const valid = ST
  .filter((s) => s.lat && s.lon && s.confidence !== 'placeholder')
  .map((s, j) => ({ ...s, _j: j }));   // _j = 过滤后数组下标（与 STATIONS_MAP.stations 一致）
console.log('有效站点:', valid.length);

// 干线速度（km/h）：按线路名推断 —— 城际大巴统一 45
const SPEED = 45;

// 站点对之间距离（米）
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180));

// 收集线路 → 有效站点下标（过滤后序号）
const routes = new Map(); // route -> Set(过滤后序号)
for (const s of valid) {
  for (const r of s.routes || []) {
    if (!routes.has(r)) routes.set(r, new Set());
    routes.get(r).add(s._j);
  }
}

// 建图：邻接表 u -> Map(v -> {w, route})
const adj = new Map(); // u -> Map(v -> {w, route})
const addEdge = (u, v, meters, route) => {
  const w = Math.round((meters / (SPEED * 1000)) * 3600);
  if (!adj.has(u)) adj.set(u, new Map());
  if (!adj.has(v)) adj.set(v, new Map());
  const cur = adj.get(u).get(v);
  if (!cur || w < cur.w) adj.get(u).set(v, { w, route });
  const cur2 = adj.get(v).get(u);
  if (!cur2 || w < cur2.w) adj.get(v).set(u, { w, route });
};

let edgeCount = 0;
for (const [route, set] of routes) {
  const byJ = new Map([...set].map((j) => [j, valid[j]]));
  if (byJ.size < 2) continue;
  const pts = [...byJ.values()];
  // 贪心最近邻链（从最西南端点开始，每次连最近的未访问点）——近似线路顺序
  const remaining = new Set([...byJ.keys()]);
  let cur = pts.reduce((m, p) => (p.lon + p.lat / 3 < m.lon + m.lat / 3 ? p : m), pts[0]);
  remaining.delete(cur._j);
  while (remaining.size) {
    let best = null, bestD = Infinity;
    for (const j of remaining) {
      const p = byJ.get(j);
      const d = dist(cur, p);
      if (d < bestD) { bestD = d; best = p; }
    }
    // 限制相邻连接距离上限 25km（防跳线）
    if (bestD > 25000) break;
    remaining.delete(best._j);
    addEdge(cur._j, best._j, bestD, route);
    edgeCount++;
    cur = best;
  }
}
console.log('线路:', routes.size, '条 | 干线边:', edgeCount, '条');

// 序列化：节点 = stations 数组下标
const nodes = [...adj.keys()].sort((a, b) => a - b);
const idxMap = new Map(nodes.map((u, i) => [u, i]));
const adjFlat = [];
for (const u of nodes) {
  const m2 = adj.get(u);
  for (const [v, info] of [...m2.entries()].sort((a, b) => a[0] - b[0])) {
    adjFlat.push(idxMap.get(u), idxMap.get(v), info.w, idxMap.get(v)); // from,to,w,to(冗余方便)
    adjFlat.pop();
    adjFlat.push(info.w);
  }
}
// 更简单：输出三平行数组 edgesF/edgesT/edgesW（CSR 由前端构建，节点少无需 CSR）
const eF = [], eT = [], eW = [];
for (const u of nodes) {
  for (const [v, info] of adj.get(u).entries()) {
    if (u < v) { eF.push(idxMap.get(u)); eT.push(idxMap.get(v)); eW.push(info.w); }
  }
}
// 无向图边只存 u<v 一次，前端双向用
const payload = {
  ver: 1,
  speed: SPEED,
  nodeCount: nodes.length,
  edgeCount: eF.length,
  nodes,               // 站点数组下标（过滤后序）
  stToNode: (() => { const a = new Int32Array(ST.length).fill(-1); nodes.forEach((stIdx, j) => { a[stIdx] = j; }); return Array.from(a); })(), // stations 下标 → 节点序
  eF, eT, eW,          // 无向边（时间秒）
};
for (const dir of OUTS) {
  fs.writeFileSync(dir + '/transit/tgraph.js', 'window.TRAFFIC_GRAPH=' + JSON.stringify(payload) + ';');
}
console.log('tgraph.js:', nodes.length, '节点,', eF.length, '无向边,', (JSON.stringify(payload).length / 1024).toFixed(0) + 'KB');
