// 三版本补丁：① 通勤等时圈可视化（可达干线站点按到达时间分色）② rankCopy 剪贴板降级（APK file://）
'use strict';
const fs = require('fs');
const FILES = [
  ['web', 'C:/Users/ted/Desktop/map/web/index.html'],
  ['mobile', 'C:/Users/ted/Desktop/map/mobile/index.html'],
  ['apk', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html'],
];

const STATION_LAYER_JS = `    // 可达干线站点可视化（等时圈：按到达时间分色）
    if (commuteState.stLayer) { map.removeLayer(commuteState.stLayer); }
    commuteState.stLayer = L.layerGroup();
    const __sts = window.STATIONS_MAP.stations;
    for (let i = 0; i < gT2.nodeCount; i++) {
      const sec = r.arrive[i];
      if (!isFinite(sec)) continue;
      const m2 = sec / 60;
      if (m2 > maxMin) continue;
      const st = __sts[gT2.nodes[i]];
      const color = m2 <= maxMin * 0.67 ? '#16a34a' : '#ca8a04';
      L.circleMarker([st.lat, st.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 })
        .bindTooltip('🚏 ' + st.name.slice(0, 18) + ' · ' + Math.round(m2) + ' 分钟')
        .addTo(commuteState.stLayer);
    }
    commuteState.stLayer.addTo(map);
`;

const RANK_COPY_OLD = `    navigator.clipboard.writeText(lines.join('\\n')).then(
      () => { $('#rankCopy').textContent = '✓ 已复制'; setTimeout(() => { $('#rankCopy').textContent = '📋 复制榜单'; }, 2000); },
      () => { $('#rankCopy').textContent = '复制失败'; }
    );`;

const RANK_COPY_NEW = `    const __copyText = lines.join('\\n');
    const __copyDone = () => { $('#rankCopy').textContent = '✓ 已复制'; setTimeout(() => { $('#rankCopy').textContent = '📋 复制榜单'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(__copyText).then(__copyDone, () => copyFallback(__copyText, __copyDone));
    } else copyFallback(__copyText, __copyDone);`;

const COPY_FALLBACK_FN = `
  function copyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { $('#rankCopy').textContent = '复制失败'; }
    document.body.removeChild(ta);
  }`;

for (const [tag, p] of FILES) {
  let s = fs.readFileSync(p, 'utf8');
  const log = [];

  // ① 等时圈站点层：插在 commuteBtn 文案更新前（commuteClick 尾部）
  const anchor1 = "$('#commuteBtn').textContent = '🧮 点击地图重设上班地点';";
  if (s.includes(anchor1) && !s.includes('可达干线站点可视化')) {
    s = s.replace(anchor1, STATION_LAYER_JS + anchor1);
    log.push('等时圈✓');
  }

  // ①b commuteClearAll 清理站点层
  const anchor1b = "if (commuteState.marker) { map.removeLayer(commuteState.marker); commuteState.marker = null; }";
  if (s.includes(anchor1b) && !s.includes('commuteState.stLayer) { map.removeLayer(commuteState.stLayer)')) {
    s = s.replace(anchor1b, anchor1b + "\n    if (commuteState.stLayer) { map.removeLayer(commuteState.stLayer); commuteState.stLayer = null; }");
    log.push('等时圈清理✓');
  }

  // ② rankCopy 降级
  if (s.includes(RANK_COPY_OLD)) {
    s = s.replace(RANK_COPY_OLD, RANK_COPY_NEW);
    // copyFallback 函数插在 rankCopy listener 之后（找 rankCopy 监听块结尾的 }); 后面插入——用 rankTownStats 行定位更稳：
    const anc = "  $('#rankBtn').addEventListener('click', rankRun);";
    if (s.includes(anc)) {
      s = s.replace(anc, anc + '\n' + COPY_FALLBACK_FN);
      log.push('copyFallback✓');
    } else log.push('copyFallback 锚点缺失!');
  } else log.push('rankCopy 原块未匹配!');

  fs.writeFileSync(p, s);
  console.log(tag, '→', log.join(' | '));
}

// 语法验证
for (const [tag, p] of FILES) {
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>\s*<\/body>/);
  fs.writeFileSync('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/_chk13_' + tag + '.js', m[1]);
}
console.log('语法检查文件已生成');
