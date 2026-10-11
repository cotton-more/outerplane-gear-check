// «Обмен вещами» и мягкий потолок крита (MODEL.md crit; .x/0135 PLAN stage 3): мерило знает N героя, комплект считает потерю
// крита, обмен из своего пула = лучшая раскладка приложения при упёртом крите, получатель с упёртым критом берёт вещь с CHD.
import { describe, expect, it } from 'vitest';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { profileOf, withNeed } from '@/game/build/profile';
import { bestLayout } from '@/features/gear/layout';
import { eligibleIn } from '@/features/gear/pool/info';
import { candidates } from '@/features/trade/model/cands';
import { bestKit } from '@/features/trade/model/kit';
import { SLOT_ORDER } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { worldOf } from '@/features/trade/model/world';
import type { SlotId } from '@/game/data/types';
import type { Subs } from '@/game/item/subs';
import { ctx, HERO, lcg, piece, realWorld, store } from './helpers';

const K = HERO.karen, R = HERO.rin;
const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const withCrit = (st: GearStore, crit: Record<string, number>): GearStore => ({ ...st, crit });

// Caren: her own 20 %, «A Prima Vista» (main CHC, T4) 48 %, Critical Hit armor, gloves, shoes; helmet with CHC 6
const capped = () => {
  const acc = piece('accessory', null, { CHD: 3, 'ATK%': 2, SPD: 1, HP: 1 }, { itemKey: '1036', main: 'CHC', bt: 4 });
  const rest = (['armor', 'gloves', 'shoes'] as const).map((s) => piece(s, 'Critical Hit', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }, { bt: 4 }));
  const hA = piece('helmet', 'Critical Hit', { CHC: 6, 'DEF%': 1, SPD: 1, HP: 1 }, { bt: 4 });
  const hB = piece('helmet', 'Critical Hit', { CHD: 4, CHC: 1, 'DEF%': 1, SPD: 1 }, { bt: 4 });
  return { acc, rest, hA, hB };
};

describe('мерило знает потолок крита', () => {
  it('получатель с упёртым критом берёт у Rin запасной шлем с CHD вместо своего надетого с CHC 6', () => {
    const { acc, rest, hA, hB } = capped();
    const st = store({ [K]: { pool: [acc, ...rest, hA], worn: [acc, ...rest, hA] }, [R]: { pool: [hB], worn: [] } });
    const plan = heroPlan(realWorld(st, [K, R]), { to: K }).plan;
    expect(plan.changes.map((c) => [c.slot, c.cand.item.id, c.was?.item.id])).toEqual([['helmet', hB.id, hA.id]]);
  });

  it('без упора (нет аксессуара с main CHC и сета крита) тот же шлем с CHC 6 остаётся', () => {
    const { hA, hB } = capped();
    const plain = piece('armor', 'Defense', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 });
    const st = store({ [K]: { pool: [hA, plain], worn: [hA, plain] }, [R]: { pool: [{ ...hB, setId: hA.setId }], worn: [] } });
    expect(heroPlan(realWorld(st, [K, R]), { to: K }).plan.changes).toEqual([]);
  });

  it('N из хранилища: при N 100 у Caren 20 % + CHC 6 потерь нет, при N 30 — есть', () => {
    const { hA } = capped();
    const st = store({ [K]: { pool: [hA], worn: [hA] } });
    const total = (s: GearStore) => {
      const w = worldOf(ctx, s, [K]);
      return bestKit(w.gauge(K)!, candidates(w, { to: K })).key.total;
    };
    expect(total(withCrit(st, { [K]: 30 }))).toBeLessThan(total(st));
  });
});

// модель обмена (candidates + bestKit) против лучшей раскладки приложения по тем же вещам героя, при разных N — как X1
// (gauge.test), но с аксессуарами main CHC и сетом Critical Hit, чтобы крит упирался
describe('X1c: обмен из своего пула = лучшая раскладка при упёртом крите', () => {
  it('40 случайных пулов Caren, Rin, Noa, Leah × N 100 / 60 / 35', () => {
    const rnd = lcg(13503);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
    const heroes = [K, R, HERO.noa, HERO.leah];
    const sets = ['Critical Hit', 'Critical Hit', 'Speed', 'Attack', 'Penetration', 'Critical Strike'];
    const stats = ['SPD', 'CHC', 'CHC', 'CHD', 'ATK%', 'DEF%', 'HP%'];
    let checked = 0, binding = 0;
    for (let i = 0; i < 40; i++) {
      const hero = pick(heroes);
      const pool: Piece[] = [];
      for (let j = 6 + Math.floor(rnd() * 8); j > 0; j--) {
        const slot = pick(SLOT_ORDER);
        const lit: Subs = {};
        const crit = slot === 'accessory' && rnd() < 0.6;
        while (Object.keys(lit).length < 3) { const k = pick(stats); if (!(crit && k === 'CHC')) lit[k] = 1 + Math.floor(rnd() * 6); }
        pool.push(piece(slot, ARMOR.includes(slot) ? pick(sets) : null, lit, { bt: rnd() < 0.5 ? 4 : 0, ...(crit ? { itemKey: '1036', main: 'CHC' } : {}) }));
      }
      const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && rnd() < 0.5);
      for (const need of [100, 60, 35]) {
        const st = withCrit(store({ [hero]: { pool, worn } }), { [hero]: need });
        const w = worldOf(ctx, st, [hero]);
        const kit = bestKit(w.gauge(hero)!, candidates(w, { to: hero }));
        const P = withNeed(profileOf(ctx, ctx.idx.CHAR[hero])!, need);
        const lay = bestLayout(P, pool, { eligible: eligibleIn(P, new Set(worn.map((p) => p.id))) }).value;
        checked++;
        if (lay.critLoss > 0) binding++;
        expect([kit.key.rank, kit.key.total / 1000], `случай ${i} N ${need}`).toEqual([lay.rank, expect.closeTo(lay.v, 2)]);
      }
    }
    expect(checked).toBe(120);
    expect(binding).toBeGreaterThan(30);
  });
});
