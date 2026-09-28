// @vitest-environment jsdom
// Хранение экипировки (state/useGear): при загрузке не переписываем; во время обучения на странице пусто и ничего не
// пишется, после него — пишется то, что сделали; действие пишет сразу.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { buildKey, EMPTY_GEAR, equip } from '../src/logic/gear';
import { useGear, type GearApi } from '../src/state/useGear';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const K = buildKey('2000089', 'Speed');
const RAW = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: null, at: '', note: 'x' } }, builds: { [K]: { slots: { helmet: 'p1' }, at: '' } } };
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
    expect(api.store.pieces.p1).toMatchObject({ yellow: { CHC: 2 } });
  });

  it('во время обучения: на странице пусто, запись ждёт конца тура; после — пишется', async () => {
    localStorage.setItem('ogc.gear', JSON.stringify(RAW));
    await render(false);
    expect(api.store).toEqual(EMPTY_GEAR);

    const next = equip(EMPTY_GEAR, K, { slot: 'armor', grade: 'unique', setId: speed, itemKey: null, main: null, subs: { SPD: 1 } }).store;
    await act(async () => api.set(next));
    expect(JSON.parse(stored()!)).toEqual(RAW);

    await render(true);
    expect(JSON.parse(stored()!)).toEqual(next);
  });

  it('действие пишет сразу', async () => {
    await render(true);
    const next = equip(EMPTY_GEAR, K, { slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, subs: { SPD: 1 } }).store;
    await act(async () => api.set(next));
    expect(JSON.parse(stored()!)).toEqual(next);
  });
});
