// 长循环重试两项缺失数据，成功即自动重建+打包：
// ① 中山公交走廊 → build-transit.js（corridors 更新）
// ② 莞惠 tertiary 补缝框（西向缺口）→ build-roads.js（roads 更新）
// 任一成功即重打包对应版本；全部完成或超时退出
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');

const WS = 'C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5';
const EPs = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.osm.jp/api/interpreter'];
const UA = 'openmap-demo/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q, timeoutSec) {
  for (let i = 0; i < EPs.length; i++) {
    try {
      const res = await fetch(EPs[i], { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(timeoutSec * 1000) });
      const t = await res.text();
      if (res.ok && t.trim().startsWith('{')) return JSON.parse(t);
      console.log('  ep' + (i + 1) + ' HTTP ' + res.status);
    } catch (e) { console.log('  ep' + (i + 1) + ' ' + (e.name === 'TimeoutError' ? '超时' : e.message.slice(0, 40))); }
    await sleep(6000);
  }
  return null;
}

async function tryZhongshanBus() {
  const out = WS + '/downloads/transit/bus_zhongshan.json';
  if (fs.existsSync(out)) return true;
  console.log('[中山公交] 尝试抓取…');
  const d = await overpass('[out:json][timeout:240];relation["route"="bus"](22.40,113.22,22.72,113.62);out geom;', 260);
  if (!d) return false;
  fs.writeFileSync(out, JSON.stringify(d));
  console.log('[中山公交] OK', (d.elements || []).length, '条');
  return true;
}

async function tryBridgeTertiary() {
  const out = WS + '/downloads/roads/roads_tertfix.json';
  if (fs.existsSync(out)) return true;
  console.log('[莞惠补缝] 尝试抓取 tertiary…');
  const d = await overpass('[out:json][timeout:300];way["highway"~"^(tertiary|tertiary_link|unclassified)$"](22.70,113.90,23.20,114.30);out geom tags;', 320);
  if (!d) return false;
  fs.writeFileSync(out, JSON.stringify(d));
  console.log('[莞惠补缝] OK', (d.elements || []).length, '条');
  return true;
}

(async () => {
  const deadline = Date.now() + 2 * 3600 * 1000; // 2 小时上限
  let busDone = false, roadDone = false, busPacked = false, roadPacked = false;
  while (Date.now() < deadline && !(busDone && roadDone)) {
    if (!busDone) busDone = await tryZhongshanBus();
    if (!roadDone) roadDone = await tryBridgeTertiary();
    // 中山公交到了 → 重建 corridors + 打包
    if (busDone && !busPacked) {
      console.log('[打包] 重建 corridors…');
      execSync('node --max-old-space-size=6144 "' + WS + '/tools/build-transit.js"', { stdio: 'inherit' });
      execSync('bash "' + WS + '/apk-build/build-apk.sh" | tail -2', { stdio: 'inherit', shell: 'C:/Program Files/Git/bin/bash.exe' });
      busPacked = true;
      console.log('[打包] corridors 更新完成');
    }
    // 补缝框到了 → 重建 roads + 打包（ver+1）
    if (roadDone && !roadPacked) {
      console.log('[打包] 重建 roads…');
      execSync('node --max-old-space-size=6144 "' + WS + '/tools/build-roads.js" | tail -2', { stdio: 'inherit' });
      execSync('cp "' + WS + '/apk-build/assets/transit/roads.js" /c/Users/ted/Desktop/map/web/transit/roads.js && cp "' + WS + '/apk-build/assets/transit/roads.js" /c/Users/ted/Desktop/map/mobile/transit/roads.js', { shell: 'C:/Program Files/Git/bin/bash.exe' });
      // 版本自增
      let mf = fs.readFileSync(WS + '/apk-build/AndroidManifest.xml', 'utf8');
      const vc = +mf.match(/android:versionCode="(\d+)"/)[1] + 1;
      mf = mf.replace(/android:versionCode="\d+"/, 'android:versionCode="' + vc + '"').replace(/android:versionName="[\d.]+"/, 'android:versionName="2.' + (vc - 5) + '"');
      fs.writeFileSync(WS + '/apk-build/AndroidManifest.xml', mf);
      let bs = fs.readFileSync(WS + '/apk-build/build-apk.sh', 'utf8');
      bs = bs.replace(/--version-code \d+ --version-name [\d.]+/, '--version-code ' + vc + ' --version-name 2.' + (vc - 5));
      fs.writeFileSync(WS + '/apk-build/build-apk.sh', bs);
      execSync('bash "' + WS + '/apk-build/build-apk.sh" | tail -2', { stdio: 'inherit', shell: 'C:/Program Files/Git/bin/bash.exe' });
      roadPacked = true;
      console.log('[打包] roads 更新完成 v2.' + (vc - 5));
    }
    if (!(busDone && roadDone)) {
      console.log('等待 5 分钟后重试… (' + new Date().toLocaleTimeString() + ')');
      await sleep(5 * 60 * 1000);
    }
  }
  console.log('=== RETRY_FINISHED bus=' + busDone + ' road=' + roadDone + ' ===');
})();
