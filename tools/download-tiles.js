// 下载离线瓦片包：全国 z3-8 + 10 城市 z9-14 + 5 城核心 z15（Carto Voyager 底图）
// 输出：downloads/tiles/{z}/{x}/{y}.png
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/tiles';
const TMPL = 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png';
const SUBS = ['a', 'b', 'c'];
const CONCURRENCY = 6;
const RETRIES = 3;
const TIMEOUT_MS = 20000;

// bbox: [latMin, lonMin, latMax, lonMax]
const CHINA = { bbox: [18.0, 73.5, 54.0, 135.5] };               // 全国行政轮廓 z3-4（国界+省界，极简）
const GUANGDONG = { bbox: [20.2, 109.6, 25.6, 117.4] };          // 广东全省 z5-7（县市+主干路）
const PRD_FULL = { bbox: [22.00, 112.40, 23.85, 114.95] };       // 珠三角全域 z9-13
const PRD_Z14 = [                                                 // 城市组团 z14
  { name: '广佛组团', bbox: [22.85, 112.85, 23.25, 113.65] },
  { name: '深莞惠组团', bbox: [22.45, 113.70, 23.15, 114.95] },
  { name: '珠中组团', bbox: [22.10, 113.10, 22.45, 113.70] },
  { name: '清远', bbox: [23.45, 112.90, 23.85, 113.40] },
];
const PRD_Z15 = [                                                 // 市区核心 z15
  { name: '广州核心', bbox: [23.06, 113.24, 23.22, 113.46] },
  { name: '深圳核心', bbox: [22.47, 113.84, 22.61, 114.16] },
  { name: '佛山核心', bbox: [22.97, 113.04, 23.06, 113.22] },
  { name: '东莞核心', bbox: [22.97, 113.67, 23.06, 113.79] },
  { name: '珠海核心', bbox: [22.22, 113.50, 22.32, 113.64] },
  { name: '惠州核心', bbox: [23.05, 114.37, 23.13, 114.46] },
  { name: '清远核心', bbox: [23.65, 113.00, 23.73, 113.10] },
];
const PRD_Z16 = [                                                 // 九市建成区 z16（建筑级）
  { name: '广州全区', bbox: [22.99, 113.15, 23.34, 113.66] },      // 芳村海珠天河白云黄埔(含科学城/知识城)
  { name: '番禺市桥', bbox: [22.92, 113.33, 23.01, 113.44] },
  { name: '佛山', bbox: [22.93, 113.02, 23.08, 113.26] },
  { name: '顺德大良容桂', bbox: [22.79, 113.27, 22.86, 113.34] },
  { name: '深圳西', bbox: [22.49, 113.76, 22.61, 114.18] },
  { name: '深圳东', bbox: [22.61, 113.90, 22.73, 114.26] },
  { name: '深圳光明', bbox: [22.75, 113.90, 22.79, 114.03] },
  { name: '深圳坪山', bbox: [22.67, 114.31, 22.72, 114.40] },
  { name: '东莞', bbox: [22.90, 113.66, 23.08, 113.98] },
  { name: '虎门长安', bbox: [22.78, 113.68, 22.90, 113.84] },
  { name: '东莞松山湖', bbox: [22.86, 113.95, 22.92, 114.02] },
  { name: '惠城', bbox: [23.02, 114.28, 23.17, 114.48] },
  { name: '惠阳大亚湾', bbox: [22.68, 114.38, 22.82, 114.62] },
  { name: '惠州仲恺', bbox: [22.98, 114.32, 23.04, 114.40] },
  { name: '香洲横琴', bbox: [22.12, 113.44, 22.32, 113.62] },
  { name: '金湾斗门', bbox: [22.12, 113.24, 22.28, 113.42] },
  { name: '中山', bbox: [22.46, 113.30, 22.66, 113.54] },
  { name: '中山小榄古镇', bbox: [22.62, 113.22, 22.70, 113.30] },
  { name: '江门城区', bbox: [22.56, 113.06, 22.64, 113.14] },
  { name: '清远', bbox: [23.60, 112.99, 23.76, 113.12] },
];
const PRD_Z17 = [                                                 // 广州重点片区 z17（门牌级）
  { name: '黄埔大沙地科学城', bbox: [23.09, 113.43, 23.20, 113.59] },
  { name: '天河CBD', bbox: [23.108, 113.318, 23.145, 113.375] },
  { name: '越秀老城', bbox: [23.115, 113.24, 23.145, 113.27] },
];

function lngToX(lon, z) { return Math.floor(((lon + 180) / 360) * (1 << z)); }
function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z));
}
function collect() {
  const set = new Set();
  const add = (box, z) => {
    const [latMin, lonMin, latMax, lonMax] = box;
    const x0 = lngToX(lonMin, z), x1 = lngToX(lonMax, z);
    const y0 = latToY(latMax, z), y1 = latToY(latMin, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set.add(z + '/' + x + '/' + y);
  };
  for (let z = 3; z <= 4; z++) add(CHINA.bbox, z);
  for (let z = 5; z <= 7; z++) add(GUANGDONG.bbox, z);
  for (let z = 9; z <= 13; z++) add(PRD_FULL.bbox, z);
  for (const c of PRD_Z14) add(c.bbox, 14);
  for (const c of PRD_Z15) add(c.bbox, 15);
  for (const c of PRD_Z16) add(c.bbox, 16);
  for (const c of PRD_Z17) add(c.bbox, 17);
  return [...set];
}

async function fetchTile(z, x, y, sub) {
  const url = TMPL.replace('{s}', sub).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  for (let i = 1; i <= RETRIES; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': 'open-map-personal-demo/1.0 (personal one-off offline demo; contact: local)' }
      });
      if (res.status === 404) return { ok: false, skip: true };
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100 || buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('非 PNG 内容');
      return { ok: true, buf };
    } catch (e) {
      if (i === RETRIES) return { ok: false, err: e.message };
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
}

async function main() {
  const tiles = collect();
  console.log('计划下载瓦片总数:', tiles.length);
  fs.mkdirSync(OUT, { recursive: true });

  let done = 0, saved = 0, bytes = 0, skipped = 0;
  const failures = [];
  const queue = tiles.slice();
  const existing = 0;

  async function worker(id) {
    const sub = SUBS[id % SUBS.length];
    while (queue.length) {
      const key = queue.shift();
      if (!key) break;
      const [z, x, y] = key.split('/').map(Number);
      const file = path.join(OUT, String(z), String(x), String(y) + '.png');
      if (fs.existsSync(file) && fs.statSync(file).size > 100) {
        done++; saved++; bytes += fs.statSync(file).size;
        continue;
      }
      const r = await fetchTile(z, x, y, sub);
      done++;
      if (r.ok) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, r.buf);
        saved++; bytes += r.buf.length;
      } else if (r.skip) {
        skipped++;
      } else {
        failures.push(key + ' (' + r.err + ')');
      }
      if (done % 500 === 0) {
        console.log('进度: ' + done + '/' + tiles.length + '  已存: ' + saved + '  失败: ' + failures.length + '  累计: ' + (bytes / 1048576).toFixed(1) + 'MB');
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  console.log('=== 下载完成 ===');
  console.log('成功:', saved, '  跳过(404):', skipped, '  失败:', failures.length);
  console.log('总大小:', (bytes / 1048576).toFixed(1) + ' MB');
  if (failures.length) {
    console.log('失败清单(前20):');
    failures.slice(0, 20).forEach((f) => console.log('  ' + f));
    fs.writeFileSync(path.join(OUT, '_failures.txt'), failures.join('\n'));
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
