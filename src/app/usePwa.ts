import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

// iPhone и iPad (iPadOS притворяется Mac'ом, выдаёт его сенсорный экран)
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// ответ worker'а на { type: 'ogc:info' } (pwa/sw.template.js): версия приложения и версия данных — коммит outerpedia
export interface WorkerInfo { version?: unknown; data?: unknown }
// 'data' — вышли новые данные: плашка «Обновить»; 'app' — только правки приложения: «Готова новая версия» в «Ещё»
export type UpdateKind = 'data' | 'app';

// Какое обновление ждёт. Данные — только когда worker ответил и версия данных у него другая, чем у открытой страницы.
// Всё остальное — те же данные, нет ответа (sw.js прежних выпусков молчит), у страницы нет коммита — приложение:
// про новые данные не говорим без доказательства.
export function updateKind(page: string | null | undefined, info: WorkerInfo | null | undefined): UpdateKind {
  const data = info?.data;
  return page && typeof data === 'string' && data && data !== page ? 'data' : 'app';
}

// Спросить worker, что в нём: ответ приходит в порт MessageChannel. Не ответил за ms — null.
export function askWorker(w: ServiceWorker, ms = 1500): Promise<WorkerInfo | null> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const done = (info: WorkerInfo | null) => { clearTimeout(timer); ch.port1.close(); resolve(info); };
    const timer = setTimeout(() => done(null), ms);
    ch.port1.onmessage = (e: MessageEvent) => done(e.data && typeof e.data === 'object' ? e.data as WorkerInfo : null);
    try {
      w.postMessage({ type: 'ogc:info' }, [ch.port2]);
    } catch {
      done(null);
    }
  });
}

// PWA (сборка для GitHub Pages): офлайн через service worker, обновления и установка на экран.
// sw.js генерирует update.py: VERSION — хэш всех файлов (новая версия — новые данные или код), DATA — коммит outerpedia
// снимка, он меняется только с новыми данными. Новый worker ждёт; страница спрашивает его, что в нём (askWorker),
// и сравнивает со своими данными — dataVersion, meta.commit открытого набора:
// - другие данные — 'data', плашка «Вышли новые данные»;
// - те же — 'app', обновилось только приложение: «Готова новая версия» в «Ещё», а если worker ждал уже при загрузке
//   страницы (холодный запуск) — включаем сразу, перезагрузка; недовведённая вещь — в ogc.item.
// An app update switches on by itself at a quiet moment (owner, 2026-10-15): on the phone in split screen the app is never
// cold-started nor hidden, so it never got updates. quiet(hidden) — the page says whether a reload loses nothing now: the
// page went to the background, or QUIET_MS without a tap and nothing half-done (App). New versions are looked for every
// CHECK_MS while the page is visible, not only on coming back to it.
const CHECK_MS = 30 * 60_000;
const QUIET_MS = 10_000;
export function usePwa(dataVersion: string | null, quiet: (hidden: boolean) => boolean = () => false) {
  const quietRef = useRef(quiet);
  quietRef.current = quiet;
  const [pending, setPending] = useState<{ w: ServiceWorker; kind: UpdateKind } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (!window.OGC_PWA || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null;
    let alive = true;
    let asked = 0;
    let check: ReturnType<typeof setInterval> | undefined;
    // сравниваем с открытой страницей, а не с прежним ждущим: пришло обновление приложения, поверх него — с данными,
    // новый worker вытесняет прежний — нужна плашка данных. Ответ worker'а, которого уже вытеснили, не считается
    const found = async (w: ServiceWorker, boot: boolean) => {
      const n = ++asked;
      const kind = updateKind(dataVersion, await askWorker(w));
      if (!alive || n !== asked || w.state === 'redundant') return;
      setPending({ w, kind });
      if (boot && kind === 'app') w.postMessage('skipWaiting'); // перезагрузит onControllerChange
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && reg) reg.update().catch(() => {}); };
    // пришло посреди работы — само не включаем: плашка или «Готова новая версия» в «Ещё»
    const track = (w: ServiceWorker) => w.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) void found(w, false); });
    sw.register('sw.js').then((r) => {
      reg = r;
      // ждал уже при загрузке — холодный запуск: на форме ещё ничего не начато
      if (r.waiting && sw.controller) void found(r.waiting, true);
      // браузер начал качать новую версию ещё до регистрации — updatefound уже был
      if (r.installing) track(r.installing);
      r.addEventListener('updatefound', () => { if (r.installing) track(r.installing); });
      // проверяем обновление каждый раз, когда возвращаешься в приложение
      document.addEventListener('visibilitychange', onVisible);
      check = setInterval(() => { if (document.visibilityState === 'visible') r.update().catch(() => {}); }, CHECK_MS);
    }).catch(() => { /* без service worker страница просто работает онлайн */ });

    let reloading = false;
    const onControllerChange = () => { if (!reloading) { reloading = true; location.reload(); } };
    const onBeforeInstall = (e: Event) => { e.preventDefault(); setInstallPrompt(e as InstallPrompt); };
    const onInstalled = () => setInstallPrompt(null);
    sw.addEventListener('controllerchange', onControllerChange);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      alive = false;
      clearInterval(check);
      document.removeEventListener('visibilitychange', onVisible);
      sw.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dataVersion]);

  // an app update waits for a quiet moment: checked on every tick and when the page goes to the background
  useEffect(() => {
    if (pending?.kind !== 'app') return;
    const w = pending.w;
    let last = Date.now(), sent = false;
    const touch = () => { last = Date.now(); };
    const tryNow = () => {
      const hidden = document.visibilityState === 'hidden';
      if (sent || !(hidden || Date.now() - last >= QUIET_MS) || !quietRef.current(hidden)) return;
      sent = true;
      w.postMessage('skipWaiting'); // перезагрузит onControllerChange
    };
    const tick = setInterval(tryNow, 2000);
    const events = ['pointerdown', 'keydown', 'input'] as const;
    for (const e of events) window.addEventListener(e, touch, true);
    document.addEventListener('visibilitychange', tryNow);
    return () => {
      clearInterval(tick);
      for (const e of events) window.removeEventListener(e, touch, true);
      document.removeEventListener('visibilitychange', tryNow);
    };
  }, [pending]);

  const applyUpdate = useCallback(() => pending?.w.postMessage('skipWaiting'), [pending]);
  const install = useCallback(() => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => setInstallPrompt(null));
  }, [installPrompt]);

  // Safari не присылает beforeinstallprompt: на iPhone и iPad подсказываем, как добавить на экран «Домой» вручную
  const iosInstall = useMemo(() => !!window.OGC_PWA && isIos() && !isStandalone(), []);

  return { update: pending?.kind ?? null, applyUpdate, canInstall: !!installPrompt, install, iosInstall };
}
