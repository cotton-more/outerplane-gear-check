/// <reference types="vitest/config" />
// Сборка: одно HTML-приложение со встроенными JS и CSS (build/app/index.html).
// Данные подставляет update.py вместо маркера /*__OGC_DATA__*/null — см. index.html.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const DOCS = resolve(import.meta.dirname, 'docs');
const MARKER = '/*__OGC_DATA__*/null';
const MIME: Record<string, string> = { '.webp': 'image/webp', '.png': 'image/png' };

// Режим разработки работает на собранном docs/: данные — из docs/index.html, картинки — из docs/img и docs/icons.
// Отдаём только эти две папки, чтобы docs/index.html и docs/sw.js не подменили dev-страницу.
function devData(): Plugin {
  return {
    name: 'ogc-dev-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url || '').split('?')[0]);
        if (!/^\/(img|icons)\//.test(path)) return next();
        const file = join(DOCS, path);
        if (!file.startsWith(DOCS + '/') || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    transformIndexHtml(html) {
      const page = join(DOCS, 'index.html');
      const m = existsSync(page) ? /<script>window\.OGC_DATA = (\{.*?\});<\/script>/s.exec(readFileSync(page, 'utf8')) : null;
      if (!m) server_warn();
      return html.replace(MARKER, m ? m[1] : 'null');
    },
  };
}
function server_warn() {
  console.warn('[ogc] в docs/index.html нет данных — собери сайт: task build:pwa');
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), devData()],
  build: {
    outDir: 'build/app',
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false }, // один встроенный скрипт — подгружать нечего
  },
  // Vite сканирует *.html в поисках зависимостей — docs/index.html с встроенным бандлом ему ни к чему
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/docs/**', '**/build/**'] } },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
