// 汇总 transit 原始数据 → 三个版本的 transit/*.js（window.TRANSIT_* 全局变量，避免 file:// fetch 问题）
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/transit';
const OUTS = [
  'C:/Users/ted/Desktop/map/web/transit',
  'C:/Users/ted/Desktop/map/mobile/transit',
  'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/transit',
];
const r5 = (v) => Math.round(v * 1e5) / 1e5;

// Douglas-Peucker 简化
function dp(points, eps) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-20;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps * eps) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// 按 relation 成员顺序拼接 way 几何（跳过站点/平台）
function relationLine(rel) {
  const pts = [];
  for (const m of rel.members || []) {
    if (m.type !== 'way' || !m.geometry) continue;
    const role = m.role || '';
    if (role === 'stop' || role === 'stop_exit' || role === 'stop_entry' || role === 'platform') continue;
    const g = m.geometry.filter(Boolean);
    for (const p of g) if (p && p.lat != null) pts.push([p.lat, p.lon]);
  }
  return pts;
}

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#008080', '#9a6324', '#800000', '#808000', '#000075', '#e75480', '#17becf'];

function classifyLine(t) {
  const name = t.name || '';
  if (t.route === 'train') return /城际/.test(name + (t.network || '')) ? 'intercity' : 'rail';
  if (t.route === 'coach') return 'coach';
  if (t.route === 'ferry') return 'ferry';
  if (t.route === 'tram') return 'tram';
  if (t.route === 'light_rail' || t.route === 'monorail') return 'lrt';
  return 'metro';
}

// 广东以外过滤（用户要求几乎不留）：香港/澳门的轨道与渡轮（精确词，避免误杀广州"客运港"/珠海海岛线）
const NON_GD = /港鐵|MTR|港島綫|荃灣綫|觀塘綫|將軍澳綫|東鐵綫|屯馬綫|東涌綫|機場快綫|輕鐵|愉景灣|中環|坪洲|南丫島|梅窩|長洲渡輪|馬料水|吉澳|鴨洲|三門仔|沙頭角|媽閣|Porto Exterior|Kat O|Ma Liu Shui|Sha Tau Kok|新渡輪|港九小輪|澳門|MACAU/;
function isNonGD(t) {
  return NON_GD.test((t.name || '') + (t.network || ''));
}

function buildMetro() {
  const raw = JSON.parse(fs.readFileSync(path.join(RAW, 'metro_raw.json'), 'utf8'));
  const stRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'stations_raw.json'), 'utf8'));
  const interPath = path.join(RAW, 'intercity_raw.json');
  const inter = fs.existsSync(interPath) ? JSON.parse(fs.readFileSync(interPath, 'utf8')) : { elements: [] };

  // 同 ref+colour+route 合并（南行/北行/快车 variant）
  const groups = new Map();
  function addRel(el) {
    if (el.type !== 'relation') return;
    const t0 = el.tags || {};
    if (isNonGD(t0)) return; // 广东以外不留
    const pts = relationLine(el);
    if (pts.length < 4) return;
    const t = el.tags || {};
    const cls = classifyLine(t);
    // 城际/国铁/大巴按线路名主干聚合（去掉方向、起终点、快车后缀；不同车次同一物理线路）
    const key = cls === 'rail' || cls === 'intercity' || cls === 'coach'
      ? cls + '|' + (t.name || t.ref || '?').replace(/[：:].*$/, '').replace(/快车$/, '').replace(/(东行|西行|南行|北行|往返).*$/, '').trim()
      : (t.ref || t.name || '?') + '|' + ((t.colour || '').toUpperCase()) + '|' + (t.route || 'subway');
    let g = groups.get(key);
    if (!g) {
      const stemName = (cls === 'rail' || cls === 'intercity' || cls === 'coach')
        ? (t.name || t.ref || '线路').replace(/[：:].*$/, '').replace(/快车$/, '').replace(/(东行|西行|南行|北行|往返).*$/, '').trim()
        : (t.name || t.ref || '线路');
      g = { name: stemName, ref: t.ref || '', type: t.route || 'subway', cls, colour: (t.colour || '').toUpperCase() || '', network: t.network || '', segs: [] };
      groups.set(key, g);
    }
    if ((t.name || '').length < g.name.length && !(g.cls === 'rail' || g.cls === 'intercity' || g.cls === 'coach')) g.name = t.name;
    g.segs.push(pts);
  }
  for (const el of raw.elements || []) addRel(el);
  for (const el of inter.elements || []) addRel(el);

  // 断裂切分：相邻点距离 > 0.02°（约2km）视为几何缺口，切段避免穿图直线
  function splitBreaks(pts) {
    const out = [];
    let cur = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d > 0.02) { out.push(cur); cur = [pts[i]]; }
      else cur.push(pts[i]);
    }
    out.push(cur);
    return out.filter((s) => s.length >= 4);
  }

  const lines = [];
  for (const g of groups.values()) {
    const coords = [];
    for (const seg of g.segs) {
      for (const part of splitBreaks(seg)) {
        const simp = dp(part, 1e-4).map(([a, b]) => [r5(a), r5(b)]);
        if (simp.length >= 2) coords.push(simp);
      }
    }
    if (!coords.length) continue;
    lines.push({
      name: g.name,
      ref: g.ref,
      type: g.type,
      cls: g.cls,
      colour: g.colour || PALETTE[lines.length % PALETTE.length],
      network: g.network,
      coords,  // 嵌套：同一线路的多段折线
    });
  }

  const stations = [];
  const stSeen = new Set();
  for (const el of stRaw.elements || []) {
    if (el.type !== 'node') continue;
    const t = el.tags || {};
    if (!t.name || isNonGD(t)) continue;
    const isMetro = t.station === 'subway' || t.subway === 'yes' || t.light_rail === 'yes' ||
      (t.railway === 'station' && /地铁|捷运|轨道交通/.test(t.name || ''));
    if (isMetro) {
      const k = t.name;
      if (stSeen.has(k)) continue;
      stSeen.add(k);
      stations.push({ name: t.name, cls: 'metro', lat: r5(el.lat), lon: r5(el.lon) });
    } else if (t.railway === 'station' && t.station !== 'yes') {
      // 国铁/城际站（广州东、佛山西等），限主要站（有名字且非简易停靠点）
      const k = 'r' + t.name;
      if (stSeen.has(k)) continue;
      stSeen.add(k);
      stations.push({ name: t.name, cls: 'rail', lat: r5(el.lat), lon: r5(el.lon) });
    }
  }

  lines.sort((a, b) => String(a.ref || a.name).localeCompare(String(b.ref || b.name)));
  const payload = { lines, stations };
  let size = 0;
  for (const dir of OUTS) {
    fs.mkdirSync(dir, { recursive: true });
    const s = 'window.TRANSIT_METRO=' + JSON.stringify(payload) + ';';
    fs.writeFileSync(path.join(dir, 'metro.js'), s);
    size = s.length;
  }
  console.log('metro.js:', lines.length, '条线路,', stations.length, '个站点,', (size / 1048576).toFixed(2) + 'MB');
}

