// 房价低价地图数据构建：
// 1) 桌面 housing 项目的贝壳/房天下房源（≤50 万为主）提取
// 2) 两级地理编码：小区名 → OSM 地名索引；降级 镇街/区 → 中心点（带置信度）
// 3) 预计算每个房源最近通勤站点（traffic 数据，剔除 placeholder）
// 4) 包子全是水等博主的全国低价城市参考点（媒体报道整理）
// 输出三目录：transit/housing.js、stations.js、lowcity.js
'use strict';
const fs = require('fs');
const path = require('path');

const H = 'C:/Users/ted/Desktop/housing';
const OUTS = [
  'C:/Users/ted/Desktop/map/web',
  'C:/Users/ted/Desktop/map/mobile',
  'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets',
];
const MAX_PRICE = 500000; // 便宜房源阈值：总价 ≤ 50 万
const SANITY_MIN_TOTAL = 80000; // 异常数据清洗下限：总价 ≥ 8 万（爬虫脏数据）
const SANITY_MIN_AREA = 15;     // 面积 ≥ 15㎡（排除车位/错误解析）
const r5 = (v) => Math.round(v * 1e5) / 1e5;

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rowsOf = (d) => Array.isArray(d) ? d : (d.rows || d.units || d.list || d.items || []);

// ---------- 1. 房源提取（自适应结构） ----------
const SOURCES = [
  { file: '/data/guangzhou-current-listings.json', city: '广州', src: '贝壳' },
  { file: '/data/guangzhou-renovated-listings.json', city: '广州', src: '贝壳' },
  { file: '/data/dongguan-listings.json', city: '东莞', src: '房天下' },
  { file: '/data/huizhou-listings.json', city: '惠州', src: '房天下' },
  { file: '/data/zhongshan-beike-listings.json', city: '中山', src: '贝壳' },
  { file: '/data/zhuhai-beike-listings.json', city: '珠海', src: '贝壳' },
];
const listings = [];
for (const s of SOURCES) {
  try {
    const d = read(H + s.file);
    for (const r of rowsOf(d)) {
      const total = r.total_price_yuan;
      if (!total || total > MAX_PRICE || !r.community) continue;
      if (total < SANITY_MIN_TOTAL) continue;
      if (r.area_sqm && r.area_sqm < SANITY_MIN_AREA) continue;
      listings.push({
        city: r.city || s.city,
        district: r.district || '',
        area: r.area_name || '',
        community: String(r.community).trim(),
        sqm: r.area_sqm || null,
        total,
        unit: r.unit_price_yuan_sqm || (r.area_sqm ? Math.round(total / r.area_sqm) : null),
        beds: r.bedrooms ?? null,
        floor: r.floor_position || '',
        title: (r.title || '').slice(0, 40),
        url: r.url || '',
        src: s.src,
      });
    }
  } catch (e) { console.log('跳过', s.file, e.message.slice(0, 50)); }
}
// 广州便宜整理版（大面积低总价，100 万内大户型）
try {
  const d = read(H + '/广州便宜/广州大面积低总价房源_整理.json');
  for (const r of rowsOf(d)) {
    if (!r.community) continue;
    listings.push({
      city: '广州', district: r.district || '', area: r.areaName || '',
      community: String(r.community).trim(), sqm: r.area || null,
      total: (r.total || 0) * 10000, unit: r.unit || null,
      beds: null, floor: (r.info || '').split('|')[0].trim(),
      title: (r.title || '').slice(0, 40), url: r.url || '', src: '贝壳精选',
    });
  }
} catch (e) { console.log('跳过广州便宜', e.message.slice(0, 50)); }
console.log('提取房源（≤50 万）:', listings.length);

// ---------- 2. 地理编码（OSM 地名索引，两级） ----------
const idxRaw = read(H + '/traffic/data/osm-place-index.json');
const GD = (lat, lon) => lat >= 20.0 && lat <= 26.0 && lon >= 109.0 && lon <= 117.8; // 广东范围
const nameMap = new Map(); // name/alt -> [{lat, lon, place, kind}]
for (const p of idxRaw) {
  if (!GD(p.lat, p.lon)) continue;
  const ent = { lat: p.lat, lon: p.lon, place: (p.tags && p.tags.place) || '', id: p.id || '' };
  const add = (n) => { if (n && n.length >= 2) { const k = n.trim(); let a = nameMap.get(k); if (!a) { a = []; nameMap.set(k, a); } if (a.length < 6) a.push(ent); } };
  add(p.name);
  for (const alt of p.alt || []) add(alt);
}
console.log('OSM 索引（广东）:', nameMap.size, '个地名');

