// 三版本 index.html 补丁：
// 1) 修复 rank 镇街统计"万"单位（minP 已是万，不要 /10000）
// 2) 修复通勤弹窗站名双映射（c.stationIdx 已是 stations 下标，不要经 nodes[] 再映射）
// 3) housePopup 增加小区参考均价（p.ref）
// 4) 🌡️ 镇街均价气泡图层（townBtn + toggleTowns）
// 5) 预设上班地快捷按钮（presetWork chips）
// 6) web 版 houseHint 永远 hidden 的 bug（setHouseHint helper）
'use strict';
const fs = require('fs');
const FILES = [
  ['web', 'C:/Users/ted/Desktop/map/web/index.html'],
  ['mobile', 'C:/Users/ted/Desktop/map/mobile/index.html'],
  ['apk', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html'],
];

const TOWN_BTN_HTML = '<button id="townBtn" type="button" class="chip">🌡️ 镇街均价</button>';
const PRESET_HTML =
  '<div class="chips" style="margin-top:8px"><span style="font-size:12px;color:var(--muted);align-self:center">预设上班地:</span>' +
  '<button type="button" class="chip presetWork" data-lat="23.119" data-lng="113.322">珠江新城</button>' +
  '<button type="button" class="chip presetWork" data-lat="23.1338" data-lng="113.3199">体育西</button>' +
  '<button type="button" class="chip presetWork" data-lat="22.546" data-lng="114.0545">深圳福田</button>' +
  '<button type="button" class="chip presetWork" data-lat="22.5405" data-lng="113.9344">深圳科技园</button>' +
  '<button type="button" class="chip presetWork" data-lat="23.0218" data-lng="113.112">佛山祖庙</button>' +
  '<button type="button" class="chip presetWork" data-lat="23.0207" data-lng="113.7518">东莞南城</button>' +
  '<button type="button" class="chip presetWork" data-lat="22.5159" data-lng="113.3926">中山石岐</button>' +
  '</div>';

const TOWNS_JS = `
  async function toggleTowns() {
    if (townLayer) { map.removeLayer(townLayer); townLayer = null; return true; }
    if (townBusy) return false;
    townBusy = true;
    const hint = $('#houseHint');
    hint.textContent = '正在加载镇街均价…';
    hint.classList.remove('hidden');
    try {
      if (!window.HOUSING) await loadScript('transit/housing.js');
      townLayer = L.layerGroup();
      for (const t of window.HOUSING.towns) {
        const color = t.medianUnit == null ? '#94a3b8' : t.medianUnit < 5000 ? '#16a34a' : t.medianUnit < 10000 ? '#ca8a04' : '#ea580c';
        L.circleMarker([t.lat, t.lon], {
          renderer: houseRenderer, radius: Math.min(24, 7 + Math.sqrt(t.n) * 2.2),
          color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.5
        })
          .bindPopup('<b>' + (t.city || '') + '·' + (t.district || '') + (t.area ? ' ' + t.area : '') + '</b><br>' +
            '在售房源: ' + t.n + ' 条<br>' +
            (t.medianUnit ? '中位单价: <b>' + t.medianUnit + ' 元/㎡</b><br>' : '') +
            '最低总价: ' + t.minTotal + ' 万', { maxWidth: 240 })
          .bindTooltip((t.district || '') + (t.area || '') + ' ' + t.n + ' 套')
          .addTo(townLayer);
      }
      townLayer.addTo(map);
      hint.textContent = window.HOUSING.towns.length + ' 个镇街均价气泡（绿<5000 元/㎡ / 黄5000-1万 / 橙>1万，大小=在售房源数）';
      return true;
    } catch (e) { hint.textContent = '镇街均价加载失败'; return false; }
    finally { townBusy = false; }
  }
  $('#townBtn').addEventListener('click', async () => {
    const on = await toggleTowns();
    $('#townBtn').style.borderColor = on && townLayer ? 'var(--brand)' : '';
    $('#townBtn').style.background = on && townLayer ? '#f0fdfa' : '';
  });
`;

const PRESET_JS = `
  document.querySelectorAll('.presetWork').forEach((b) => b.addEventListener('click', async () => {
    if (!commuteState.on) await commuteToggle();
    const latlng = { lat: parseFloat(b.dataset.lat), lng: parseFloat(b.dataset.lng) };
    map.flyTo([latlng.lat, latlng.lng], 11);
    commuteClick(latlng);
  }));
`;

for (const [tag, p] of FILES) {
  let s = fs.readFileSync(p, 'utf8');
  const log = [];

  // 1) rank 万单位修复
  if (s.includes("+ a.minP / 10000 + ' 万 ·")) {
    s = s.replace("+ a.minP / 10000 + ' 万 ·", "+ a.minP + ' 万 ·");
    log.push('rank万单位✓');
  }

  // 2) 站名双映射修复（housePopup + rank）
  const dm1 = "stations[window.TRAFFIC_GRAPH.nodes[c.stationIdx]].name";
  if (s.includes(dm1)) { s = s.split(dm1).join("stations[c.stationIdx].name"); log.push('popup站名✓'); }
  const dm2 = "(stations[window.TRAFFIC_GRAPH.nodes[x.c.stationIdx]].name || '')";
  if (s.includes(dm2)) { s = s.split(dm2).join("(stations[x.c.stationIdx].name || '')"); log.push('rank站名✓'); }

  // 3) housePopup 参考均价
  const bedAnchor = "+ (p.beds ? ' · ' + p.beds + '室' : '') + '<br>' +";
  const bedCount = s.split(bedAnchor).length - 1;
  if (bedCount === 1 && !s.includes("p.ref ? '🏘")) {
    s = s.replace(bedAnchor, bedAnchor + "\n      (p.ref ? '🏘 小区参考均价: ' + p.ref + ' 元/㎡<br>' : '') +");
    log.push('参考均价✓');
  } else log.push('参考均价跳过(anchors=' + bedCount + ')');

  // 4) townLayer 声明
  const decl = 'let houseLayer = null, stLayer = null, lowLayer = null;';
  if (s.includes(decl) && !s.includes('townLayer = null, townBusy')) {
    s = s.replace(decl, 'let houseLayer = null, stLayer = null, lowLayer = null, townLayer = null, townBusy = false;');
    log.push('townLayer声明✓');
  }

  // 5) townBtn HTML
  const lcBtn = '<button id="lowCityBtn" type="button" class="chip">🌍 低价城市</button>';
  if (s.includes(lcBtn) && !s.includes('id="townBtn"')) {
    s = s.replace(lcBtn, lcBtn + '\n          ' + TOWN_BTN_HTML);
    log.push('townBtn HTML✓');
  }

  // 6) toggleTowns JS（挂在 lowCityBtn 监听后）
  const lcAnchor =
    "  $('#lowCityBtn').addEventListener('click', async () => {\n" +
    "    const on = await toggleLowCities();\n" +
    "    $('#lowCityBtn').style.borderColor = on && lowLayer ? 'var(--brand)' : '';\n" +
    "    $('#lowCityBtn').style.background = on && lowLayer ? '#f0fdfa' : '';\n" +
    "  });";
  if (s.includes(lcAnchor) && !s.includes('async function toggleTowns')) {
    s = s.replace(lcAnchor, lcAnchor + '\n' + TOWNS_JS);
    log.push('toggleTowns✓');
  }

  // 7) 预设上班地 HTML（插在 commuteInfo 前）
  if (s.includes('id="commuteInfo"') && !s.includes('presetWork')) {
    const ci = s.indexOf('id="commuteInfo"');
    const lineStart = s.lastIndexOf('\n', ci) + 1;
    s = s.slice(0, lineStart) + PRESET_HTML + '\n' + s.slice(lineStart);
    log.push('preset HTML✓');
  }

  // 8) 预设上班地 JS（挂在 commuteMax 监听后）
  const cmAnchor = "$('#commuteMax').addEventListener('change', () => { if (commuteState.origin) commuteClick(commuteState.origin); });";
  if (s.includes(cmAnchor) && !s.includes("querySelectorAll('.presetWork')")) {
    s = s.replace(cmAnchor, cmAnchor + '\n' + PRESET_JS);
    log.push('preset JS✓');
  }

  // 9) web 专属：houseHint 永远 hidden 修复
  if (tag === 'web' && s.includes("$('#houseHint').textContent =")) {
    s = s.replace(
      "  let houseLayer = null, stLayer = null, lowLayer = null, townLayer = null, townBusy = false;",
      "  let houseLayer = null, stLayer = null, lowLayer = null, townLayer = null, townBusy = false;\n" +
      "  const setHouseHint = (msg) => { const el = $('#houseHint'); if (msg) { el.textContent = msg; el.classList.remove('hidden'); } else el.classList.add('hidden'); };"
    );
    s = s.replace(/\$\('#houseHint'\)\.textContent = (.*);/g, "setHouseHint($1);");
    log.push('web hint✓');
  }

  fs.writeFileSync(p, s);
  console.log(tag, '→', log.join(' | ') || '无改动');
}

// 语法验证
for (const [tag, p] of FILES) {
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>\s*<\/body>/);
  fs.writeFileSync('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/_chk10_' + tag + '.js', m[1]);
}
console.log('语法检查文件已生成');
