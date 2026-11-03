// 路网图构建：raw Overpass way → 压缩 CSR 图（base64 typed arrays）→ roads.js
// 图: 节点量化 1e-5°(≈1.1m) 合并；边含 距离/等级/限速/路名id/oneway
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/roads';
const OUTS = [
  'C:/Users/ted/Desktop/map/web',
  'C:/Users/ted/Desktop/map/mobile',
  'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets',
];

// 等级索引与默认限速（km/h）—— tertiary 用于莞惠边界衔接（8 类主干在边界处有缺口）
const CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'];
const SPEED = [100, 80, 60, 50, 40, 70, 60, 50, 40, 30];

const hav = (a, b) => {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

function main() {
  const files = fs.readdirSync(RAW).filter((f) => /^roads_.+\.json$/.test(f));
  if (!files.length) { console.error('无 roads_*.json'); process.exit(1); }

  // way id 去重（跨框重叠）
  const seenWay = new Set();
  // 节点合并
  const nodeIdx = new Map(); // 数字 key -> idx
  const nodeCoords = []; // [lat, lon] 扁平
  const getNode = (lat, lon) => {
    const key = Math.round(lat * 1e5) * 20000001 + Math.round(lon * 1e5);
    let i = nodeIdx.get(key);
    if (i === undefined) {
      i = nodeCoords.length / 2;
      nodeIdx.set(key, i);
      nodeCoords.push(lat, lon);
    }
    return i;
  };

  // 原始有向边: [from, to, dist, clsIdx, nameId]
  const arcF = [], arcT = [], arcD = [], arcC = [], arcN = [];
  const nameDict = []; const nameId = new Map([['', 65535]]);
  const getNameId = (n) => {
    if (!n) return 65535;
    let id = nameId.get(n);
    if (id === undefined) { id = nameDict.length; nameDict.push(n); nameId.set(n, id); }
    return id;
  };

  let ways = 0;
  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
    for (const el of data.elements || []) {
      if (el.type !== 'way' || !el.geometry) continue;
      if (seenWay.has(el.id)) continue;
      seenWay.add(el.id);
      const t = el.tags || {};
      const cls = CLASSES.indexOf(t.highway);
      if (cls < 0) continue;
      ways++;
      const nameIdv = getNameId(t.name || t.ref || '');
      // 限速覆盖
      let spd = SPEED[cls];
      const ms = parseInt(t.maxspeed, 10);
      if (!isNaN(ms) && ms >= 10 && ms <= 130) spd = ms;
      // oneway
      let dir = 0; // 0 双向 1 正向 -1 反向
      if (t.oneway === 'yes' || t.junction === 'roundabout') dir = 1;
      else if (t.oneway === '-1') dir = -1;
      const pts = el.geometry.filter(Boolean).map((g) => [g.lat, g.lon]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = getNode(pts[i][0], pts[i][1]);
        const b = getNode(pts[i + 1][0], pts[i + 1][1]);
        if (a === b) continue;
        const d = hav(pts[i], pts[i + 1]);
        if (d <= 0 || d > 30000) continue; // 异常边丢弃
        arcF.push(a); arcT.push(b); arcD.push(d); arcC.push(cls); arcN.push(nameIdv);
        if (dir === 0) { arcF.push(b); arcT.push(a); arcD.push(d); arcC.push(cls); arcN.push(nameIdv); }
        else if (dir === -1) { // 反向：覆盖为 to->from
          arcF[arcF.length - 1] = b; arcT[arcT.length - 1] = a;
        }
      }
    }
    console.log(f, '处理完成 (累计 ways=' + ways + ', 节点=' + nodeCoords.length / 2 + ', 有向边=' + arcF.length + ')');
  }

  // ---- CSR ----
  const n = nodeCoords.length / 2;
  const m = arcF.length;
  const deg = new Int32Array(n);
  for (let i = 0; i < m; i++) deg[arcF[i]]++;
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + deg[i];
  const dest = new Uint32Array(m);
  const dist = new Float32Array(m);
  const cls = new Uint8Array(m);
  const nm = new Uint16Array(m);
  const posOf = new Uint32Array(m);   // 构建编号 i → CSR 位置（反向表要用）
  const cursor = offsets.slice(0, n);
  for (let i = 0; i < m; i++) {
    const u = arcF[i], pos = cursor[u]++;
    posOf[i] = pos;
    dest[pos] = arcT[i]; dist[pos] = arcD[i]; cls[pos] = arcC[i]; nm[pos] = arcN[i];
  }

  // ---- 孤节点标记（有出边或有入边才算活跃；退化 way 会留下孤点污染 snap）----
  const hasIn = new Uint8Array(n);
  for (let i = 0; i < m; i++) hasIn[arcT[i]] = 1;
  const active = new Uint8Array(n);
  for (let i = 0; i < n; i++) active[i] = deg[i] > 0 ? 1 : 0; // snap 只吸附有出边的节点（纯终点/断头端点会让起点无路可走）
  let isolated = 0;
  for (let i = 0; i < n; i++) if (!active[i]) isolated++;
  console.log('孤节点:', isolated, '/', n);

  // ---- 反向 CSR（双向搜索用：入边表 + 配对到正向 CSR 位置）----
  const degR = new Int32Array(n);
  for (let i = 0; i < m; i++) degR[arcT[i]]++;
  const offsetsR = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsetsR[i + 1] = offsetsR[i] + degR[i];
  const destR = new Uint32Array(m);   // 该入边的另一端（= 源端）
  const idxR = new Uint32Array(m);    // 对应正向 CSR 位置（dist/cls/nm 直接用该位置下标）
  const cursorR = offsetsR.slice(0, n);
  for (let i = 0; i < m; i++) {
    const v = arcT[i], pos = cursorR[v]++;
    destR[pos] = arcF[i]; idxR[pos] = posOf[i];
  }

  // ---- 内存自检（反向表 vs 正向 CSR）----
  let chkBad = 0;
  for (let u = 0; u < n; u++) {
    for (let j = offsetsR[u]; j < offsetsR[u + 1]; j++) {
      const e = idxR[j], src = destR[j];
      if (!(e >= offsets[src] && e < offsets[src + 1] && dest[e] === u)) {
        chkBad++;
        if (chkBad <= 3) console.log('自检 bad u=' + u, 'e=' + e, 'src=' + src, 'dest[e]=' + dest[e], '| arcT[e]=' + arcT[e], 'arcF[e]=' + arcF[e]);
      }
    }
  }
  console.log('内存自检 bad:', chkBad, '/', m);
  console.log('trace edge1: arcF[1]=' + arcF[1], 'arcT[1]=' + arcT[1], '| dest[1]=' + dest[1], '| destR[找边1所在]=?', (() => { for (let u = 0; u < Math.min(n, 100000); u++) for (let j = offsetsR[u]; j < offsetsR[u + 1]; j++) if (idxR[j] === 1) return 'u=' + u + ',src=' + destR[j]; return 'notFound<100k'; })());

  // ---- 吸附网格（0.005° ≈ 500m 格）----
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.round(nodeCoords[i * 2] / 0.005) + ',' + Math.round(nodeCoords[i * 2 + 1] / 0.005);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(i);
  }

  // ---- base64 输出 ----
  const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
  const ll = new Float32Array(nodeCoords);
  const payload = {
    ver: 1,
    nnodes: n,
    narcs: m,
    speed: SPEED,
    ll: b64(ll), offsets: b64(offsets), dest: b64(dest), dist: b64(dist), cls: b64(cls), nm: b64(nm),
    offsetsR: b64(offsetsR), destR: b64(destR), idxR: b64(idxR),
    active: b64(active),
    names: nameDict,
  };
  const s = 'window.ROAD_NET=' + JSON.stringify(payload) + ';';
  for (const dir of OUTS) {
    fs.mkdirSync(path.join(dir, 'transit'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'transit', 'roads.js'), s);
  }
  console.log('=== 图构建完成 ===');
  console.log('节点:', n, ' 有向边:', m, ' 路名:', nameDict.length, ' 文件:', (s.length / 1048576).toFixed(2) + 'MB');
}
main();