function buildCorridors() {
  // pair(量化格对) → Set(线路 ref)
  const corridor = new Map();
  const Q = 0.002; // ≈220m
  let routes = 0;

  const files = fs.readdirSync(RAW).filter((f) => /^bus_.+\.json$/.test(f));
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
    for (const el of raw.elements || []) {
      if (el.type !== 'relation') continue;
      const pts = relationLine(el);
      if (pts.length < 8) continue;
      routes++;
      const ref = (el.tags || {}).ref || (el.tags || {}).name || '?';
      let prev = null;
      const localPairs = new Set();
      for (const [lat, lon] of pts) {
        const key = Math.round(lat / Q) + ':' + Math.round(lon / Q);
        if (prev != null && key !== prev.k) {
          const pairKey = prev.k < key ? prev.k + '>' + key : key + '>' + prev.k;
          localPairs.add(pairKey);
        }
        prev = { k: key, lat, lon };
      }
      for (const pk of localPairs) {
        let set = corridor.get(pk);
        if (!set) { set = new Set(); corridor.set(pk, set); }
        set.add(ref);
      }
    }
    console.log(f, '处理完成');
  }

  // 选择阈值：段数 ≤ 22000
  const stats = {};
  for (const set of corridor.values()) stats[set.size] = (stats[set.size] || 0) + 1;
  console.log('廊道段分布:', JSON.stringify(stats));
  let thr = 3;
  for (const t of [3, 4, 5, 6, 8, 10]) {
    let cnt = 0;
    for (const [n, c] of Object.entries(stats)) if (+n >= t) cnt += c;
    if (cnt <= 22000) thr = t;
  }
  console.log('采用阈值 n>=' + thr);

  const segs = [];
  for (const [pk, set] of corridor) {
    const n = set.size;
    if (n < thr) continue;
    const [ka, kb] = pk.split('>');
    const [ay, ax] = ka.split(':').map(Number);
    const [by, bx] = kb.split(':').map(Number);
    segs.push([r5((ay * Q)), r5((ax * Q)), r5((by * Q)), r5((bx * Q)), n]);
  }
  const payload = { thr, routes, maxN: Math.max(...segs.map((s) => s[4])), segs };
  let size = 0;
  for (const dir of OUTS) {
    fs.mkdirSync(dir, { recursive: true });
    const s = 'window.TRANSIT_CORRIDORS=' + JSON.stringify(payload) + ';';
    fs.writeFileSync(path.join(dir, 'corridors.js'), s);
    size = s.length;
  }
  console.log('corridors.js:', segs.length, '段,', routes, '条公交线,', (size / 1048576).toFixed(2) + 'MB');
}

function buildStreetview() {
  const svPath = path.join(RAW, 'panoramax_raw.json');
  if (!fs.existsSync(svPath)) { console.log('无 panoramax 数据，跳过 streetview'); return; }
  const all = JSON.parse(fs.readFileSync(svPath, 'utf8'));
  const pts = [];
  for (const f of all) {
    if (f.geometry?.type !== 'Point') continue;
    const [lon, lat] = f.geometry.coordinates;
    const a = f.assets || {};
    const p = f.properties || {};
    pts.push({
      lat: r5(lat),
      lon: r5(lon),
      id: f.id,
      date: (p.datetime || '').slice(0, 10),
      by: p['geovisio:producer'] || '',
      az: Math.round(p['view:azimuth'] ?? -1),
      hd: (a.hd && a.hd.href) || '',
      thumb: (a.thumb && a.thumb.href) || (p['geovisio:thumbnail'] || ''),
    });
  }
  const payload = { count: pts.length, pts };
  let size = 0;
  for (const dir of OUTS) {
    fs.mkdirSync(dir, { recursive: true });
    const s = 'window.TRANSIT_STREETVIEW=' + JSON.stringify(payload) + ';';
    fs.writeFileSync(path.join(dir, 'streetview.js'), s);
    size = s.length;
  }
  console.log('streetview.js:', pts.length, '个街景点,', (size / 1024).toFixed(1) + 'KB');
}

buildMetro();
buildCorridors();
buildStreetview();
