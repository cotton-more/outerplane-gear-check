// Шаблон docs/sw.js: update.py подставляет __VERSION__, __DATA__ и __FILES__. Эта первая строка в вывод не попадает.
// Service worker Outerplane Gear Check: офлайн-режим и обновления.
// Сгенерирован update.py — не редактируй вручную.
// VERSION — версия приложения: меняется от любой правки файлов сайта (строку читают task pages:check и
// scripts/autoupdate.sh). DATA — версия данных: коммит outerpedia снимка, меняется только с новыми данными.
// Страница спрашивает ждущий worker, что в нём, и решает: новые данные — плашка «Обновить», только правки
// приложения — строка в подвале, а при следующем запуске оно ставится само (src/hooks/usePwa.ts).
const VERSION = '__VERSION__';
const DATA = __DATA__;
const CACHE = 'ogc-' + VERSION;
const FONTS = 'ogc-fonts';
const PRECACHE = __FILES__;

self.addEventListener('install', (event) => {
  // новая версия ждёт, пока страница её не включит: посреди оценки не перезагружаемся.
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
  // 'skipWaiting' строкой шлют и страницы прежних выпусков — не менять
  if (event.data === 'skipWaiting') self.skipWaiting();
  // «что в тебе?» (askWorker в src/hooks/usePwa.ts) — ответ в порт MessageChannel
  else if (event.data?.type === 'ogc:info') event.ports[0]?.postMessage({ version: VERSION, data: DATA });
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
