// 快速并行抓取剩余城市公交（每市独立，失败快速跳过）
'use strict';
const fs = require('fs');
const path = require('path');

const RAW = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/transit';
const EPs = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.osm.jp/api/interpreter'];
const UA = 'openmap-demo/1.0 (personal offline transit demo)';
const CITIES = {
  huizhou: '(22.62,114.22,23.22,114.68)',
  zhuhai: '(22.06,113.18,22.36,113.68)',
  zhongshan: '(22.40,113.22,22.72,113.62)',
  jiangmen: '(22.50,113.00,22.70,113.22)',
  qingyuan: '(23.52,112.92,23.82,113.18)',
};

async function fetchCity(city, box) {
  const out = path.join(RAW, 'bus_' + city + '.json');
  if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log(city, '已存在'); return { city, ok: true }; }
  for (let i = 1; i <= 4; i++) {
    const ep = EPs[(i - 1) % EPs.length];
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent('[out:json][timeout:240];relation["route"="bus"]' + box + ';out geom;'),
        signal: AbortSignal.timeout(280000),
      });
      const text = await res.text();
      if (res.ok && text.trim().startsWith('{')) {
        fs.writeFileSync(out, text);
        const n = (JSON.parse(text).elements || []).length;
        console.log(city, 'OK', n, '条线路', (text.length / 1048576).toFixed(1) + 'MB');
        return { city, ok: true };
      }
      console.log(city, '尝试' + i, 'HTTP ' + res.status);
    } catch (e) {
      console.log(city, '尝试' + i, e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 60));
    }
    await new Promise((r) => setTimeout(r, 5000 * i));
  }
  return { city, ok: false };
}

async function main() {
  const results = await Promise.all(Object.entries(CITIES).map(([c, b]) => fetchCity(c, b)));
  console.log('结果:', results.map((r) => r.city + '=' + (r.ok ? 'OK' : 'FAIL')).join(' '));
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
