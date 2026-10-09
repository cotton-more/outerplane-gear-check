// @vitest-environment jsdom
// Хранение экипировки (features/gear/store/useGear): при загрузке без исправлений не переписываем (Р17: исправила нормализация —
// пишем сразу, test/gear/gear.dom.test.ts); во время обучения на странице пусто и ничего не пишется — ни во время, ни после
// (запись из пустого стора тура стёрла бы вещи игрока); действие пишет сразу. Хранилище прежней модели (v1, v2) — перенос
// в v3 пишется при загрузке один раз, пулы и надетое те же (.x/0085 PLAN Д11, TESTS T8.1).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { EMPTY_GEAR, newPiece, type GearStore } from '@/features/gear/model/gear';
import { useGear, type GearApi } from '@/features/gear/store/useGear';
import { takeModelNote } from '@/features/gear/store/stored';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const PIECE = { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: null, at: '', note: 'x' };
// v3 с незнакомым полем вещи: на загрузке не переписывается (Caren в ростере — исправлять нечего)
const RAW = { v: 3, seq: 1, pieces: { p1: PIECE }, pools: { '2000089': ['p1'] } };
// v1 и v2 из прежних версий: в v2 — надетое и поля прежней модели («Собираю», autoNew, выбранный билд, булавка, билды v1)
const V1 = { v: 1, seq: 1, pieces: { p1: PIECE }, builds: { '2000089/Speed': { slots: { helmet: 'p1' }, at: '' } } };
const V2 = {
  ...RAW, v: 2, worn: { '2000089': { helmet: 'p1' } },
  marks: { '2000089/Speed': 'want' }, autoNew: ['2000089/Speed'], aim: { '2000089': '2000089/Speed' }, pinned: ['2000089'], v1builds: { x: 1 },
};
// вещь на Caren (v2)
const withPiece = (subs: Record<string, number>, slot: 'helmet' | 'armor' = 'helmet'): GearStore => {
  const { st, piece } = newPiece(EMPTY_GEAR, { slot, grade: 'unique', setId: speed, itemKey: null, main: null, subs });
  return { ...st, pools: { '2000089': [piece.id] } };
};
let root: Root | null = null;
let api: GearApi;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { await act(async () => root?.unmount()); root = null; localStorage.clear(); });

function Probe({ persist }: { persist: boolean }) {
  api = useGear(idx, persist);
  return null;
}
async function render(persist: boolean) {
  if (!localStorage.getItem('ogc.roster')) localStorage.setItem('ogc.roster', JSON.stringify(['2000089']));
  if (!root) root = createRoot(document.createElement('div'));
  await act(async () => root!.render(createElement(Probe, { persist })));
}
const stored = () => localStorage.getItem('ogc.gear');

