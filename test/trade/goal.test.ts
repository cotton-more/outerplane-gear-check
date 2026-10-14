// The EFF goal in the boss team trade (MODEL.md §13; HISTORY.md 0200-boss E3): the gauge's EFF against effOf, the kit search exact with
// the goal (bestKit = bruteKit), no goal = today's plans, a debuffer below the target takes the EFF gloves, an unreachable
// target gives up no set for one EFF, two debuffers — the EFF goes to whoever lacks it, EFF above the target is worth nothing,
// the plan line carries the EFF before and after.
import { describe, expect, it } from 'vitest';
import type { Piece } from '@/features/gear/model/gear';
import { profileOf } from '@/game/build/profile';
import { candidates } from '@/features/trade/model/cands';
import { bestKit, keyOf } from '@/features/trade/model/kit';
import { cmpKit, SLOT_ORDER, type Cand } from '@/features/trade/model/model';
import { teamPlan } from '@/features/trade/model/team';
import { linesOf } from '@/features/trade/model/view';
import { heroPlan } from '@/features/trade/model/plan';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { worldOf } from '@/features/trade/model/world';
import type { EffGoal } from '@/features/trade/model/goal';
import { effOf, effShown, inBattle } from '@/game/stat/eff';
import { heroStar } from '@/game/hero/star';
import type { SlotId } from '@/game/data/types';
import type { Subs } from '@/game/item/subs';
import { bruteKit, ctx, piece, store } from './helpers';
import * as S from '../gear/statSets';

const BETH = S.char('Beth').id, AER = S.char('Aer').id, VLADA = S.char('Demiurge Vlada').id, AKARI = S.char('Akari').id;
const ids = (s: Partial<Record<SlotId, Cand>>) => SLOT_ORDER.flatMap((x) => (s[x] ? [s[x]!.item.id] : []));
const kitIds = (s: Partial<Record<SlotId, Cand>>) => SLOT_ORDER.map((x) => s[x]?.item.id ?? '-').join(' ');
const gl = (lit: Subs, set = 'Speed', extra: Partial<Piece> = {}) => piece('gloves', set, lit, extra);

describe('the gauge', () => {
  it('eff = the game\'s battle EFF of the kit (effOf at the spot\'s ★, the typed ratio, the battle bonus); lin within 3 of it', () => {
    const g = S.gen(3301);
    const debuffers = S.heroes.filter((c) => c.eff?.d);
    let n = 0;
    for (let t = 0; t < 60; t++) {
      const c = g.pick(debuffers);
      const P = profileOf(ctx, c)!;
      const pool = S.randPool(g, P, 2, true).map((p) => (g.rnd() < 0.4 && Object.keys(p.lit).length < 4 && p.slot !== 'weapon' ? { ...p, lit: { ...p.lit, EFF: 1 + g.int(6) } } : p));
      const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p);
      const star = Math.max(heroStar(c, undefined), 1 + g.int(6)), bonus = g.pick([0, 50, 70, 120]);
      const cal = g.rnd() < 0.5 ? { typed: 150 + g.int(200), at: 120 + g.int(150) } : null;
      const st = store({ [c.id]: { pool, worn } }, cal ? { eff: { [c.id]: cal } } : {});
      const w = worldOf(ctx, st, [c.id], { goals: { [c.id]: { t: 250, star, bonus } } });
      const goal = w.gauge(c.id)?.goal;
      if (!goal) continue;
      const e = effOf({ ...ctx, stars: { [c.id]: star } }, c, worn)!;
      const want = inBattle(e, effShown(e, cal).v, bonus);
      expect(goal.eff(worn.map((p) => p.id)), `case ${t}`).toBe(want);
      expect(Math.abs(goal.lin(worn.map((p) => p.id)) - want), `case ${t}`).toBeLessThanOrEqual(3); // the floors and the rounding of the typed ratio
      n++;
    }
    expect(n).toBe(60);
  });

  it('only a hero who needs EFF gets a goal; no goals — the gauge has none', () => {
    const st = store({ [AER]: { pool: [gl({ SPD: 3 })] }, [BETH]: { pool: [gl({ SPD: 3 })] } });
    const goals: Record<string, EffGoal> = { [AER]: { t: 300, star: 3, bonus: 0 }, [BETH]: { t: 300, star: 3, bonus: 0 } };
    const w = worldOf(ctx, st, [AER, BETH], { goals });
    expect(w.gauge(AER)!.goal).toBeUndefined();
    expect(w.gauge(BETH)!.goal).toBeDefined();
    expect(worldOf(ctx, st, [BETH]).gauge(BETH)!.goal).toBeUndefined();
  });

  it('below the target a missing segment costs λ = 1 point; above it EFF% segments carry no points', () => {
    const lo = gl({ SPD: 4, EFF: 2 }), mid = gl({ SPD: 4, EFF: 6 });
    const st = store({ [AKARI]: { pool: [lo, mid] } });
    const probe = worldOf(ctx, st, [AKARI], { goals: { [AKARI]: { t: 1, star: 3, bonus: 0 } } }).gauge(AKARI)!.goal!;
    const at = (t: number) => worldOf(ctx, st, [AKARI], { goals: { [AKARI]: { t, star: 3, bonus: 0 } } }).gauge(AKARI)!.goal!;
    const v2 = probe.lin([lo.id]), seg = probe.seg;
    // 3 segments short of the low gloves → 3 points
    expect(at(v2 + 3 * seg).loss([lo.id])).toBe(3000);
    // the target right at the 4th of 6 segments: the top 2 segments (EFF at its place on Akari — second, 0.8) lose their points
    const g6 = at(probe.lin([mid.id]) - 2 * seg);
    expect(g6.loss([mid.id])).toBe(1600);
  });
});

