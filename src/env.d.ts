import type { Dataset } from './data/types';

declare global {
  // версия сборки — vite.config.ts: последний коммит кода приложения; dirty — собрано с незакоммиченными правками
  const __BUILD__: { hash: string; date: string; dirty: boolean };
  interface Window {
    OGC_DATA?: Dataset | null; // подставляет update.py (или dev-сервер из docs/index.html)
    OGC_PWA?: boolean;         // только в сборке для GitHub Pages: включает service worker
    __ogc?: unknown;
  }
}
