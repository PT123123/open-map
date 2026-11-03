// 路由引擎：解码 CSR 图 + 吸附 + Dijkstra / A* / 双向 Dijkstra + 转向指令
// 依赖 window.ROAD_NET（transit/roads.js）
'use strict';
(function () {
  function b64ToU8(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }

  function loadGraph(net) {
    const t0 = performance.now();
    const g = {};
    g.nnodes = net.nnodes;
    g.narcs = net.narcs;
    g.speed = net.speed;
    const ll = new Float32Array(b64ToU8(net.ll).buffer);
    g.lat = ll.filter((_, i) => i % 2 === 0);
    g.lon = ll.filter((_, i) => i % 2 === 1);
    g.offsets = new Int32Array(b64ToU8(net.offsets).buffer);
    g.dest = new Uint32Array(b64ToU8(net.dest).buffer);
    g.dist = new Float32Array(b64ToU8(net.dist).buffer);
    g.cls = new Uint8Array(b64ToU8(net.cls).buffer);
    g.nm = new Uint16Array(b64ToU8(net.nm).buffer);
    g.offsetsR = new Int32Array(b64ToU8(net.offsetsR).buffer);
    g.destR = new Uint32Array(b64ToU8(net.destR).buffer);
    g.idxR = new Uint32Array(b64ToU8(net.idxR).buffer);
    g.active = net.active ? new Uint8Array(b64ToU8(net.active).buffer) : null;
    g.names = net.names;
    // 吸附网格（0.005° ≈ 500m；只放活跃节点，孤点会污染 snap）
    g.grid = new Map();
    for (let i = 0; i < net.nnodes; i++) {
      if (g.active && !g.active[i]) continue;
      const k = Math.round(g.lat[i] / 0.005) + ',' + Math.round(g.lon[i] / 0.005);
      let arr = g.grid.get(k);
      if (!arr) { arr = []; g.grid.set(k, arr); }
      arr.push(i);
    }
    g.decodeMs = Math.round(performance.now() - t0);
    return g;
  }

  function snap(g, lat, lon) {
    for (const r of [1, 2, 4, 8, 16]) {
      const cy = Math.round(lat / 0.005), cx = Math.round(lon / 0.005);
      let best = -1, bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const arr = g.grid.get((cy + dy) + ',' + (cx + dx));
          if (!arr) continue;
          for (const i of arr) {
            const d = (g.lat[i] - lat) * (g.lat[i] - lat) + (g.lon[i] - lon) * (g.lon[i] - lon);
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // 权重：fastest=时间秒 / shortest=距离米 / nohighway=时间且禁高速
  function makeW(g, mode) {
    if (mode === 'shortest') return (e) => g.dist[e];
    const spd = g.speed;
    if (mode === 'nohighway') {
      return (e) => (g.cls[e] === 0 || g.cls[e] === 4) ? Infinity : g.dist[e] / (spd[g.cls[e]] / 3.6);
    }
    return (e) => g.dist[e] / (spd[g.cls[e]] / 3.6);
  }
  // 启发：直线距离按最大速度折算（admissible，不会高估）
  function makeH(g, mode) {
    if (mode === 'shortest') return (a, b) => Math.hypot(g.lat[a] - g.lat[b], g.lon[a] - g.lon[b]) * 111320;
    const vmax = Math.max.apply(null, g.speed) / 3.6;
    return (a, b) => Math.hypot(g.lat[a] - g.lat[b], g.lon[a] - g.lon[b]) * 111320 / vmax;
  }

  function BinHeap() { this.k = []; this.v = []; this.n = 0; }
  BinHeap.prototype.push = function (k, v) {
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = k; V[i] = v;
  };
  BinHeap.prototype.pop = function () {
    const K = this.k, V = this.v, topV = V[0];
    this.n--;
    if (this.n > 0) {
      const k = K[this.n], v = V[this.n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let c = i, ck = k;
        if (l < this.n && K[l] < ck) { c = l; ck = K[l]; }
        if (r < this.n && K[r] < ck) { c = r; ck = K[r]; }
        if (c === i) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = k; V[i] = v;
    }
    return topV;
  };
  // 丢弃堆顶已 done 的 stale 项，返回有效 top key（Infinity=空）
  BinHeap.prototype.topValid = function (done) {
    const K = this.k, V = this.v;
    while (this.n > 0 && done[V[0]]) this.pop();
    return this.n > 0 ? K[0] : Infinity;
  };

  // 单向搜索（dijkstra / astar）
  function searchOne(g, s, t, mode, algo) {
    const t0 = performance.now();
    const w = makeW(g, mode);
    const h = makeH(g, mode);
    const n = g.nnodes;
    const INF = Infinity;
    const dist = new Float64Array(n).fill(INF);
    const prevNode = new Int32Array(n).fill(-1);
    const prevEdge = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    dist[s] = 0;
    const heap = new BinHeap();
    heap.push(algo === 'astar' ? h(s, t) : 0, s);
    let explored = 0;
    while (heap.n) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = true; explored++;
      if (u === t) break;
      for (let e = g.offsets[u]; e < g.offsets[u + 1]; e++) {
        const v = g.dest[e], wv = w(e);
        if (wv === Infinity || done[v]) continue;
        const nd = dist[u] + wv;
        if (nd < dist[v]) {
          dist[v] = nd; prevNode[v] = u; prevEdge[v] = e;
          heap.push(nd + (algo === 'astar' ? h(v, t) : 0), v);
        }
      }
    }
    if (dist[t] === INF) return { found: false, ms: Math.round(performance.now() - t0), explored };
    const edges = [];
    let u = t;
    while (u !== s) { const e = prevEdge[u]; if (e < 0) break; edges.push(e); u = prevNode[u]; }
    edges.reverse();
    return finish(g, edges, dist[t], Math.round(performance.now() - t0), explored);
  }

  // 双向 Dijkstra（节点级前驱；meet 时 μ ≤ topF+topB 即最优）
  function searchBi(g, s, t, mode) {
    const t0 = performance.now();
    const w = makeW(g, mode);
    const n = g.nnodes;
    const INF = Infinity;
    const df = new Float64Array(n).fill(INF), db = new Float64Array(n).fill(INF);
    const pfN = new Int32Array(n).fill(-1), pfE = new Int32Array(n).fill(-1);
    const pbN = new Int32Array(n).fill(-1), pbE = new Int32Array(n).fill(-1);
    const dfDone = new Uint8Array(n), dbDone = new Uint8Array(n);
    df[s] = 0; db[t] = 0;
    const hf = new BinHeap(), hb = new BinHeap();
    hf.push(0, s); hb.push(0, t);
    let mu = INF, meet = -1, explored = 0;
    while (hf.n && hb.n) {
      if (hf.k[0] <= hb.k[0]) {
        const u = hf.pop();
        if (dfDone[u]) continue;
        dfDone[u] = true; explored++;
        if (db[u] < INF && df[u] + db[u] < mu) { mu = df[u] + db[u]; meet = u; }
        for (let e = g.offsets[u]; e < g.offsets[u + 1]; e++) {
          const v = g.dest[e], wv = w(e);
          if (wv === Infinity || dfDone[v]) continue;
          const nd = df[u] + wv;
          // meet 候选：relax 边时若 v 已有反向距离，拼接即候选路径
          if (db[v] < INF && nd + db[v] < mu) { mu = nd + db[v]; meet = v; }
          if (nd < df[v]) { df[v] = nd; pfN[v] = u; pfE[v] = e; hf.push(nd, v); }
        }
      } else {
        const u = hb.pop();
        if (dbDone[u]) continue;
        dbDone[u] = true; explored++;
        if (df[u] < INF && df[u] + db[u] < mu) { mu = df[u] + db[u]; meet = u; }
        // 反向扩展：沿入边表（destR=源端，idxR=正向边号）
        for (let i = g.offsetsR[u]; i < g.offsetsR[u + 1]; i++) {
          const e = g.idxR[i], v = g.destR[i], wv = w(e);
          if (wv === Infinity || dbDone[v]) continue;
          const nd = db[u] + wv;
          // 对称：v 已有正向距离时拼接
          if (df[v] < INF && df[v] + nd < mu) { mu = df[v] + nd; meet = v; }
          if (nd < db[v]) { db[v] = nd; pbN[v] = u; pbE[v] = e; hb.push(nd, v); }
        }
      }
      // 最优终止：μ ≤ min(topF, topB)（单侧边界条件，有向图上严格成立）
      if (meet >= 0) {
        const topF = hf.topValid(dfDone), topB = hb.topValid(dbDone);
        const bound = Math.min(topF, topB);
        if (mu <= bound) break;
        if (bound === Infinity) break;
      }
    }
    if (meet < 0) return { found: false, ms: Math.round(performance.now() - t0), explored };
    // 回溯：沿前驱节点链走，每步在当前节点出边区间现场查找目标边（保证物理连续）
    const findEdge = (u, v) => {
      for (let k = g.offsets[u]; k < g.offsets[u + 1]; k++) if (g.dest[k] === v) return k;
      return -1;
    };
    const edges = [];
    let u = meet;
    while (u !== s) {
      const prev = pfN[u];
      if (prev < 0) break;
      const e = findEdge(prev, u);
      if (e < 0) break;
      edges.push(e); u = prev;
    }
    edges.reverse();
    u = meet;
    while (u !== t) {
      const nxt = pbN[u];
      if (nxt < 0) break;
      const e = findEdge(u, nxt);
      if (e < 0) break;
      edges.push(e); u = nxt;
    }
    return finish(g, edges, mu, Math.round(performance.now() - t0), explored);
  }

  function finish(g, edges, totalW, ms, explored) {
    // 重建节点路径（edges 连续：dest[e_i] == 源端(e_{i+1})）
    const nodes = new Array(edges.length + 1);
    nodes[0] = -1; // 由调用方填 s
    for (let i = 0; i < edges.length; i++) nodes[i + 1] = g.dest[edges[i]];
    let totalDist = 0, totalTime = 0;
    const spd = g.speed;
    for (const e of edges) { totalDist += g.dist[e]; totalTime += g.dist[e] / (spd[g.cls[e]] / 3.6); }
    return { found: true, edges, nodes, totalW, totalDist, totalTime, ms, explored };
  }

  // 转向指令
  function steps(g, nodes, edges) {
    const az = (a, b) => {
      const dLon = (g.lon[b] - g.lon[a]) * Math.cos(g.lat[a] * Math.PI / 180);
      const dLat = g.lat[b] - g.lat[a];
      return (Math.atan2(dLon, dLat) * 180 / Math.PI + 360) % 360;
    };
    const out = [];
    let acc = 0, prevAz = -1;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i], u = nodes[i], v = nodes[i + 1];
      const d = g.dist[e];
      const a = az(u, v);
      if (prevAz < 0) { acc = d; prevAz = a; continue; }
      const turn = ((a - prevAz + 540) % 360) - 180;
      if (Math.abs(turn) >= 30) {
        out.push({
          cmd: turn > 150 ? '掉头' : turn > 0 ? '右转' : turn < -150 ? '掉头' : '左转',
          meters: Math.round(acc),
          road: g.names[g.nm[e]] || '',
        });
        acc = d;
      } else acc += d;
      prevAz = a;
    }
    out.push({ cmd: '到达终点', meters: Math.round(acc), road: g.names[g.nm[edges[edges.length - 1]]] || '' });
    return out;
  }

  window.Router = {
    loadGraph,
    snap,
    route(g, s, t, mode, algo) {
      if (algo === 'bi') return searchBi(g, s, t, mode);
      return searchOne(g, s, t, mode, algo === 'dijkstra' ? 'dijkstra' : 'astar');
    },
    nodePath(g, s, edges) {
      const nodes = [s];
      for (const e of edges) nodes.push(g.dest[e]);
      return nodes;
    },
    steps,
    fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; },
    fmtTime(sec) { const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + '小时' + (m % 60) + '分' : m + ' 分钟'; },

    /* ===== 多模式通勤：接驳(步行/电动车) + 干线(大巴/城际站点图) =====
     * gT: TRAFFIC_GRAPH；stations: STATIONS_MAP.stations（含 lat/lon）
     * 返回 { arrive: Float64Array(每站点最早到达秒), feeder: 接驳参数 }
     */
    multiRoute(gT, stations, oLat, oLng, feederKmh, feederMaxM, waitSec) {
      const n = gT.nodeCount;
      // 邻接表（懒构建）
      if (!gT._adj) {
        const a = Array.from({ length: n }, () => []);
        for (let e = 0; e < gT.edgeCount; e++) {
          a[gT.eF[e]].push([gT.eT[e], gT.eW[e]]);
          a[gT.eT[e]].push([gT.eF[e], gT.eW[e]]);
        }
        gT._adj = a;
      }
      const cosO = Math.cos(oLat * Math.PI / 180);
      // 起点接驳接入
      const dist = new Float64Array(n).fill(Infinity);
      const heap = new BinHeap();
      let accessCount = 0;
      for (let i = 0; i < n; i++) {
        const st = stations[gT.nodes[i]];
        const d = Math.hypot((st.lat - oLat) * 111320, (st.lon - oLng) * 111320 * cosO);
        if (d <= feederMaxM) {
          const sec = d / (feederKmh / 3.6) + waitSec;
          if (sec < dist[i]) { dist[i] = sec; heap.push(sec, i); accessCount++; }
        }
      }
      // 干线 Dijkstra
      const done = new Uint8Array(n);
      let explored = 0;
      while (heap.n) {
        const u = heap.pop();
        if (done[u]) continue;
        done[u] = true; explored++;
        for (const [v, w] of gT._adj[u]) {
          if (done[v]) continue;
          const nd = dist[u] + w;
          if (nd < dist[v]) { dist[v] = nd; heap.push(nd, v); }
        }
      }
      return { arrive: dist, explored, accessCount };
    },
    // 房源总通勤：min over 最近 5 站点（接驳 + 干线到达）
    commuteFor(gT, arrive, ns, lat, lon, feederKmh, feederMaxM, waitSec) {
      const cosL = Math.cos(lat * Math.PI / 180);
      let best = Infinity, bestIdx = -1, bestFeeder = 0, bestDist = 0;
      const s2n = gT.stToNode;
      for (const [sIdx, distM] of ns) {
        if (distM > feederMaxM) continue;
        const nodeIdx = s2n ? s2n[sIdx] : sIdx;   // stations 下标 → 干线图节点序
        if (nodeIdx === undefined || nodeIdx < 0) continue;
        const arr = arrive[nodeIdx];
        if (!isFinite(arr)) continue;
        const feeder = distM / (feederKmh / 3.6) + waitSec;
        const total = feeder + arr;
        if (total < best) { best = total; bestIdx = sIdx; bestFeeder = feeder; bestDist = distM; }
      }
      return bestIdx >= 0 ? { total: best, feeder: bestFeeder, stationIdx: bestIdx, stationDist: bestDist } : null;
    },
  };
})();