describe('the kit search stays exact with the goal', () => {
  it('bestKit = bruteKit on real gauges with goals (debuffers, crit, holders, set rows)', () => {
    const g = S.gen(3302);
    const debuffers = S.heroes.filter((c) => c.eff?.d);
    const EF = S.setId('Effectiveness');
    let cases = 0, binding = 0;
    for (let t = 0; t < 150; t++) {
      const hs = [g.pick(debuffers), g.pick(S.heroes), g.pick(debuffers)].filter((c, i, a) => a.indexOf(c) === i);
      const spec: Record<string, { pool: Piece[]; worn?: Piece[] }> = {};
      for (const c of hs) {
        const P = profileOf(ctx, c)!;
        const pool = S.randPool(g, P, 2, true).map((p) => {
          if (p.slot !== 'weapon' && g.rnd() < 0.45 && !p.lit.EFF && Object.keys(p.lit).length < 4) { const lit = { ...p.lit, EFF: 1 + g.int(6) }; return { ...p, lit, yellow: lit }; }
          return p;
        }).map((p) => (p.slot !== 'weapon' && p.slot !== 'accessory' && g.rnd() < 0.25 ? { ...p, setId: EF } : p));
        spec[c.id] = { pool, worn: SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && g.rnd() < 0.7) };
      }
      const goals = Object.fromEntries(hs.map((c) => [c.id, { t: 120 + g.int(300), star: heroStar(c, undefined), bonus: g.pick([0, 50, 70]) }]));
      const w = worldOf(ctx, store(spec), hs.map((c) => c.id), { goals });
      const gg = w.gauge(hs[0].id);
      if (!gg?.goal) continue;
      const cands = candidates(w, { to: hs[0].id });
      if (SLOT_ORDER.reduce((n, s) => n * ((cands[s]?.length ?? 0) + 1), 1) > 200000) continue;
      cases++;
      const a = bestKit(gg, cands), b = bruteKit(gg, cands);
      if ((a.key.goal ?? 0) > 0) binding++;
      expect([cmpKit(a.key, b.key) === 0, kitIds(a.slots)], `world ${t}`).toEqual([true, kitIds(b.slots)]);
    }
    expect(cases).toBeGreaterThan(100);
    expect(binding).toBeGreaterThan(60);
  });
});

