// «Обмен вещами», подсказка закреплённых (R6.5): .x/0040-trade/TESTS.md, G1–G4, G6 (G5 — команда, этап 5).
import { describe, expect, it } from 'vitest';
import { heroPlan, pinnedHint } from '../src/logic/trade/plan';
import { synthWorld } from './trade.helpers';

// Рин (R) носит шлем r1; у закреплённой Карен (K) шлем k1 для Рин лучше на `gain`; Лея (L) закреплена, её перчатки l1
// для Рин лучше на `leah` (по умолчанию на 0,2 — порог не проходят)
const world = (o: { gain: number; leah?: number; set?: { conv: boolean } }) => synthWorld({
  items: { r1: { slot: 'helmet' }, ra: { slot: 'armor', set: 'S' }, k1: { slot: 'helmet', set: o.set ? 'S' : undefined }, rg: { slot: 'gloves' }, l1: { slot: 'gloves' } },
  heroes: {
    R: {
      worn: { helmet: 'r1', armor: 'ra', gloves: 'rg' }, value: { r1: 5, ra: 5, rg: 5, k1: 5 + o.gain, l1: 5 + (o.leah ?? 0.2) },
      parts: o.set ? [{ set: 'S', n: 2, conv: o.set.conv }] : [], bonus: o.set ? { S: { 2: 0 } } : {},
    },
    K: { worn: { helmet: 'k1' }, pinned: true, value: { k1: 5, r1: 4 } },
    L: { worn: { gloves: 'l1' }, pinned: true, value: { l1: 5, rg: 4 } },
  },
});

describe('G. подсказка закреплённых', () => {
  it('G1: вещь закреплённой Карен лучше на ≥ 1 — «У Карен лучше: +N»', () => {
    expect(pinnedHint(world({ gain: 1.5 }), { to: 'R' })).toMatchObject({ heroes: ['K'], gain: 1500 });
  });
  it('G2: лучше на 0,5, сеты те же — подсказки нет', () => {
    expect(pinnedHint(world({ gain: 0.5 }), { to: 'R' })).toBeNull();
  });
  it('G3: лучше на 0,3, но включает неконвертируемый сет — подсказка есть', () => {
    expect(pinnedHint(world({ gain: 0.3, set: { conv: false } }), { to: 'R' })?.heroes).toEqual(['K']);
  });
  it('G3: то же с конвертируемым сетом — подсказки нет', () => {
    expect(pinnedHint(world({ gain: 0.3, set: { conv: true } }), { to: 'R' })).toBeNull();
  });
  it('G4: «Взять» — вещь Карен в плане, дыра Карен закрыта по R8, Карен остаётся закреплённой', () => {
    const w = world({ gain: 1.5 });
    expect(heroPlan(w, { to: 'R' }).plan.changes).toEqual([]); // без «Взять» вещь Карен не берётся
    const h = pinnedHint(w, { to: 'R' })!;
    expect(h.plan.plan.changes.map((c) => c.cand.item.id)).toEqual(['k1']);
    expect(h.plan.holes.fills.find((f) => f.hero === 'K')!.cand?.item.id).toBe('r1'); // снятая с Рин
    expect(w.heroes.find((x) => x.id === 'K')!.pinned).toBe(true);
  });
  it('G6: закреплены Карен и Лея, в лучший план попали только вещи Карен → «У Карен», Леи нет', () => {
    expect(pinnedHint(world({ gain: 1.5, leah: 0.2 }), { to: 'R' })!.heroes).toEqual(['K']);
  });
  it('G6: обе вещи проходят порог — обе в подсказке', () => {
    expect(pinnedHint(world({ gain: 1.5, leah: 1.5 }), { to: 'R' })!.heroes.sort()).toEqual(['K', 'L']);
  });
});
