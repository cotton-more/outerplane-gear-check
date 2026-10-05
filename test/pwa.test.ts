// Какое обновление ждёт (app/usePwa): «Вышли новые данные» — только когда ждущий worker ответил и версия данных у него
// другая, чем у открытой страницы. Всё остальное — обновление приложения: про новые данные без доказательства не говорим.
import { describe, expect, it } from 'vitest';
import { askWorker, updateKind } from '@/app/usePwa';

const PAGE = '090f6abeddf4c2dc000c836f956f6a0c3aa2101d';
const NEWER = '43a5d2db1c7e0f9a8b6d5e4f3a2b1c0d9e8f7a6b';

describe('updateKind', () => {
  it('у ждущего worker\'а другая версия данных — новые данные', () => {
    expect(updateKind(PAGE, { version: 'b2c4e6a8d0f1', data: NEWER })).toBe('data');
  });

  it('та же версия данных — обновилось только приложение', () => {
    expect(updateKind(PAGE, { version: 'b2c4e6a8d0f1', data: PAGE })).toBe('app');
  });

  it('нет ответа (sw.js прежнего выпуска молчит, таймаут) — приложение', () => {
    expect(updateKind(PAGE, null)).toBe('app');
    expect(updateKind(PAGE, undefined)).toBe('app');
  });

  it('в ответе нет версии данных, она пустая или не строка — приложение', () => {
    expect(updateKind(PAGE, {})).toBe('app');
    expect(updateKind(PAGE, { version: 'b2c4e6a8d0f1', data: null })).toBe('app');
    expect(updateKind(PAGE, { version: 'b2c4e6a8d0f1', data: '' })).toBe('app');
    expect(updateKind(PAGE, { data: 42 })).toBe('app');
  });

  it('у открытой страницы нет коммита — приложение, даже если у worker\'а он есть', () => {
    expect(updateKind(null, { data: NEWER })).toBe('app');
    expect(updateKind('', { data: NEWER })).toBe('app');
    expect(updateKind(undefined, { data: NEWER })).toBe('app');
  });
});

// ServiceWorker, у которого есть только postMessage; answer получает сообщение и порт MessageChannel
const worker = (answer: (msg: unknown, port: MessagePort) => void) =>
  ({ postMessage: (msg: unknown, transfer: Transferable[]) => answer(msg, transfer[0] as MessagePort) }) as unknown as ServiceWorker;

describe('askWorker', () => {
  it('спрашивает { type: "ogc:info" } и отдаёт ответ из порта', async () => {
    const sent: unknown[] = [];
    const w = worker((msg, port) => { sent.push(msg); port.postMessage({ version: 'b2c4e6a8d0f1', data: NEWER }); });
    await expect(askWorker(w)).resolves.toEqual({ version: 'b2c4e6a8d0f1', data: NEWER });
    expect(sent).toEqual([{ type: 'ogc:info' }]);
  });

  it('worker молчит (sw.js прежнего выпуска) — null по таймауту', async () => {
    await expect(askWorker(worker(() => {}), 20)).resolves.toBeNull();
  });

  it('ответ — не объект — null', async () => {
    await expect(askWorker(worker((_, port) => port.postMessage('skipWaiting')))).resolves.toBeNull();
  });

  it('postMessage бросил — null сразу, без ожидания', async () => {
    const w = { postMessage: () => { throw new Error('InvalidStateError'); } } as unknown as ServiceWorker;
    const t0 = Date.now();
    await expect(askWorker(w, 10_000)).resolves.toBeNull();
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
