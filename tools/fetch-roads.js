// 抓取珠三角主干路网（驾车导航用：motorway~secondary + links）
// 用法: node fetch-roads.js all | node fetch-roads.js guangfo
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/roads';
const EPs = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.osm.jp/api/interpreter'];
const UA = 'openmap-demo/1.0 (personal offline routing demo)';
const HW = '^(motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link)$';

// 7 框（重叠覆盖跨界路）
const BOXES = {
  guangfo: '(22.80,112.78,23.34,113.74)',
  shenzhen: '(22.40,113.70,22.84,114.40)',
  dongguan: '(22.74,113.56,23.14,114.14)',
  huizhou: '(22.60,114.20,23.24,114.70)',
  zhuhai: '(22.04,113.16,22.38,113.70)',
  zhongshan: '(22.38,113.20,22.74,113.64)',
  jiangqing: '(22.48,112.98,23.84,113.24)', // 江门+清远（西部带状）
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q, maxTry = 5) {
  for (let i = 1; i <= maxTry; i++) {
    const ep = EPs[(i - 1) % EPs.length];
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(900000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) return JSON.parse(text);
      console.log('  尝试' + i + ' ' + ep.slice(8, 28) + ' → HTTP ' + res.status + ' ' + text.slice(0, 60).replace(/\n/g, ' '));
    } catch (e) {
      console.log('  尝试' + i + ' ' + ep.slice(8, 28) + ' → ' + (e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 60)));
    }
    await sleep(12000 * i);
  }
  return null;
}

async function fetchBox(city, box) {
  const out = path.join(RAW, 'roads_' + city + '.json');
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log(city + ' 已存在，跳过'); return true; }
  console.log('抓取路网: ' + city);
  const q = '[out:json][timeout:900];way["highway"~"' + HW + '"]' + box + ';out geom tags;';
  const data = await overpass(q);
  if (!data) { console.log(city + ' 抓取失败'); return false; }
  fs.writeFileSync(out, JSON.stringify(data));
  console.log(city + ' OK ways=' + (data.elements || []).length + ' ' + (JSON.stringify(data).length / 1048576).toFixed(1) + 'MB');
  return true;
}

async function main() {
  fs.mkdirSync(RAW, { recursive: true });
  const arg = process.argv[2] || 'all';
  let fail = [];
  if (arg === 'all') {
    for (const [city, box] of Object.entries(BOXES)) {
      const ok = await fetchBox(city, box);
      if (!ok) fail.push(city);
      await sleep(6000);
    }
  } else {
    const ok = await fetchBox(arg, BOXES[arg]);
    if (!ok) fail.push(arg);
  }
  console.log('=== 完成 ===' + (fail.length ? ' 失败: ' + fail.join(',') : ' 全部成功'));
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