describe('useGear', () => {
  it('при загрузке без исправлений хранилище не переписывается (незнакомое поле на месте, строка та же)', async () => {
    const text = JSON.stringify(RAW);
    localStorage.setItem('ogc.gear', text);
    await render(true);

    expect(stored()).toBe(text);
    expect(api.store).toMatchObject({ v: 3, pools: { '2000089': ['p1'] }, pieces: { p1: { yellow: { CHC: 2 }, note: 'x' } } });
  });

  it('T8.1 v2: при загрузке переписано в v3 один раз — поля прежней модели сняты, пулы, вещи и надетое те же', async () => {
    localStorage.setItem('ogc.gear', JSON.stringify(V2));
    await render(true);

    const once = stored();
    expect(JSON.parse(once!)).toEqual({ v: 3, seq: 1, pieces: { p1: PIECE }, pools: { '2000089': ['p1'] }, worn: { '2000089': { helmet: 'p1' } } });
    expect(api.store).toEqual(JSON.parse(once!));
    await act(async () => root?.unmount());
    root = null;
    await render(true);
    expect(stored()).toBe(once);
  });

  it('T8.1 v1: перенос в v3 записан при загрузке, вещь в пуле Caren', async () => {
    localStorage.setItem('ogc.gear', JSON.stringify(V1));
    await render(true);
    expect(JSON.parse(stored()!)).toEqual({ v: 3, seq: 1, pieces: { p1: PIECE }, pools: { '2000089': ['p1'] } });
  });

  it('T8.1 v2 с сабом не из данных — перенос в памяти, на загрузке не пишется (Р17)', async () => {
    const text = JSON.stringify({ ...V2, pieces: { p1: { ...PIECE, yellow: { CHC: 2, NEWSUB: 1 } } } });
    localStorage.setItem('ogc.gear', text);
    await render(true);
    expect([stored(), api.store.v, 'marks' in api.store]).toEqual([text, 3, false]);
  });

  it('сообщение о переносе: игроку прежней модели — один раз за всё время; новому и v3 — нет', async () => {
    localStorage.setItem('ogc.gear', JSON.stringify(V2));
    await render(true);
    expect([takeModelNote(idx), takeModelNote(idx)]).toEqual([{ marks: true }, null]);
    expect(localStorage.getItem('ogc.modelNote')).toBe('true');
    localStorage.setItem('ogc.gear', JSON.stringify(V2)); // хранилище снова v2 (другая вкладка): флаг уже стоит
    expect(takeModelNote(idx)).toBeNull();
    localStorage.clear();
    localStorage.setItem('ogc.gear', JSON.stringify(RAW));
    expect(takeModelNote(idx)).toBeNull();
    localStorage.clear();
    expect(takeModelNote(idx)).toBeNull();
    // v2 без вещей — прежней модели игрок не видел: сообщения нет (ревью этапа 10)
    localStorage.setItem('ogc.gear', JSON.stringify({ ...V2, seq: 0, pieces: {}, pools: {} }));
    expect(takeModelNote(idx)).toBeNull();
  });

  it('upgrade note: the «marks were cleared» sentence only when the old v2 store had marks, aim or «Не отдавать надетое»', async () => {
    const plain = { ...V2 } as Record<string, unknown>;
    for (const k of ['marks', 'autoNew', 'aim', 'pinned', 'v1builds']) delete plain[k];
    const note = (raw: unknown) => {
      localStorage.clear();
      localStorage.setItem('ogc.gear', JSON.stringify(raw));
      return takeModelNote(idx);
    };
    expect(note(V2)).toEqual({ marks: true });
    expect(note({ ...plain, marks: { '2000089/Speed': 'skip' } })).toEqual({ marks: true });
    expect(note({ ...plain, pinned: ['2000089'] })).toEqual({ marks: true });
    expect(note({ ...plain, aim: { '2000089': '2000089/Speed' } })).toEqual({ marks: true });
    // v2 without marks / aim / «Не отдавать» (empty ones too, and autoNew alone): the note without the sentence
    expect(note(plain)).toEqual({ marks: false });
    expect(note({ ...plain, marks: {}, aim: {}, pinned: [], autoNew: ['2000089/Speed'] })).toEqual({ marks: false });
    // v1 never had marks; fresh v3 has no note at all
    expect(note(V1)).toEqual({ marks: false });
    expect(note(RAW)).toBeNull();
    // the sentence is part of the flag: shown once, a second call has nothing
    expect([note(V2), takeModelNote(idx)]).toEqual([{ marks: true }, null]);
  });

  it('во время обучения: на странице пусто, запись ничего не делает; после тура не пишется, на странице — хранилище', async () => {
    const text = JSON.stringify(RAW);
    localStorage.setItem('ogc.gear', text);
    await render(false);
    expect(api.store).toEqual(EMPTY_GEAR);

    await act(async () => api.set(withPiece({ SPD: 1 }, 'armor')));
    await render(true);

    expect(stored()).toBe(text);
    expect(api.store).toMatchObject({ v: 3, pools: { '2000089': ['p1'] }, pieces: { p1: { yellow: { CHC: 2 } } } });
  });

  // нормализация ростера (X и Core Fusion X) что-то «исправила», но строку экипировки разобрать не вышло — Р17 не пишет:
  // иначе поверх непрочитанного легло бы пустое хранилище
  it('ogc.gear не разбирается (оборван) — при загрузке не перезаписывается, даже когда ростер нормализован', async () => {
    const text = JSON.stringify(RAW).slice(0, 40);
    localStorage.setItem('ogc.gear', text);
    localStorage.setItem('ogc.roster', JSON.stringify(['2000043', '2700043']));
    await render(true);

    expect([stored(), localStorage.getItem('ogc.roster')]).toEqual([text, JSON.stringify(['2000043', '2700043'])]);
  });

  it('ogc.roster не разбирается — при загрузке не перезаписывается, хотя у Caren есть вещи', async () => {
    localStorage.setItem('ogc.gear', JSON.stringify(withPiece({ SPD: 1 })));
    localStorage.setItem('ogc.roster', '["2000089"');
    await render(true);

    expect(localStorage.getItem('ogc.roster')).toBe('["2000089"');
  });

  it('экипировку сохранила более новая версия (v: 4): newer, и запись не перезаписывается', async () => {
    const text = JSON.stringify({ v: 4, seq: 0, pieces: {}, pools: {} });
    localStorage.setItem('ogc.gear', text);
    await render(true);
    expect(api.newer).toBe(true);
    await act(async () => api.set(withPiece({ SPD: 1 })));
    expect(stored()).toBe(text);
  });

  it('действие пишет сразу', async () => {
    await render(true);
    const next = withPiece({ SPD: 1 });
    await act(async () => api.set(next));
    expect(JSON.parse(stored()!)).toEqual(next);
  });
});