// 城市 bbox（地理编码的城市校验：防止同名小区跨市错位，如中山"豪景花园"→广州同名点）
const CITY_BBOX = {
  '广州': [22.45, 112.95, 23.65, 114.75],
  '东莞': [22.60, 113.50, 23.20, 114.25],
  '惠州': [22.35, 114.15, 23.25, 114.95],
  '中山': [22.30, 113.10, 22.80, 113.70],
  '珠海': [22.00, 113.05, 22.45, 113.75],
};
const inCity = (city, lat, lon) => {
  const b = CITY_BBOX[city];
  return !b || (lat >= b[0] - 0.15 && lat <= b[2] + 0.15 && lon >= b[1] - 0.15 && lon <= b[3] + 0.15);
};

const geocode = (l) => {
  // 1) 小区名精确（候选必须在房源城市 bbox 内，防止跨市同名错位）
  const cands = (nameMap.get(l.community) || []).filter((c) => inCity(l.city, c.lat, c.lon));
  if (cands.length) {
    const same = cands.find((c) => l.area && (c.id || '').length) || cands[0];
    return { lat: r5(same.lat), lon: r5(same.lon), conf: 'community' };
  }
  // 2) 镇街/片区名
  const areaKey = (l.area || '').replace(/(街道|镇|区|新区)$/, '');
  const areaCands = (nameMap.get(l.area) || nameMap.get(areaKey + '镇') || nameMap.get(areaKey + '街道') || nameMap.get(areaKey) || [])
    .filter((c) => inCity(l.city, c.lat, c.lon));
  if (areaCands.length) {
    const a = areaCands[0];
    return { lat: r5(a.lat), lon: r5(a.lon), conf: 'town' };
  }
  // 3) 区名
  const dKey = (l.district || '').replace(/(区|县|市)$/, '');
  const dCands = (nameMap.get(l.district) || nameMap.get(dKey + '区') || nameMap.get(dKey) || [])
    .filter((c) => inCity(l.city, c.lat, c.lon));
  if (dCands.length) {
    const a = dCands[0];
    return { lat: r5(a.lat), lon: r5(a.lon), conf: 'district' };
  }
  return null;
};

// ---------- 3. 通勤站点（剔除 placeholder） ----------
const stRawText = fs.readFileSync(H + '/traffic/data/stations.data.js', 'utf8');
const stArrPos = stRawText.search(/window\.STATIONS\s*=\s*\[/);
const stEnd = stRawText.lastIndexOf(']');
const stationsRaw = JSON.parse(stRawText.slice(stRawText.indexOf('[', stArrPos), stEnd + 1));
const stations = stationsRaw
  .filter((s) => s.lat && s.lon && s.confidence !== 'placeholder')
  .map((s) => ({ lat: s.lat, lon: s.lon, name: s.name, city: s.city, kind: s.kind || s.station_type || '', fare: s.fare || '', routes: (s.routes || []).join('、') }));
console.log('通勤站点（非占位）:', stations.length);

function nearestStations(lat, lon, K) {
  // 最近 K 个站点（多模式通勤：一个房源可能用不同站点）
  const arr = [];
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const d = Math.hypot((s.lat - lat) * 111320, (s.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180));
    arr.push({ i, d });
  }
  arr.sort((a, b) => a.d - b.d);
  return arr.slice(0, K).map((x) => ({ idx: x.i, dist: Math.round(x.d) }));
}

// ---------- 4. 组装 ----------
const pts = [];
let geoOk = 0, geoTown = 0, geoDistrict = 0, geoFail = 0;
for (const l of listings) {
  const g = geocode(l);
  if (!g) { geoFail++; continue; }
  if (g.conf === 'community') geoOk++;
  else if (g.conf === 'town') geoTown++;
  else geoDistrict++;
  const nears = nearestStations(g.lat, g.lon, 5);
  const near = stations[nears[0].idx] ? { name: stations[nears[0].idx].name, kind: stations[nears[0].idx].kind, dist: nears[0].dist } : null;
  pts.push({
    lat: g.lat, lon: g.lon,
    total: Math.round(l.total / 10000), // 万
    unit: l.unit, sqm: l.sqm, beds: l.beds,
    city: l.city, district: l.district, area: l.area, community: l.community,
    floor: l.floor, conf: g.conf, src: l.src,
    near: near ? near.name : '', nearKind: near ? near.kind : '', nearD: near ? near.dist : null,
    ns: nears.map((x) => [x.idx, x.dist]),   // 最近 5 站点 [站点下标, 距离米]
    title: l.title, url: l.url,
  });
}
console.log('地理编码: community=' + geoOk, 'town=' + geoTown, 'district=' + geoDistrict, 'fail=' + geoFail);

