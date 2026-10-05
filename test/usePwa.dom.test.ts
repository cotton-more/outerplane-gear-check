// @vitest-environment jsdom
// Обновление PWA (app/usePwa) на поддельном service worker: новые данные — плашка (update 'data'), только правки
// приложения — строка в подвале ('app'). Само включается только обновление приложения и только при холодном запуске
// (worker ждал уже при загрузке страницы); пришедшее посреди работы ждёт кнопки.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { usePwa } from '@/app/usePwa';

const PAGE = '090f6abeddf4c2dc000c836f956f6a0c3aa2101d';
const NEWER = '43a5d2db1c7e0f9a8b6d5e4f3a2b1c0d9e8f7a6b';

// worker с версией данных data — отвечает на 'ogc:info', как pwa/sw.template.js; всё, что ему прислали, — в sent
class FakeWorker extends EventTarget {
  sent: unknown[] = [];
  constructor(public data: string | null, public state: ServiceWorkerState = 'installed') { super(); }
  postMessage(msg: unknown, transfer?: Transferable[]) {
    this.sent.push(msg);
    if ((msg as { type?: string } | null)?.type === 'ogc:info') (transfer![0] as MessagePort).postMessage({ version: 'b2c4e6a8d0f1', data: this.data });
  }
  to(state: ServiceWorkerState) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
class FakeReg extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update() { return Promise.resolve(); }
  // новая версия посреди работы: скачалась и ждёт; прежний ждущий вытеснен
  arrive(w: FakeWorker) {
    w.state = 'installing';
    this.installing = w;
    this.dispatchEvent(new Event('updatefound'));
    this.waiting?.to('redundant');
    this.installing = null;
    this.waiting = w;
    w.to('installed');
  }
}

let reg: FakeReg;
let controller: object | null;
let root: Root | null = null;
let api: ReturnType<typeof usePwa>;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.OGC_PWA = true;
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { get controller() { return controller; }, register: () => Promise.resolve(reg), addEventListener() {}, removeEventListener() {} },
  });
});
beforeEach(() => { reg = new FakeReg(); controller = {}; });
afterEach(async () => { await act(async () => root?.unmount()); root = null; });

function Probe() {
  api = usePwa(PAGE);
  return null;
}
// регистрация, вопрос worker'у и ответ через MessageChannel — несколько задач цикла событий
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });
async function open() {
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(createElement(Probe)));
  await settle();
}

describe('usePwa: какое обновление и когда оно включается', () => {
  it('холодный запуск, у ждущего те же данные — включается сам, без плашки', async () => {
    const w = new FakeWorker(PAGE);
    reg.waiting = w;
    await open();
    expect(w.sent).toContain('skipWaiting');
    expect(api.update).toBe('app');
  });

  it('холодный запуск, у ждущего новые данные — плашка, сам не включается; «Обновить» включает', async () => {
    const w = new FakeWorker(NEWER);
    reg.waiting = w;
    await open();
    expect(api.update).toBe('data');
    expect(w.sent).not.toContain('skipWaiting');
    act(() => { api.applyUpdate(); });
    expect(w.sent).toContain('skipWaiting');
  });

  it('обновление приложения пришло посреди работы — строка в подвале, само не включается', async () => {
    await open();
    expect(api.update).toBeNull();
    const w = new FakeWorker(PAGE);
    reg.arrive(w);
    await settle();
    expect(api.update).toBe('app');
    expect(w.sent).not.toContain('skipWaiting');
  });

  it('поверх обновления приложения пришло с новыми данными — плашка данных: сравнение с открытой страницей', async () => {
    const app = new FakeWorker(PAGE);
    reg.waiting = app;
    await open(); // холодный запуск: app попросили включиться, но он не успел
    const data = new FakeWorker(NEWER);
    reg.arrive(data);
    await settle();
    expect(api.update).toBe('data');
    act(() => { api.applyUpdate(); });
    expect(data.sent).toContain('skipWaiting');
  });

  it('новые данные, а поверх — сборка на тех же данных, что у страницы: плашка уходит, остаётся строка', async () => {
    await open();
    reg.arrive(new FakeWorker(NEWER));
    await settle();
    expect(api.update).toBe('data');
    reg.arrive(new FakeWorker(PAGE));
    await settle();
    expect(api.update).toBe('app');
  });

  it('новая версия качалась уже при регистрации (updatefound был раньше) — её тоже замечаем, сама не включается', async () => {
    const w = new FakeWorker(PAGE, 'installing');
    reg.installing = w;
    await open();
    reg.installing = null;
    reg.waiting = w;
    w.to('installed');
    await settle();
    expect(api.update).toBe('app');
    expect(w.sent).not.toContain('skipWaiting');
  });

  it('первая установка (страницей ещё никто не управляет) — ни плашки, ни строки', async () => {
    controller = null;
    const w = new FakeWorker(NEWER);
    reg.waiting = w;
    await open();
    reg.arrive(new FakeWorker(NEWER));
    await settle();
    expect(api.update).toBeNull();
    expect(w.sent).toEqual([]);
  });
});
