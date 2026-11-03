// 单次尝试抓取莞惠桥接框（补 114.14-114.20 数据缝）
'use strict';
const fs = require('fs');
const EPs = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.osm.jp/api/interpreter'];
(async () => {
  for (let i = 0; i < EPs.length; i++) {
    try {
      const q = '[out:json][timeout:480];way["highway"~"^(motorway|trunk|primary|secondary|motorway_link|trunk_link|primary_link|secondary_link|tertiary)$"](22.55,114.08,23.30,114.30);out geom tags;';
      const res = await fetch(EPs[i], { method: 'POST', headers: { 'User-Agent': 'openmap-demo/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(500000) });
      const t = await res.text();
      if (res.ok && t.trim().startsWith('{')) {
        fs.writeFileSync('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/roads/roads_bridgedg.json', t);
        console.log('BRIDGE_OK ways=' + (JSON.parse(t).elements || []).length);
        return;
      }
      console.log('尝试' + (i + 1), 'HTTP', res.status);
    } catch (e) { console.log('尝试' + (i + 1), e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 50)); }
    await new Promise(r => setTimeout(r, 8000));
  }
  console.log('BRIDGE_FAIL');
  process.exit(1);
})();
