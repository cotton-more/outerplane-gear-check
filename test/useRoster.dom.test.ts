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
