// 公共交通数据抓取（Overpass / OSM 开源数据）
// 用法:
//   node fetch-transit.js metro    → 轨道线路+站点（全域一次）
//   node fetch-transit.js bus <市> → 单市公交线网（广佛/深圳/东莞/惠州/珠海/中山/江门/清远）
//   node fetch-transit.js build    → 汇总生成 transit/*.js
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/transit';
const EPs = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.osm.jp/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'openmap-demo/1.0 (personal offline transit demo)';
const PRD = '(22.0,112.4,23.85,114.95)';

// 公交分市框（跨市通勤区重叠覆盖）
const BUS_BOXES = {
  guangfo: '(22.82,112.80,23.32,113.72)',
  shenzhen: '(22.42,113.72,22.82,114.38)',
  dongguan: '(22.76,113.58,23.12,114.12)',
  huizhou: '(22.62,114.22,23.22,114.68)',
  zhuhai: '(22.06,113.18,22.36,113.68)',
  zhongshan: '(22.40,113.22,22.72,113.62)',
  jiangmen: '(22.50,113.00,22.70,113.22)',
  qingyuan: '(23.52,112.92,23.82,113.18)',
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function overpass(query, maxTry = 6) {
  for (let i = 1; i <= maxTry; i++) {
    const ep = EPs[(i - 1) % EPs.length];
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(600000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
      console.log('  尝试' + i + ' ' + ep.slice(8, 30) + ' → HTTP ' + res.status + ' ' + text.slice(0, 80).replace(/\n/g, ' '));
    } catch (e) {
      console.log('  尝试' + i + ' ' + ep.slice(8, 30) + ' → ' + (e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 80)));
    }
    await sleep(15000 * i);
  }
  throw new Error('Overpass 多次失败: ' + query.slice(0, 60));
}

async function fetchMetro() {
  fs.mkdirSync(RAW, { recursive: true });
  console.log('抓取轨道线路（含几何）...');
  const q = '[out:json][timeout:600];(relation["route"~"^(subway|light_rail|monorail|tram)$"]' + PRD + ';);out geom;';
  const data = await overpass(q);
  fs.writeFileSync(path.join(RAW, 'metro_raw.json'), JSON.stringify(data));
  console.log('轨道线路 relations:', (data.elements || []).length, ' 大小:', (JSON.stringify(data).length / 1048576).toFixed(1) + 'MB');

  console.log('抓取轨道站点...');
  const q2 = '[out:json][timeout:300];(node["railway"="station"]' + PRD + ';node["station"="subway"]' + PRD + ';);out;';
  const st = await overpass(q2);
  fs.writeFileSync(path.join(RAW, 'stations_raw.json'), JSON.stringify(st));
  console.log('轨道站点 nodes:', (st.elements || []).length);
}

async function fetchBus(city) {
  const box = BUS_BOXES[city];
  if (!box) { console.error('未知城市: ' + city + ' 可选: ' + Object.keys(BUS_BOXES).join('/')); process.exit(1); }
  fs.mkdirSync(RAW, { recursive: true });
  const out = path.join(RAW, 'bus_' + city + '.json');
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log(city + ' 已存在，跳过'); return; }
  console.log('抓取公交线网: ' + city + ' ' + box);
  const q = '[out:json][timeout:900];relation["route"="bus"]' + box + ';out geom;';
  const data = await overpass(q, 8);
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(city + ' 公交 relations:', (data.elements || []).length, ' 大小:', (JSON.stringify(data).length / 1048576).toFixed(1) + 'MB');
}

async function fetchIntercity() {
  fs.mkdirSync(RAW, { recursive: true });
  const out = path.join(RAW, 'intercity_raw.json');
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log('intercity 已存在，跳过'); return; }
  console.log('抓取城际铁路/长途客车/水上巴士...');
  // route=train: 城际铁路与国铁车次; route=coach: 长途大巴; route=ferry: 水上巴士
  const q = '[out:json][timeout:900];(relation["route"="train"]' + PRD + ';relation["route"="coach"]' + PRD + ';relation["route"="ferry"]' + PRD + ';);out geom;';
  const data = await overpass(q, 8);
  fs.writeFileSync(out, JSON.stringify(data));
  const by = {};
  for (const el of (data.elements || [])) { const r = (el.tags || {}).route || '?'; by[r] = (by[r] || 0) + 1; }
  console.log('intercity relations:', JSON.stringify(by), ' 大小:', (JSON.stringify(data).length / 1048576).toFixed(1) + 'MB');
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'metro') await fetchMetro();
  else if (cmd === 'intercity') await fetchIntercity();
  else if (cmd === 'bus') {
    const city = process.argv[3];
    if (city === 'all') { for (const c of Object.keys(BUS_BOXES)) { await fetchBus(c); await sleep(8000); } }
    else await fetchBus(city);
  } else if (cmd === 'build') {
    require('./build-transit.js');
  } else { console.error('用法: fetch-transit.js metro | intercity | bus <市|all> | build'); process.exit(1); }
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
