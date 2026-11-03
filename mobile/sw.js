// 开源地图 · 手机版 Service Worker
// 策略：应用外壳预缓存；地图瓦片 stale-while-revalidate（缓存上限 600 条）
'use strict';
const CACHE = 'open-map-v1';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './vendor/leaflet/leaflet.css', './vendor/leaflet/leaflet.js',
  './icons/icon-192.png', './icons/icon-512.png'
];
const TILE_HOSTS = ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'server.arcgisonline.com', 'tile.opentopomap.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function putTrim(cache, request, response, max = 600) {
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  if (keys.length > max) {
    for (const k of keys.slice(0, keys.length - max)) await cache.delete(k);
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 页面导航：网络优先，离线时回退到缓存的首页
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // 地图瓦片：先给缓存，后台静默更新
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const fetching = fetch(req)
          .then((res) => { if (res && res.ok) putTrim(cache, req, res); return res; })
          .catch(() => cached);
        return cached || fetching;
      })
    );
    return;
  }

  // 其余同源资源：缓存优先
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
  }
});
