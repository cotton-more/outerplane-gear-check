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

// Core Fusion X заменяет X (решение владельца): в ростере не бывает обоих
describe('useRoster: Core Fusion', () => {
  const [ETERNAL, CF_ETERNAL, CF_SNOW, SNOW] = [id('Eternal'), id('Core Fusion Eternal'), id('Core Fusion Snow'), id('Snow')];

  it('звезда на Core Fusion убирает X; «Вернуть» — X обратно, Core Fusion убран', async () => {
    await mount([CAREN, ETERNAL]);
    let ch!: ReturnType<RosterApi['toggle']>;
    await act(async () => { ch = api.toggle(CF_ETERNAL); });

    expect([...api.roster]).toEqual([CAREN, CF_ETERNAL]);
    expect(ch.replaced).toEqual([{ fusion: CF_ETERNAL, base: ETERNAL }]);
    await act(async () => api.revert(ch));
    expect(stored()).toEqual([CAREN, ETERNAL]);
  });

  it('X при Core Fusion X в ростере не добавляется — ни звездой, ни набором', async () => {
    await mount([CF_ETERNAL]);
    let ch!: ReturnType<RosterApi['toggle']>;
    await act(async () => { ch = api.toggle(ETERNAL); });

    expect(ch.refused).toEqual([{ base: ETERNAL, fusion: CF_ETERNAL }]);
    expect(ch.added).toEqual([]);
    await act(async () => api.add([ETERNAL, KAPPA]));
    expect(stored()).toEqual([CF_ETERNAL, KAPPA]);
  });

  it('в хранилище оба — в ростере только Core Fusion; следующая запись чистит хранилище', async () => {
    await mount([ETERNAL, CF_ETERNAL, CAREN]);
    expect([...api.roster]).toEqual([CF_ETERNAL, CAREN]);
    expect(stored()).toEqual([ETERNAL, CF_ETERNAL, CAREN]);

    await act(async () => api.add([KAPPA]));
    expect(stored()).toEqual([CF_ETERNAL, CAREN, KAPPA]);
  });

  it('набор с обоими («Отметить показанных», код ростера) — остаётся Core Fusion, в любом порядке', async () => {
    await mount([]);
    await act(async () => api.add([ETERNAL, CF_ETERNAL, SNOW]));
    await act(async () => api.add([CF_SNOW]));
    expect(stored()).toEqual([CF_ETERNAL, CF_SNOW]);

    await act(async () => api.replace([CAREN, ETERNAL, CF_ETERNAL]));
    expect(stored()).toEqual([CAREN, CF_ETERNAL]);
  });

  it('звезда на X, который спрятан Core Fusion из хранилища, — X не появляется', async () => {
    await mount([ETERNAL, CF_ETERNAL]);
    await act(async () => { api.toggle(ETERNAL); });
    expect([...api.roster]).toEqual([CF_ETERNAL]);
  });
});
