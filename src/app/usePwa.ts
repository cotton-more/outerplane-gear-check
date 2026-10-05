import { useCallback, useEffect, useMemo, useState } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

// iPhone и iPad (iPadOS притворяется Mac'ом, выдаёт его сенсорный экран)
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// ответ worker'а на { type: 'ogc:info' } (pwa/sw.template.js): версия приложения и версия данных — коммит outerpedia
export interface WorkerInfo { version?: unknown; data?: unknown }
// 'data' — вышли новые данные: плашка «Обновить»; 'app' — только правки приложения: строка в подвале
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
// - те же — 'app', обновилось только приложение: тихая строка в подвале, а если worker ждал уже при загрузке
//   страницы (холодный запуск) — включаем сразу, перезагрузка; недовведённая вещь — в ogc.item.
export function usePwa(dataVersion: string | null) {
  const [pending, setPending] = useState<{ w: ServiceWorker; kind: UpdateKind } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (!window.OGC_PWA || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null;
    let alive = true;
    let asked = 0;
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
    // пришло посреди работы — само не включаем: плашка или строка в подвале
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
      document.removeEventListener('visibilitychange', onVisible);
      sw.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dataVersion]);

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
