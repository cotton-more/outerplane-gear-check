// @vitest-environment jsdom
// Ростер (state/useRoster) между вкладками: другая вкладка отметила персонажа — подхватили, и звёздочка здесь его не
// стирает; то же при возврате на страницу (PWA в памяти пропустила событие).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { useRoster, type RosterApi } from '../src/state/useRoster';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const id = (name: string) => D.chars.find((c) => c.name === name)!.id;
const [CAREN, KAPPA, DAHLIA] = [id('Caren'), id('Kappa'), id('Dahlia')];
let root: Root | null = null;
let api: RosterApi;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { await act(async () => root?.unmount()); root = null; localStorage.clear(); });

function Probe() {
  api = useRoster(idx);
  return null;
}
async function mount(roster: string[]) {
  localStorage.setItem('ogc.roster', JSON.stringify(roster));
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(createElement(Probe)));
}
const stored = () => JSON.parse(localStorage.getItem('ogc.roster')!);

describe('useRoster между вкладками', () => {
  it('событие storage: персонаж из другой вкладки виден, звёздочка здесь его сохраняет', async () => {
    await mount([CAREN]);
    const other = JSON.stringify([CAREN, KAPPA]);
    localStorage.setItem('ogc.roster', other);
    await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: 'ogc.roster', newValue: other })); });

    expect([...api.roster]).toEqual([CAREN, KAPPA]);
    await act(async () => api.toggle(DAHLIA));
    expect(stored()).toEqual([CAREN, KAPPA, DAHLIA]);
  });

  it('вернулись на страницу — ростер перечитан', async () => {
    await mount([CAREN]);
    localStorage.setItem('ogc.roster', JSON.stringify([KAPPA]));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    expect([...api.roster]).toEqual([KAPPA]);
    await act(async () => api.add([DAHLIA]));
    expect(stored()).toEqual([KAPPA, DAHLIA]);
  });
});

// Core Fusion (logic/fusion): ростер читается вместе с экипировкой и нормализуется в памяти; окна перехода и пакетные
// добавления — в App (test/gear.dom.test.ts). Здесь — загрузка и страховка записи
describe('useRoster: Core Fusion', () => {
  const [ETERNAL, CF_ETERNAL] = [id('Eternal'), id('Core Fusion Eternal')];
  const gear = (pools: Record<string, string[]>) => localStorage.setItem('ogc.gear', JSON.stringify({
    v: 2, seq: 1, pools,
    pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: D.sets[0].id, itemKey: null, main: null, yellow: { SPD: 1 }, lit: { SPD: 1 }, bt: null, at: '' } },
  }));

  it('в хранилище оба — в ростере только Core Fusion на месте X; хранилище — как было, до первой записи', async () => {
    await mount([ETERNAL, CAREN, CF_ETERNAL]);
    expect([...api.roster]).toEqual([CAREN, CF_ETERNAL]);
    expect(stored()).toEqual([ETERNAL, CAREN, CF_ETERNAL]);

    await act(async () => api.add([KAPPA]));
    expect(stored()).toEqual([CAREN, CF_ETERNAL, KAPPA]);
  });

  it('X в ростере, вещи — у Core Fusion: в ростере Core Fusion вместо X', async () => {
    gear({ [CF_ETERNAL]: ['p1'] });
    await mount([ETERNAL, CAREN]);
    expect([...api.roster]).toEqual([CF_ETERNAL, CAREN]);
  });

  it('вещи у X, Core Fusion в ростере — ростер тот же (вещи переходят к Core Fusion — useGear)', async () => {
    gear({ [ETERNAL]: ['p1'] });
    await mount([CF_ETERNAL]);
    expect([...api.roster]).toEqual([CF_ETERNAL]);
  });

  it('запись с X и Core Fusion вместе — остаётся Core Fusion', async () => {
    await mount([]);
    await act(async () => api.replace([ETERNAL, CAREN, CF_ETERNAL]));
    expect(stored()).toEqual([CAREN, CF_ETERNAL]);
  });
});
