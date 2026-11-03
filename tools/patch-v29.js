// 三版本补丁：💎 性价比排行加筛选器（价格上限/户型/面积），rankRun 应用筛选
'use strict';
const fs = require('fs');
const FILES = [
  ['web', 'C:/Users/ted/Desktop/map/web/index.html'],
  ['mobile', 'C:/Users/ted/Desktop/map/mobile/index.html'],
  ['apk', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html'],
];

const FILTER_HTML = `          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:12px;color:var(--muted)">
            <label>≤总价 <select id="rankFPrice" style="padding:3px 6px;border:1px solid var(--bc,#e2e8f0);border-radius:6px;background:#fff">
              <option value="999">不限</option><option value="15">15 万</option><option value="25">25 万</option><option value="35">35 万</option>
            </select></label>
            <label>户型 <select id="rankFBeds" style="padding:3px 6px;border:1px solid var(--bc,#e2e8f0);border-radius:6px;background:#fff">
              <option value="0">不限</option><option value="1">1室+</option><option value="2">2室+</option><option value="3">3室+</option>
            </select></label>
            <label>面积 <select id="rankFArea" style="padding:3px 6px;border:1px solid var(--bc,#e2e8f0);border-radius:6px;background:#fff">
              <option value="0">不限</option><option value="50">50㎡+</option><option value="70">70㎡+</option><option value="90">90㎡+</option>
            </select></label>
          </div>
          <div id="rankList" style="max-height:300px;overflow-y:auto"></div>`;

const FILTER_JS = `
  ['#rankFPrice', '#rankFBeds', '#rankFArea'].forEach((id) => {
    $(id).addEventListener('change', () => { if (commuteState.arrive) rankRun(); });
  });
`;

for (const [tag, p] of FILES) {
  let s = fs.readFileSync(p, 'utf8');
  const log = [];

  // ① rankBox 内加筛选控件（rankList 前）
  const listAnchor = '<div id="rankList" style="max-height:300px;overflow-y:auto"></div>';
  if (s.includes(listAnchor) && !s.includes('id="rankFPrice"')) {
    s = s.replace(listAnchor, FILTER_HTML);
    log.push('筛选HTML✓');
  }

  // ② rankRun 应用筛选
  const loopAnchor = `      const c = window.Router.commuteFor(commuteState.gT, commuteState.arrive, p.ns, p.lat, p.lon, fm.kmh, fm.maxM, 300);
      if (!c) continue;
      const m = c.total / 60;
      if (m > maxMin) continue;
      scored.push({ p, c, m });`;
  const loopNew = `      const c = window.Router.commuteFor(commuteState.gT, commuteState.arrive, p.ns, p.lat, p.lon, fm.kmh, fm.maxM, 300);
      if (!c) continue;
      const m = c.total / 60;
      if (m > maxMin) continue;
      const fP = +($('#rankFPrice') ? $('#rankFPrice').value : 999);
      const fB = +($('#rankFBeds') ? $('#rankFBeds').value : 0);
      const fA = +($('#rankFArea') ? $('#rankFArea').value : 0);
      if (p.total > fP) continue;
      if (fB && (p.beds || 0) < fB) continue;
      if (fA && (p.sqm || 0) < fA) continue;
      scored.push({ p, c, m });`;
  if (s.includes(loopAnchor) && !s.includes("const fP = +(")) {
    s = s.replace(loopAnchor, loopNew);
    log.push('rankRun筛选✓');
  }

  // ③ 筛选 change 监听（挂在 rankBtn 监听后）
  const rankAnchor = "  $('#rankBtn').addEventListener('click', rankRun);";
  if (s.includes(rankAnchor) && !s.includes("'#rankFPrice', '#rankFBeds'")) {
    s = s.replace(rankAnchor, rankAnchor + '\n' + FILTER_JS);
    log.push('筛选监听✓');
  }

  fs.writeFileSync(p, s);
  console.log(tag, '→', log.join(' | ') || '无改动');
}

// 语法验证
for (const [tag, p] of FILES) {
  const html = fs.readFileSync(p, 'utf8');
  const m = html.match(/<script>\s*\n([\s\S]*?)\n\s*<\/script>\s*<\/body>/);
  fs.writeFileSync('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/downloads/_chk15_' + tag + '.js', m[1]);
}
console.log('语法检查文件已生成');
