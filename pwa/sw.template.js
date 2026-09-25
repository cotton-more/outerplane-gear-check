// Шаблон docs/sw.js: update.py подставляет __VERSION__ и __FILES__. Эта первая строка в вывод не попадает.
// Service worker Outerplane Gear Check: офлайн-режим и обновление данных.
// Сгенерирован update.py — не редактируй вручную.
const VERSION = '__VERSION__';
const CACHE = 'ogc-' + VERSION;
const FONTS = 'ogc-fonts';
const PRECACHE = __FILES__;

self.addEventListener('install', (event) => {
  // новая версия ждёт: страница сама предложит обновиться, чтобы не перезагружаться посреди оценки.
  // cache: 'reload' — мимо HTTP-кэша браузера: иначе под новой версией может лечь старая страница
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ogc-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // файлы сборки — из кэша (офлайн), иначе из сети; навигация — всегда index.html
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = await caches.match('index.html');
        if (page) return page;
      }
      return fetch(req);
    })());
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // шрифты: сразу из кэша, в фоне обновляем
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
