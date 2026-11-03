// 修复 shell $() 展开破坏的 FEEDER[.value]
'use strict';
const fs = require('fs');
const BAD = "FEEDER[.value];";
const GOOD = "FEEDER[$('#feederMode').value];";
for (const p of ['C:/Users/ted/Desktop/map/mobile/index.html', 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets/index.html']) {
  let s = fs.readFileSync(p, 'utf8');
  const n = s.split(BAD).length - 1;
  if (n) { s = s.split(BAD).join(GOOD); fs.writeFileSync(p, s); }
  console.log(p.includes('mobile') ? 'mobile' : 'apk', '修复处:', n, '| 残留 bad:', s.split(BAD).length - 1, '| 正确引用:', s.split(GOOD).length - 1);
}
