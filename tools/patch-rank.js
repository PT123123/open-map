// 三版本 index.html 插入"性价比排行"模块（HTML + JS）
'use strict';
const fs = require('fs');

const HTML_BLOCK = `        <div class="chips" style="margin-top:10px">
          <button id="rankBtn" type="button" class="chip">💎 性价比排行</button>
          <button id="rankCopy" type="button" class="chip hidden">📋 复制榜单</button>
        </div>
        <div id="rankBox" class="hidden" style="margin-top:10px;font-size:12px;line-height:1.8">
          <div id="rankList" style="max-height:300px;overflow-y:auto"></div>
          <div id="rankTownStats" style="margin-top:8px;color:var(--muted)"></div>
        </div>`;

const JS_BLOCK = `
  /* ===== 性价比排行（通勤可达 × 价格排序）===== */
  let rankData = null;
  async function rankRun() {
    if (!commuteState.origin || !commuteState.arrive || !commuteState.gT) {
      $('#rankBox').classList.remove('hidden');
      $('#rankList').innerHTML = '<span style="color:#ea580c">请先在上方「通勤可达分析」设置上班地点</span>';
      return;
    }
    const fm = FEEDER[$('#feederMode').value];
    const maxMin = +$('#commuteMax').value;
    $('#rankBtn').textContent = '⏳ 排行计算中…';
    await new Promise((r) => setTimeout(r, 30));
    const stations = window.STATIONS_MAP.stations;
    const scored = [];
    for (const p of window.HOUSING.pts) {
      const c = window.Router.commuteFor(commuteState.gT, commuteState.arrive, p.ns, p.lat, p.lon, fm.kmh, fm.maxM, 300);
      if (!c) continue;
      const m = c.total / 60;
      if (m > maxMin) continue;
      scored.push({ p, c, m });
    }
    // 排序：通勤分钟升序，同分按总价升序
    scored.sort((a, b) => (a.m - b.m) || (a.p.total - b.p.total));
    rankData = { fm, maxMin, scored, ts: Date.now() };
    // Top 20 渲染
    const top = scored.slice(0, 20);
    $('#rankList').innerHTML = top.length
      ? top.map((x, i) =>
          '<div style="padding:6px 0;border-bottom:1px solid var(--border)">' +
          '<b>' + (i + 1) + '. ' + x.p.community + '</b> <span style="color:#ea580c;font-weight:600">' + x.p.total + '万</span>' +
          (x.p.unit ? ' <span style="color:#64748b">' + x.p.unit + '元/㎡</span>' : '') + '<br>' +
          '<span style="color:#2563eb">🚈 ' + x.m.toFixed(0) + ' 分钟</span>' +
          (x.p.sqm ? ' · ' + x.p.sqm + '㎡' : '') + (x.p.beds ? ' · ' + x.p.beds + '室' : '') +
          ' · ' + (x.p.district || '') + (x.p.area ? ' ' + x.p.area : '') + '<br>' +
          '<span style="color:#64748b;font-size:11px">└ ' + fm.label + ' ' + (x.c.feeder / 60).toFixed(0) + '分（' + x.c.stationDist + 'm）→ ' +
          (stations[window.TRAFFIC_GRAPH.nodes[x.c.stationIdx]].name || '').slice(0, 16) + '</span>' +
          (x.p.url ? ' <a href="' + x.p.url + '" target="_blank" rel="noopener">原文↗</a>' : '') + '</div>'
        ).join('')
      : '<span style="color:#ea580c">当前通勤上限内没有可达房源，试试放宽上限或换接驳方式</span>';
    // 镇街统计（可达房源聚合）
    const townAgg = {};
    for (const x of scored) {
      const key = (x.p.city || '') + '·' + (x.p.district || '未知');
      const a = townAgg[key] || (townAgg[key] = { n: 0, minM: Infinity, minP: Infinity, unitSum: 0, unitN: 0 });
      a.n++;
      if (x.m < a.minM) a.minM = x.m;
      if (x.p.total < a.minP) a.minP = x.p.total;
      if (x.p.unit) { a.unitSum += x.p.unit; a.unitN++; }
    }
    const townRows = Object.entries(townAgg).sort((a, b) => b[1].n - a[1].n).slice(0, 12)
      .map(([k, a]) => '<b>' + k + '</b>: ' + a.n + ' 套 · 最低 ' + a.minP / 10000 + ' 万 · 均单价 ' + Math.round(a.unitSum / a.unitN) + ' 元/㎡ · 最短通勤 ' + a.minM.toFixed(0) + ' 分');
    $('#rankTownStats').innerHTML = '<b>可达房源镇街分布（Top 12）</b><br>' + townRows.join('<br>');
    $('#rankCopy').classList.remove('hidden');
    $('#rankBtn').textContent = '💎 性价比排行（' + scored.length + ' 套可达）';
    // 地图高亮 Top 20
    if (houseLayer) {
      map.removeLayer(houseLayer);
      houseLayer = L.layerGroup();
      const topSet = new Set(top.map((x) => x.p));
      for (const p of window.HOUSING.pts) {
        const isTop = topSet.has(p);
        const score = scored.find((x) => x.p === p);
        const m = score ? score.m : Infinity;
        L.circleMarker([p.lat, p.lon], {
          renderer: houseRenderer, radius: isTop ? 6 : 4, color: '#fff', weight: isTop ? 2 : 1,
          fillColor: isTop ? '#7c3aed' : (score && m <= maxMin ? houseColor(p.total) : '#94a3b8'),
          fillOpacity: isTop ? 1 : 0.75, interactive: false
        }).addTo(houseLayer);
      }
      houseLayer.addTo(map);
      // ⭐ 标记 Top 20
      for (const x of top) {
        L.marker([x.p.lat, x.p.lon], { icon: L.divIcon({ html: '<div style="font-size:16px">⭐</div>', className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(houseLayer);
      }
    }
  }
  $('#rankBtn').addEventListener('click', rankRun);
  $('#rankCopy').addEventListener('click', () => {
    if (!rankData) return;
    const fm = rankData.fm, maxMin = rankData.maxMin;
    const lines = ['【开源地图 · 性价比排行】上班地通勤 ≤' + maxMin + ' 分钟（' + fm.label + '接驳）', ''];
    rankData.scored.slice(0, 20).forEach((x, i) => {
      lines.push((i + 1) + '. ' + x.p.community + '（' + (x.p.city || '') + (x.p.district || '') + '）');
      lines.push('   ' + x.p.total + ' 万 · ' + (x.p.unit || '?') + ' 元/㎡ · ' + (x.p.sqm || '?') + '㎡ · 通勤 ' + x.m.toFixed(0) + ' 分钟');
      if (x.p.url) lines.push('   ' + x.p.url);
    });
    navigator.clipboard.writeText(lines.join('\\n')).then(
      () => { $('#rankCopy').textContent = '✓ 已复制'; setTimeout(() => { $('#rankCopy').textContent = '📋 复制榜单'; }, 2000); },
      () => { $('#rankCopy').textContent = '复制失败'; }
    );
  });
`;

