// 开源地图 · 局域网发布服务（LAN Publish）
// 无强制第三方依赖；安装了 qrcode 时状态页会显示扫码二维码
// 双击「启动局域网服务.lnk」后台运行，浏览器打开 http://localhost:端口/ 管理一切
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAP_ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const MAX_PORT_ATTEMPTS = 10;

// 挂载表：URL 前缀 → 静态目录（存在才挂载；path.resolve 统一为本地分隔符）
const MOUNTS = [
  { prefix: '/m/', dir: path.resolve(MAP_ROOT, 'mobile'), desc: '手机版' },
  { prefix: '/pc/', dir: path.resolve(MAP_ROOT, 'web'), desc: '网页版' },
  { prefix: '/apk/', dir: path.resolve('C:/Users/ted/.zcode/workspace/1793421192336-da101ef3-ab13-44d1-9332-588a26ebece5/apk-build/assets'), desc: 'APK 离线界面预览' },
].filter((m) => fs.existsSync(m.dir));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---------- 状态页 ----------
let qrDataUrl = null;
let phoneUrl = '';
let lanIps = [];

function statusPage() {
  const links = MOUNTS.map((m) => {
    const info = {
      '/m/': { t: '📱 手机版', tag: '推荐手机使用', d: '触控界面，同一 Wi-Fi 的手机直接访问' },
      '/pc/': { t: '🖥️ 网页版', tag: '电脑浏览器', d: '侧边栏布局，适合局域网内其他电脑' },
      '/apk/': { t: '📦 APK 界面预览', tag: '离线效果', d: '与安卓安装包完全相同的界面和离线瓦片，可先在浏览器体验' },
    }[m.prefix];
    return `<a class="card" href="${m.prefix}"><span class="t">${info.t}</span><span class="tag">${info.tag}</span><div class="d">${info.d}<br><code>${m.prefix.slice(0, -1)}</code></div></a>`;
  }).join('\n  ');

  const qrBlock = qrDataUrl
    ? `<div class="qr"><img src="${qrDataUrl}" alt="二维码" width="200" height="200"><p>手机相机扫码直达手机版<br><code>${phoneUrl}</code></p></div>`
    : `<div class="qr"><p>手机访问：<code>${phoneUrl}</code></p></div>`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>开源地图 · 局域网服务</title>
<style>
  body { margin:0; font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif; background:#0b1220; color:#e2e8f0; }
  main { max-width:460px; margin:0 auto; padding:28px 18px 40px; }
  h1 { margin:0 0 4px; font-size:22px; }
  .sub { margin:0 0 22px; color:#94a3b8; font-size:13px; }
  a.card { display:block; padding:16px 18px; margin-bottom:12px; background:#111c30; border:1px solid #1e293b;
           border-radius:14px; text-decoration:none; color:inherit; transition:border-color .15s; }
  a.card:hover, a.card:active { border-color:#14b8a6; }
  .t { font-size:16px; font-weight:600; }
  .tag { display:inline-block; margin-left:8px; padding:2px 8px; border-radius:999px; font-size:11px;
         background:#134e4a; color:#5eead4; vertical-align:2px; }
  .d { font-size:12px; color:#94a3b8; margin-top:4px; line-height:1.7; }
  code { background:#0d1626; padding:1px 6px; border-radius:6px; font-size:12px; color:#7dd3fc; }
  .qr { text-align:center; background:#111c30; border:1px solid #1e293b; border-radius:14px; padding:18px; margin-bottom:14px; }
  .qr img { background:#fff; border-radius:10px; padding:8px; }
  .qr p { font-size:12px; color:#94a3b8; line-height:1.8; margin:10px 0 0; word-break:break-all; }
  details { margin-top:16px; font-size:13px; color:#94a3b8; }
  details li { line-height:1.9; }
  #stopBtn { margin-top:18px; width:100%; padding:12px; border:1px solid #7f1d1d; border-radius:12px;
             background:transparent; color:#fca5a5; font-size:14px; cursor:pointer; }
  #stopBtn:hover { background:#7f1d1d; color:#fff; }
</style>
</head>
<body>
<main>
  <h1>🗺️ 开源地图 · 局域网服务</h1>
  <p class="sub">运行中 · 端口 ${usedPort} · 同一 Wi-Fi 下的设备可直接访问</p>
  <div id="qrcode">${qrBlock}</div>
  ${links}
  <details>
    <summary>手机连不上？（防火墙 / AP 隔离）</summary>
    <ol>
      <li>双击 <code>防火墙放行.lnk</code>（在 map 文件夹里，弹出 UAC 选“是”），放行 8080-8090 端口</li>
      <li>确认手机与电脑连的是<b>同一个 Wi-Fi</b></li>
      <li>路由器开启了「AP 隔离 / 访客网络隔离」的话需要关闭</li>
    </ol>
  </details>
  <button id="stopBtn" type="button">⏹ 停止服务（仅本机可点）</button>
</main>
<script>
document.getElementById('stopBtn').addEventListener('click', function () {
  if (!confirm('确定停止局域网服务？')) return;
  fetch('/stop').then(function () {
    document.getElementById('qrcode').innerHTML = '<div class="qr"><p>服务已停止，可关闭本页面。<br>重新启动：双击 map 文件夹里的「启动局域网服务」</p></div>';
  });
});
</script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    res.writeHead(400); return res.end('400');
  }

  // 状态页 / 一键停止（仅限本机）
  if (p === '/' || p === '') {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return res.end(statusPage());
  }
  if (p === '/stop') {
    const addr = req.socket.remoteAddress || '';
    const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
    if (!local) { res.writeHead(403); return res.end('403'); }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('服务已停止');
    console.log('收到本机停止请求，服务关闭。');
    return setTimeout(() => process.exit(0), 300);
  }

  const mount = MOUNTS.find((m) => p === m.prefix.slice(0, -1) || p.startsWith(m.prefix));
  if (mount) {
    let rest = p.slice(mount.prefix.length);
    if (rest === '' || rest.endsWith('/')) rest += 'index.html';
    const file = path.normalize(path.join(mount.dir, rest));
    if (!file.startsWith(mount.dir + path.sep)) { res.writeHead(403); return res.end('403'); }
    return fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

let usedPort = PORT;
let retries = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && retries < MAX_PORT_ATTEMPTS) {
    retries += 1;
    console.log('端口 ' + usedPort + ' 被占用，改用端口 ' + (PORT + retries) + ' ...');
    usedPort = PORT + retries;
    server.listen(usedPort, '0.0.0.0');
  } else {
    console.error('服务启动失败：' + err.message);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list) {
      if (ni.family === 'IPv4' && !ni.internal) lanIps.push(ni.address);
    }
  }
  phoneUrl = (lanIps[0] ? 'http://' + lanIps[0] : 'http://localhost') + ':' + usedPort + '/m/';

  console.log('开源地图 · 局域网服务已启动！');
  console.log('  管理页:   http://localhost:' + usedPort + '/');
  console.log('  手机版:   ' + phoneUrl);
  console.log('  电脑版:   http://localhost:' + usedPort + '/pc/');
  console.log('  APK 预览: http://localhost:' + usedPort + '/apk/');

  // 状态页二维码（安装了 qrcode 依赖时生成 PNG dataURL）
  let qrcode = null;
  try { qrcode = require('qrcode'); } catch (e) { /* 未安装则状态页显示纯文字地址 */ }
  if (qrcode) {
    qrcode.toDataURL(phoneUrl, { errorCorrectionLevel: 'M', margin: 2, width: 200 }, (err, url) => {
      if (!err) qrDataUrl = url;
      console.log('二维码已生成，浏览器打开管理页即可扫码。');
    });
  }
});