describe('plans', () => {
  // Beth (striker, needs EFF, no EFF in her chain) and Aer (striker, no EFF): Aer wears gloves with 6 EFF% that cost 1.65
  // points against Beth's own (CHC 3 instead of 4, no CHD 2)
  const mine = gl({ SPD: 4, ATK: 4, CHC: 4, CHD: 2 }), effy = gl({ SPD: 4, ATK: 4, CHC: 3, EFF: 6 });
  const rest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 4, ATK: 4, CHC: 2 }));
  const aerRest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 4, ATK: 4, CHC: 2 }));
  const st = store({ [BETH]: { pool: [mine, ...rest], worn: [mine, ...rest] }, [AER]: { pool: [effy, ...aerRest], worn: [effy, ...aerRest] } });
  const gloveOf = (tp: ReturnType<typeof teamPlan>, hero: string) => tp!.members.find((m) => m.to === hero)!.after.slots.gloves?.item.id;

  const planOf = (w: ReturnType<typeof worldOf>) => {
    const hp = heroPlan(w, { to: BETH });
    const step = { plans: [{ to: BETH, plan: hp.plan }] };
    return { kit: hp.plan.kit, line: linesOf(w, advance(w, step), [BETH], heroMoves(w, BETH, step)).find((x) => x.hero === BETH)! };
  };

  it('no goals — the plan of today: Beth keeps her gloves; a goal for a hero who needs no EFF changes nothing', () => {
    const p0 = planOf(worldOf(ctx, st, [BETH, AER]));
    expect(p0.kit.slots.gloves?.item.id).toBe(mine.id);
    expect(p0.line.eff).toBeUndefined();
    const p1 = planOf(worldOf(ctx, st, [BETH, AER], { goals: { [AER]: { t: 300, star: 3, bonus: 0 } } }));
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p0));
  });

  it('Beth below the target takes Aer\'s EFF gloves; the plan line shows the EFF, the gain stays plain stats', () => {
    const probe = worldOf(ctx, st, [BETH, AER], { goals: { [BETH]: { t: 1, star: 1, bonus: 0 } } }).gauge(BETH)!.goal!;
    const t = Math.ceil(probe.lin([effy.id, ...rest.map((p) => p.id)]));
    const w = worldOf(ctx, st, [BETH, AER], { goals: { [BETH]: { t, star: 1, bonus: 0 } } });
    const { kit, line: l } = planOf(w);
    expect(kit.slots.gloves?.item.id).toBe(effy.id);
    const g = w.gauge(BETH)!.goal!;
    expect(l.eff).toEqual({ a: g.eff([mine.id, ...rest.map((p) => p.id)]), b: g.eff([effy.id, ...rest.map((p) => p.id)]), res: t - 1, approx: true });
    expect(l.eff!.b).toBeGreaterThan(l.eff!.a);
    // the printed gain: plain stats (no goal) — Beth is weaker
    expect(l.after - l.before).toBeLessThan(0);
  });

  it('an unreachable target gives up no Speed ×4 for one EFF segment', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 4, ATK: 4, CHC: 3 }));
    const off = piece('helmet', 'Attack', { SPD: 4, ATK: 4, CHC: 3, EFF: 1 });
    const s2 = store({ [BETH]: { pool: [...four, off], worn: four } });
    const w = worldOf(ctx, s2, [BETH], { goals: { [BETH]: { t: 999, star: 1, bonus: 0 } } });
    const kit = bestKit(w.gauge(BETH)!, candidates(w, { to: BETH }));
    expect(kit.slots.helmet?.item.id).toBe(four[0].id);
    expect(kit.key.goal).toBeGreaterThan(0);
  });

  it('two debuffers: the EFF gloves go to the one far below, not to the one who needs 1 segment', () => {
    // Beth far below; Vlada one segment short with her own gloves; one pair of gloves with 6 EFF% in the team
    const bOwn = gl({ SPD: 4, ATK: 4, CHC: 4, CHD: 2 }), vOwn = gl({ SPD: 4, ATK: 4, CHC: 4, CHD: 2 }), eff6 = gl({ SPD: 4, ATK: 4, CHC: 3, EFF: 6 });
    const spare = gl({ SPD: 4, ATK: 4, CHC: 4, CHD: 1 });
    const bRest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 4, ATK: 4, CHC: 2 }));
    const vRest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 4, ATK: 4, CHC: 2, EFF: 1 }));
    const s3 = store({ [BETH]: { pool: [bOwn, ...bRest], worn: [bOwn, ...bRest] }, [VLADA]: { pool: [vOwn, ...vRest], worn: [vOwn, ...vRest] }, [AER]: { pool: [eff6, spare], worn: [eff6] } });
    const probe = worldOf(ctx, s3, [BETH, VLADA, AER], { goals: { [VLADA]: { t: 1, star: 1, bonus: 0 } } }).gauge(VLADA)!.goal!;
    const tv = Math.ceil(probe.lin([vOwn.id, ...vRest.map((p) => p.id)]) + probe.seg * 0.5);
    const w = worldOf(ctx, s3, [BETH, VLADA, AER], { goals: { [BETH]: { t: 400, star: 1, bonus: 0 }, [VLADA]: { t: tv, star: 1, bonus: 0 } } });
    const tp = teamPlan(w, { team: [BETH, VLADA] })!;
    expect(gloveOf(tp, BETH)).toBe(eff6.id);
    expect(gloveOf(tp, VLADA)).toBe(vOwn.id);
  });

  it('EFF above the target is worth nothing: Akari far above takes the gloves with other stats over her EFF ones', () => {
    // Akari: SPD › EFF. Her own gloves SPD 4 EFF 6, the other SPD 4 CHC 6 (CHC is not in her chain — worth 0) … use SPD 6
    const effG = gl({ SPD: 4, EFF: 6 }), spdG = gl({ SPD: 6, EFF: 1 });
    const s4 = store({ [AKARI]: { pool: [effG, spdG], worn: [effG] } });
    const plain = worldOf(ctx, s4, [AKARI]);
    // without a goal 4 SPD + 6 EFF (place 2, 0.8) = 8.8 beats 6 SPD + 1 EFF = 6.8
    expect(bestKit(plain.gauge(AKARI)!, candidates(plain, { to: AKARI })).slots.gloves?.item.id).toBe(effG.id);
    const w = worldOf(ctx, s4, [AKARI], { goals: { [AKARI]: { t: 1, star: 3, bonus: 0 } } });
    const kit = bestKit(w.gauge(AKARI)!, candidates(w, { to: AKARI }));
    expect(kit.slots.gloves?.item.id).toBe(spdG.id);
    expect(keyOf(w.gauge(AKARI)!, kit.slots).goal).toBe(800);
    expect(ids(kit.slots)).toEqual([spdG.id]);
  });
});
