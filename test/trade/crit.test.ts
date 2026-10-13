// «Обмен вещами» и мягкий потолок крита (MODEL.md §12 item 6; .x/0135 PLAN stage 3): мерило знает N героя, комплект считает потерю
// крита, обмен из своего пула = лучшая раскладка приложения при упёртом крите, получатель с упёртым критом берёт вещь с CHD.
import { describe, expect, it } from 'vitest';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { profileOf, withNeed } from '@/game/build/profile';
import { bestLayout } from '@/features/gear/layout';
import { eligibleIn } from '@/features/gear/pool/info';
import { candidates, holderLoss } from '@/features/trade/model/cands';
import { bestKit, keyOf } from '@/features/trade/model/kit';
import { cmpKit, SLOT_ORDER, type Cand, type Gauge } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { linesOf } from '@/features/trade/model/view';
import { worldOf } from '@/features/trade/model/world';
import type { Dataset, SlotId } from '@/game/data/types';
import { createIndex } from '@/game/data';
import { makeCtx } from '@/game/context';
import type { Subs } from '@/game/item/subs';
import { bruteKit, ctx, D as FIX, HERO, idx as fixIdx, lcg, piece, realWorld, store } from './helpers';
import * as S from '../gear/statSets';

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
  it('получатель с упёртым критом берёт у Rin надетый шлем с CHD вместо своего надетого с CHC 6', () => {
    const { acc, rest, hA, hB } = capped();
    const st = store({ [K]: { pool: [acc, ...rest, hA], worn: [acc, ...rest, hA] }, [R]: { pool: [hB], worn: [hB] } });
    const plan = heroPlan(realWorld(st, [K, R]), { to: K }).plan;
    expect(plan.changes.map((c) => [c.slot, c.cand.item.id, c.was?.item.id])).toEqual([['helmet', hB.id, hA.id]]);
  });

  // F1 of review 0136, decision 14: the plan line names the extra crit, so stats + sets − crit add up to the gain
  it('the plan line carries the kit\'s extra crit before and after: 6.267 → 2.267, and the parts add up', () => {
    const { acc, rest, hA, hB } = capped();
    const st = store({ [K]: { pool: [acc, ...rest, hA], worn: [acc, ...rest, hA] }, [R]: { pool: [hB], worn: [hB] } });
    const world = realWorld(st, [K, R]);
    const hp = heroPlan(world, { to: K });
    const step = { plans: [{ to: K, plan: hp.plan }] };
    const l = linesOf(world, advance(world, step), [K], heroMoves(world, K, step)).find((x) => x.hero === K)!;
    expect([l.critBefore, l.critAfter]).toEqual([6267, 2267]);
    expect([l.on, l.off]).toEqual([[], []]);
    expect(l.after - l.before).toBe(l.ptsAfter - l.ptsBefore + l.critBefore - l.critAfter);
    expect(l.after - l.before).toBe(2600);
  });

  // Review 0136 F3 (b): her CHC-main accessory lowers capped Caren's V (layout T4.3c), yet taking it is no gain for her
  it('holder loss is never negative: taking capped Caren\'s CHC-main accessory costs her 0, not −11.35', () => {
    const arm = ARMOR.map((s) => piece(s, 'Critical Hit', { CHC: 6, 'DEF%': 2, SPD: 1, HP: 1 }, { bt: 4 }));
    const acc = piece('accessory', null, { CHD: 1, SPD: 1, HP: 1, RES: 1 }, { main: 'CHC', unlisted: true, bt: 4 });
    const w = worldOf(ctx, store({ [K]: { pool: [acc, ...arm], worn: [acc, ...arm] } }), [K]);
    const k = w.heroes.find((h) => h.id === K)!;
    expect(holderLoss(w, k, w.gauge(K)!, 'accessory')).toBe(0);
    expect(holderLoss(w, k, w.gauge(K)!, 'helmet')).toBeGreaterThan(0);
  });

  it('без упора (нет аксессуара с main CHC и сета крита) тот же шлем с CHC 6 остаётся', () => {
    const { hA, hB } = capped();
    const plain = piece('armor', 'Defense', { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 });
    const st = store({ [K]: { pool: [hA, plain], worn: [hA, plain] }, [R]: { pool: [{ ...hB, setId: hA.setId }], worn: [{ ...hB, setId: hA.setId }] } });
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

// Review 0136 F4 / F8 (b): bestKit against bruteKit on real gauges with crit (holders, set rows, the quick bound), and the
// quick bound against a gauge that always asks for the loss
describe('X2d: real crit gauges — bestKit = bruteKit, the quick bound never hides a loss', () => {
  const CH = S.setId('Critical Hit');
  const critHeroes = S.heroes.filter((c) => profileOf(S.ctx, c)?.critOn);
  const critPool = (g: S.Gen, c: (typeof critHeroes)[number]): Piece[] => {
    const P = profileOf(S.ctx, c)!;
    const out = S.randPool(g, P, 2, true);
    if (g.rnd() < 0.7) out.push(S.randGear(g, P, 'accessory'));
    for (let i = g.int(4); i > 0; i--) out.push({ ...S.randArmor(g, P, g.pick(S.ARMOR)), setId: CH });
    return out.map((p) => {
      if (p.slot === 'accessory' && g.rnd() < 0.6 && !p.lit.CHC) return { ...p, main: 'CHC' };
      if (p.slot !== 'accessory' && g.rnd() < 0.35) { const lit = { ...p.lit, CHC: 1 + g.int(6) }; if (Object.keys(lit).length <= 4) return { ...p, lit, yellow: lit }; }
      return p;
    });
  };
  const kitIds = (s: Partial<Record<SlotId, Cand>>) => SLOT_ORDER.map((x) => s[x]?.item.id ?? '-').join(' ');

  it('120 worlds of 2–3 heroes, N 100…30', () => {
    const g = S.gen(7001);
    let cases = 0, binding = 0;
    for (let t = 0; t < 120; t++) {
      const hs = [g.pick(critHeroes), g.pick(critHeroes), g.pick(critHeroes)].filter((c, i, a) => a.indexOf(c) === i);
      const spec: Record<string, { pool: Piece[]; worn?: Piece[] }> = {};
      for (const c of hs) {
        const pool = critPool(g, c);
        spec[c.id] = { pool, worn: SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && g.rnd() < 0.7) };
      }
      const st = withCrit(store(spec), Object.fromEntries(hs.map((c) => [c.id, g.pick([100, 85, 70, 50, 30])])));
      const w = worldOf(ctx, st, hs.map((c) => c.id));
      const gg = w.gauge(hs[0].id);
      if (!gg?.crit) continue;
      const cands = candidates(w, { to: hs[0].id });
      if (SLOT_ORDER.reduce((n, s) => n * ((cands[s]?.length ?? 0) + 1), 1) > 300000) continue;
      cases++;
      const a = bestKit(gg, cands), b = bruteKit(gg, cands);
      if (a.key.crit > 0) binding++;
      expect([cmpKit(a.key, b.key) === 0, kitIds(a.slots)], `world ${t}`).toEqual([true, kitIds(b.slots)]);
      const force: Gauge = { ...gg, crit: { ...gg.crit, knee: -1 } };
      for (let k = 0; k < 20; k++) {
        const slots: Partial<Record<SlotId, Cand>> = {};
        for (const s of SLOT_ORDER) { const xs = cands[s] ?? []; if (xs.length && g.rnd() < 0.8) slots[s] = g.pick(xs); }
        expect(keyOf(gg, slots).total, `world ${t} kit ${k}`).toBe(keyOf(force, slots).total);
      }
    }
    expect(cases).toBeGreaterThan(100);
    expect(binding).toBeGreaterThan(40);
  });

  it('a second set with CHC rows (Attack with the Critical Hit bonus): two 2P T4 halves give 36 %, the quick bound sees it', () => {
    const atk = S.setId('Attack');
    const bonus = S.D.sets.find((s) => s.id === CH)!.bonus;
    const D2: Dataset = { ...S.D, sets: S.D.sets.map((s) => (s.id === atk ? { ...s, bonus } : s)) };
    const ctx2 = makeCtx(createIndex(D2), { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
    // Caren 20 % + CHC 5 + CHC 5 = 50 %; rows 18 + 18 = 36 → 86 %; N 97 → knee 82, while 50 + 30 (one set ×4) = 80
    const pool = [
      S.mk('p1', 'helmet', 'Attack', { CHC: 5, 'DEF%': 2, SPD: 1, HP: 1 }), S.mk('p2', 'armor', 'Attack', { CHC: 5, 'DEF%': 2, SPD: 1, HP: 1 }),
      S.mk('p3', 'gloves', 'Critical Hit', { 'DEF%': 3, CHD: 2, SPD: 1, HP: 1 }), S.mk('p4', 'shoes', 'Critical Hit', { 'DEF%': 3, CHD: 2, SPD: 1, HP: 1 }),
    ];
    const w = worldOf(ctx2, withCrit(store({ [K]: { pool, worn: pool } }), { [K]: 97 }), [K]);
    const gg = w.gauge(K)!;
    const cands = candidates(w, { to: K });
    const slots = Object.fromEntries(ARMOR.map((s) => [s, cands[s]!.find((c) => c.item.slot === s)!]));
    const force: Gauge = { ...gg, crit: { ...gg.crit!, knee: -1 } };
    expect(gg.crit!.rowsMax).toBe(36);
    expect(keyOf(gg, slots).crit).toBe(142);
    expect(keyOf(gg, slots).total).toBe(keyOf(force, slots).total);
  });
});

// PLAN 0190 stage 3: transcend crit is the hero's own (C₀): Poolside Trickster Regina at ★5 has 5 + 5 + 10 + 65 = 85 % before gear
describe('stars: the trade gauge counts transcend crit', () => {
  const REGINA = FIX.chars.find((c) => c.name === 'Poolside Trickster Regina')!.id;
  const starred = (star: number | null) => makeCtx(fixIdx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set(), undefined, undefined, star ? { [REGINA]: star } : undefined);
  const hA = () => piece('helmet', 'Critical Hit', { CHC: 6, 'DEF%': 1, SPD: 1, HP: 1 }, { bt: 4 });
  const hB = () => piece('helmet', 'Critical Hit', { CHD: 4, CHC: 1, 'DEF%': 1, SPD: 1 }, { bt: 4 });

  it('the gauge\'s own crit includes 65 at ★5 (and not at ★4 or when not set)', () => {
    const a = hA();
    const st = store({ [REGINA]: { pool: [a], worn: [a] } });
    const own = (star: number | null) => worldOf(starred(star), st, [REGINA]).gauge(REGINA)!.crit!.own;
    expect([own(null), own(4), own(5), own(6)]).toEqual([20, 20, 85, 85]);
  });

  it('at ★5 the kit takes the CHD helmet instead of CHC 6 (crit is capped), without stars the CHC 6 one', () => {
    const a = hA(), b = hB();
    const st = store({ [REGINA]: { pool: [a, b], worn: [a] } }, { crit: { [REGINA]: 100 } });
    const pickOf = (star: number | null) => {
      const w = worldOf(starred(star), st, [REGINA]);
      const kit = bestKit(w.gauge(REGINA)!, candidates(w, { to: REGINA }));
      return kit.slots.helmet?.item.id;
    };
    expect(pickOf(null)).toBe(a.id);
    expect(pickOf(5)).toBe(b.id);
  });
});
