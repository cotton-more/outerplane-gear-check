// @vitest-environment jsdom
// Хранение экипировки (state/useGear): при загрузке не переписываем; во время обучения на странице пусто и ничего не
// пишется — ни во время, ни после (запись из пустого стора тура стёрла бы вещи игрока); действие пишет сразу.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { EMPTY_GEAR, newPiece, type GearStore } from '../src/logic/gear';
import { useGear, type GearApi } from '../src/state/useGear';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
// v1 из прежней версии: читается с переносом, но на загрузке не переписывается
const RAW = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: null, at: '', note: 'x' } }, builds: { '2000089/Speed': { slots: { helmet: 'p1' }, at: '' } } };
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
  if (!root) root = createRoot(document.createElement('div'));
  await act(async () => root!.render(createElement(Probe, { persist })));
}
const stored = () => localStorage.getItem('ogc.gear');

describe('useGear', () => {
  it('при загрузке хранилище не переписывается (незнакомое поле на месте, строка та же)', async () => {
    const text = JSON.stringify(RAW);
    localStorage.setItem('ogc.gear', text);
    await render(true);

    expect(stored()).toBe(text);
    expect(api.store).toMatchObject({ v: 2, pools: { '2000089': ['p1'] }, pieces: { p1: { yellow: { CHC: 2 } } } });
  });

  it('во время обучения: на странице пусто, запись ничего не делает; после тура не пишется, на странице — хранилище', async () => {
    const text = JSON.stringify(RAW);
    localStorage.setItem('ogc.gear', text);
    await render(false);
    expect(api.store).toEqual(EMPTY_GEAR);

    await act(async () => api.set(withPiece({ SPD: 1 }, 'armor')));
    await render(true);

    expect(stored()).toBe(text);
    expect(api.store).toMatchObject({ v: 2, pools: { '2000089': ['p1'] }, pieces: { p1: { yellow: { CHC: 2 } } } });
  });

  it('экипировку сохранила более новая версия (v: 3): newer, и запись не перезаписывается', async () => {
    const text = JSON.stringify({ v: 3, seq: 0, pieces: {}, pools: {} });
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