// 小区均价（用于弹窗参考，选有坐标社区聚合）
const communities = [];
for (const p of ['/data/guangzhou-current-communities.json', '/data/huizhou-communities.json', '/data/dongguan-communities.json']) {
  try {
    for (const r of rowsOf(read(H + p))) {
      const unit = r.communityMedianUnit || r.min_unit_price_yuan_sqm || null;
      communities.push({
        city: r.city || (p.includes('huizhou') ? '惠州' : p.includes('dongguan') ? '东莞' : '广州'),
        district: r.district || '', area: r.areaName || r.area_name || '', community: r.community,
        unit: unit, count: r.listing_count || null,
      });
    }
  } catch (e) { /* 忽略 */ }
}

// 小区参考均价反查（同城市+小区名 → 房源弹窗展示）
const commUnit = new Map();
for (const c of communities) {
  const k = (c.city || '') + '|' + c.community;
  if (!commUnit.has(k) && c.unit) commUnit.set(k, c.unit);
}
let refMatched = 0;
for (const p of pts) {
  const u = commUnit.get((p.city || '') + '|' + p.community);
  if (u) { p.ref = u; refMatched++; }
}
console.log('小区参考均价匹配:', refMatched, '/', pts.length);

// 镇街均价聚合（气泡图数据：n≥3 的镇街，中位单价+房源数+质心）
const townAgg = {};
for (const p of pts) {
  const key = (p.city || '') + '|' + (p.district || '') + '|' + (p.area || '');
  const a = townAgg[key] || (townAgg[key] = { city: p.city, district: p.district, area: p.area, n: 0, latSum: 0, lonSum: 0, units: [], minTotal: Infinity });
  a.n++; a.latSum += p.lat; a.lonSum += p.lon;
  if (p.unit) a.units.push(p.unit);
  if (p.total < a.minTotal) a.minTotal = p.total;
}
const towns = [];
for (const a of Object.values(townAgg)) {
  if (a.n < 3) continue;
  a.units.sort((x, y) => x - y);
  towns.push({
    city: a.city, district: a.district, area: a.area, n: a.n,
    lat: r5(a.latSum / a.n), lon: r5(a.lonSum / a.n),
    medianUnit: a.units.length ? a.units[Math.floor(a.units.length / 2)] : null,
    minTotal: a.minTotal,
  });
}
towns.sort((x, y) => y.n - x.n);
console.log('镇街聚合（n≥3）:', towns.length, '个');

// ---------- 5. 包子全是水等博主的低价城市参考（媒体报道整理） ----------
const lowCities = [
  { name: '鹤壁', lat: 35.748, lon: 114.297, note: '河南·老城区 2-5 万全款房源多，新区 6000-8000/㎡', src: '包子全是水/财联社' },
  { name: '阜新', lat: 42.022, lon: 121.671, note: '辽宁·3000-4000/㎡，2 万级全款出现过', src: '包子全是水/新浪财经' },
  { name: '百色', lat: 23.902, lon: 106.618, note: '广西·低价房源聚集城市之一', src: '包子全是水表格' },
  { name: '潜江', lat: 30.402, lon: 112.899, note: '湖北·江汉油田信息港片区低价房', src: '新浪财经' },
  { name: '淮南', lat: 32.626, lon: 117.018, note: '安徽·煤矿城市低价房', src: '包子全是水表格' },
  { name: '个旧', lat: 23.359, lon: 103.158, note: '云南·锡都，几万全款代表城市', src: '包子全是水表格' },
  { name: '宣威', lat: 26.217, lon: 104.104, note: '云南·低价房源城市之一', src: '包子全是水表格' },
  { name: '鹤岗', lat: 47.350, lon: 130.296, note: '黑龙江·白菜价鼻祖', src: '新浪财经' },
  { name: '凌海', lat: 41.170, lon: 121.357, note: '辽宁锦州代管·金城街道低价房', src: '新浪财经' },
];

// ---------- 6. 输出 ----------
const housingPayload = { count: pts.length, maxPrice: MAX_PRICE, pts, communities, towns };
const stationsPayload = { count: stations.length, stations };
const lowPayload = { count: lowCities.length, cities: lowCities, srcNote: '城市清单来自 B 站“包子全是水”2 万全款买房表格及媒体报道整理，房价概况为 2024-2026 报道口径，非实时' };
for (const dir of OUTS) {
  fs.mkdirSync(path.join(dir, 'transit'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'transit', 'housing.js'), 'window.HOUSING=' + JSON.stringify(housingPayload) + ';');
  fs.writeFileSync(path.join(dir, 'transit', 'stations.js'), 'window.STATIONS_MAP=' + JSON.stringify(stationsPayload) + ';');
  fs.writeFileSync(path.join(dir, 'transit', 'lowcity.js'), 'window.LOW_CITIES=' + JSON.stringify(lowPayload) + ';');
}
const kb = (p) => (fs.statSync(p + '/transit/housing.js').size / 1024).toFixed(0);
console.log('=== 完成 ===');
console.log('housing.js:', pts.length, '条,', kb(OUTS[0]), 'KB | communities:', communities.length, '| stations:', stations.length, '| lowcities:', lowCities.length);