// 定位插入点：commuteInfo div 结束后的 </section> 之前加 HTML；JS 加在 commuteMax 监听之后
for (const [tag, p] of [['web', 'C:/Users/ted/Desktop/map/web/index.html'], ['mobile', 'C:/Users/ted/Desktop/map/mobile/index.html'], ['apk', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html']]) {
  let s = fs.readFileSync(p, 'utf8');
  let ok = 0;
  // HTML：插在通勤 section 的 </section> 前（识别 commuteMax label 后的第一个 </div></section>）
  const htmlAnchor = `          <option value="90">90 分钟</option>
            </select></label>
        </div>
        <p id="commuteInfo"`;
  if (s.includes(htmlAnchor)) {
    // 在 commute section 的 </section> 前插入 —— 用 commuteInfo 结尾定位
    const ci = s.indexOf('id="commuteInfo"');
    const secEnd = s.indexOf('</section>', ci);
    if (secEnd > 0) {
      // rankBox 插到 </section> 前（保留原闭合结构）
      s = s.slice(0, secEnd) + HTML_BLOCK + '\n      ' + s.slice(secEnd);
      ok++;
    }
  }
  // JS：插在 commuteMax 监听之后
  const jsAnchor = `  $('#commuteMax').addEventListener('change', () => { if (commuteState.origin) commuteClick(commuteState.origin); });`;
  if (s.includes(jsAnchor)) {
    s = s.replace(jsAnchor, jsAnchor + '\n' + JS_BLOCK);
    ok++;
  }
  fs.writeFileSync(p, s);
  console.log(tag, '插入:', ok, '/2 处');
}
// 语法验证
for (const [tag, p] of [['web', 'C:/Users/ted/Desktop/map/web/index.html'], ['mobile', 'C:/Users/ted/Desktop/map/mobile/index.html'], ['apk', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html']]) {
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>\s*<\/body>/);
  fs.writeFileSync('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/_chk8_' + tag + '.js', m[1]);
}
console.log('提取完成，待语法检查');
