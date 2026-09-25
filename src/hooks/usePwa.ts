import { useCallback, useEffect, useMemo, useState } from 'react';

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<unknown>;
}

// iPhone и iPad (iPadOS притворяется Mac'ом, выдаёт его сенсорный экран)
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

// PWA (сборка для GitHub Pages): офлайн через service worker, плашка «вышли новые данные» и установка на экран.
// sw.js генерирует update.py; версия — хэш содержимого docs/, поэтому новая версия = новые данные или код.
export function usePwa() {
  const [pendingWorker, setPendingWorker] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    if (!window.OGC_PWA || !('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const sw = navigator.serviceWorker;
    let reg: ServiceWorkerRegistration | null = null;
    const onVisible = () => { if (document.visibilityState === 'visible' && reg) reg.update().catch(() => {}); };
    sw.register('sw.js').then((r) => {
      reg = r;
      // новая версия ждёт: страница сама предлагает обновиться, чтобы не перезагружаться посреди оценки
      if (r.waiting && sw.controller) setPendingWorker(r.waiting);
      r.addEventListener('updatefound', () => {
        const w = r.installing;
        if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) setPendingWorker(w); });
      });
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
      document.removeEventListener('visibilitychange', onVisible);
      sw.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const applyUpdate = useCallback(() => pendingWorker?.postMessage('skipWaiting'), [pendingWorker]);
  const install = useCallback(() => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => setInstallPrompt(null));
  }, [installPrompt]);

  // Safari не присылает beforeinstallprompt: на iPhone и iPad подсказываем, как добавить на экран «Домой» вручную
  const iosInstall = useMemo(() => !!window.OGC_PWA && isIos() && !isStandalone(), []);

  return { updateReady: !!pendingWorker, applyUpdate, canInstall: !!installPrompt, install, iosInstall };
}
