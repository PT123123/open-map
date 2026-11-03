// 手机版本地静态服务（无第三方依赖）
// 用法：node server.js [根目录]  （默认为本文件所在目录；端口可用环境变量 PORT 指定）
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(process.argv[2] || __dirname);
const PORT = Number(process.env.PORT) || 8080;

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

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    res.writeHead(400); return res.end('400');
  }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

let usedPort = PORT;
let retries = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && retries < 10) {
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
  console.log('开源地图 · 手机版服务已启动！');
  console.log('');
  console.log('  电脑访问:  http://localhost:' + usedPort);
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  for (const ip of ips) {
    console.log('  手机访问:  http://' + ip + ':' + usedPort + '   （手机与电脑需在同一 Wi-Fi）');
  }
  console.log('');
  console.log('在手机浏览器打开上面的「手机访问」地址即可使用；');
  console.log('安卓 Chrome / 华为浏览器菜单里选「添加到主屏幕」，可像 App 一样全屏使用。');
  console.log('按 Ctrl+C 停止服务。');
});
