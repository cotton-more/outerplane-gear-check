// The SPD goal in the boss team trade (MODEL.md §13; .x/0200-boss E4): the gauge's SPD against spdOf and its shortfall split
// exactly, the kit search exact with both goals (bestKit = bruteKit), no SPD goal = today's plans, a member below the target
// takes SPD from one who doesn't need it, the Speed Set kept for a reachable target, both goals on one member, an unreachable
// target degrades smoothly; the allies' transcend bonus, the most SPD a kit could give (over all pieces, and over the trade's
// own candidates), the turn-1 reasons by the boss's immunities.
import { describe, expect, it } from 'vitest';
import type { Piece } from '@/features/gear/model/gear';
import { profileOf } from '@/game/build/profile';
import { candidates } from '@/features/trade/model/cands';
import { tradeSpdReach } from '@/features/trade/model/reach';
import { bestKit } from '@/features/trade/model/kit';
import { cmpKit, SLOT_ORDER, type Cand } from '@/features/trade/model/model';
import { teamPlan } from '@/features/trade/model/team';
import { linesOf } from '@/features/trade/model/view';
import { heroPlan } from '@/features/trade/model/plan';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { worldOf } from '@/features/trade/model/world';
import { SPD_MILLI, type SpdGoal } from '@/features/trade/model/goal';
import { spdBonus, spdOf, spdReach } from '@/game/stat/spd';
import { anyChance, firstAt, turnOf } from '@/game/stat/turn';
import { reasonsAt } from '@/features/boss/model/turn';
import { heroStar } from '@/game/hero/star';
import type { SlotId } from '@/game/data/types';
import { bruteKit, ctx, piece, store } from './helpers';
import * as S from '../gear/statSets';

const BETH = S.char('Beth').id, AER = S.char('Aer').id, STELLA = S.char('Demiurge Stella').id;
const kitIds = (s: Partial<Record<SlotId, Cand>>) => SLOT_ORDER.map((x) => s[x]?.item.id ?? '-').join(' ');
const ids = (ps: readonly Piece[]) => ps.map((p) => p.id);
const spdOfIds = (hero: string, ps: readonly Piece[]) => spdOf(ctx, S.char(S.heroes.find((c) => c.id === hero)!.name), ps)!.total;
const goal = (t: number, bonus = 0, boss = 200): SpdGoal => ({ t, boss, bonus });

describe('the gauge', () => {
  it('spd = spdOf + the bonus; a − Σ b − Σ r = 333 × (t − SPD) exactly for any kit; the term is the shortfall alone', () => {
    const g = S.gen(4401);
    let n = 0;
    for (let t = 0; t < 80; t++) {
      const c = g.pick(S.heroes);
      const P = profileOf(ctx, c)!;
      const sp = S.setId('Speed');
      const pool = S.randPool(g, P, 2, true).map((p) => (p.slot !== 'weapon' && p.slot !== 'accessory' && g.rnd() < 0.5 ? { ...p, setId: sp, bt: g.rnd() < 0.5 ? 4 as const : 0 as const } : p));
      const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && g.rnd() < 0.8);
      const bonus = g.pick([0, 5, 15]), target = 150 + g.int(150);
      const w = worldOf(ctx, store({ [c.id]: { pool, worn } }), [c.id], { spd: { [c.id]: goal(target, bonus) } });
      const sg = w.gauge(c.id)?.spd;
      if (!sg) continue;
      const v = spdOf(ctx, c, worn)!.total + bonus;
      expect(sg.spd(ids(worn)), `case ${t}`).toBe(v);
      const cnt = new Map<string, [number, number]>();
      for (const p of worn) if (p.setId) { const [k, k4] = cnt.get(p.setId) ?? [0, 0]; cnt.set(p.setId, [k + 1, k4 + (p.bt === 4 ? 1 : 0)]); }
      const short = sg.a - worn.reduce((s, p) => s + sg.b(p.id), 0) - [...cnt].reduce((s, [set, [k, k4]]) => s + sg.r(set, k, k4), 0);
      expect(short, `case ${t}`).toBe(SPD_MILLI * (target - v));
      expect(sg.loss(ids(worn)), `case ${t}`).toBe(Math.max(0, SPD_MILLI * (target - v)));
      n++;
    }
    expect(n).toBe(80);
  });

  it('no SPD goals — the gauge has none', () => {
    const st = store({ [AER]: { pool: [piece('gloves', 'Speed', { SPD: 3 })] } });
    expect(worldOf(ctx, st, [AER]).gauge(AER)!.spd).toBeUndefined();
    expect(worldOf(ctx, st, [AER], { spd: {} }).gauge(AER)!.spd).toBeUndefined();
    expect(worldOf(ctx, st, [AER], { spd: { [AER]: goal(200) } }).gauge(AER)!.spd).toBeDefined();
  });
});

describe('the kit search stays exact with both goals', () => {
  it('bestKit = bruteKit on real gauges with SPD goals, EFF goals on debuffers, crit, holders, Speed rows', () => {
    const g = S.gen(4402);
    const sp = S.setId('Speed');
    let cases = 0, binding = 0, both = 0;
    for (let t = 0; t < 160; t++) {
      const hs = [g.pick(S.heroes), g.pick(S.heroes), g.pick(S.heroes)].filter((c, i, a) => a.indexOf(c) === i);
      const spec: Record<string, { pool: Piece[]; worn?: Piece[] }> = {};
      for (const c of hs) {
        const P = profileOf(ctx, c)!;
        const pool = S.randPool(g, P, 2, true).map((p) => {
          if (p.slot !== 'weapon' && g.rnd() < 0.35 && !p.lit.EFF && Object.keys(p.lit).length < 4) { const lit = { ...p.lit, EFF: 1 + g.int(6) }; return { ...p, lit, yellow: lit }; }
          return p;
        }).map((p) => (p.slot !== 'weapon' && p.slot !== 'accessory' && g.rnd() < 0.35 ? { ...p, setId: sp, bt: g.rnd() < 0.4 ? 4 as const : 0 as const } : p));
        spec[c.id] = { pool, worn: SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && g.rnd() < 0.7) };
      }
      const base = (c: (typeof hs)[number]) => spdOf(ctx, c, [])?.total ?? 150;
      const spd = Object.fromEntries(hs.map((c) => [c.id, goal(base(c) + 20 + g.int(90), g.pick([0, 5, 10]))]));
      const goals = Object.fromEntries(hs.filter((c) => c.eff?.d).map((c) => [c.id, { t: 120 + g.int(300), star: heroStar(c, undefined), bonus: g.pick([0, 50]) }]));
      const w = worldOf(ctx, store(spec), hs.map((c) => c.id), { spd, goals });
      const gg = w.gauge(hs[0].id);
      if (!gg?.spd) continue;
      const cands = candidates(w, { to: hs[0].id });
      if (SLOT_ORDER.reduce((n, s) => n * ((cands[s]?.length ?? 0) + 1), 1) > 200000) continue;
      cases++;
      if (gg.goal) both++;
      const a = bestKit(gg, cands), b = bruteKit(gg, cands);
      if ((a.key.goal ?? 0) > 0) binding++;
      expect([cmpKit(a.key, b.key) === 0, kitIds(a.slots)], `world ${t}`).toEqual([true, kitIds(b.slots)]);
    }
    expect(cases).toBeGreaterThan(100);
    expect(binding).toBeGreaterThan(40);
    expect(both).toBeGreaterThan(20);
  });
});

describe('plans', () => {
  // Demiurge Stella (striker, no SPD in her chain) and Aer (striker): her own gloves have no SPD, Aer wears gloves with 6 SPD
  const mine = piece('gloves', 'Speed', { ATK: 4, CHC: 4, CHD: 4 }), fast = piece('gloves', 'Speed', { SPD: 6, ATK: 4, CHC: 4, CHD: 2 }); // passes her bar (E3 Q4: the goal pulls no piece that fails it)
  const rest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 2, ATK: 4, CHC: 3 }));
  const aerRest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 2, ATK: 4, CHC: 3 }));
  const st = store({ [STELLA]: { pool: [mine, ...rest], worn: [mine, ...rest] }, [AER]: { pool: [fast, ...aerRest], worn: [fast, ...aerRest] } });
  const planOf = (w: ReturnType<typeof worldOf>, hero = STELLA) => {
    const hp = heroPlan(w, { to: hero });
    const step = { plans: [{ to: hero, plan: hp.plan }] };
    return { kit: hp.plan.kit, line: linesOf(w, advance(w, step), [hero], heroMoves(w, hero, step)).find((x) => x.hero === hero)! };
  };

  it('no SPD goals — the plan of today; an SPD goal already met changes nothing', () => {
    const p0 = planOf(worldOf(ctx, st, [STELLA, AER]));
    expect(p0.kit.slots.gloves?.item.id).toBe(mine.id);
    expect(p0.line.spd).toBeUndefined();
    const p1 = planOf(worldOf(ctx, st, [STELLA, AER], { spd: {} }));
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p0));
    const p2 = planOf(worldOf(ctx, st, [STELLA, AER], { spd: { [STELLA]: goal(1) } }));
    expect(kitIds(p2.kit.slots)).toBe(kitIds(p0.kit.slots));
    expect(p2.kit.key.goal).toBe(0);
  });

  it('Stella below the target takes Aer\'s SPD gloves; the line shows SPD before and after, the gain stays plain stats', () => {
    const t = spdOfIds(STELLA, [fast, ...rest]);
    const w = worldOf(ctx, st, [STELLA, AER], { spd: { [STELLA]: goal(t, 0, 180) } });
    const { kit, line: l } = planOf(w);
    expect(kit.slots.gloves?.item.id).toBe(fast.id);
    expect(l.spd).toEqual({ a: spdOfIds(STELLA, [mine, ...rest]), b: t, boss: 180 });
    expect(l.after - l.before).toBeLessThan(0); // plain stats: her own gloves are worth more
  });

  it('the team: the SPD gloves go to the member with the goal, not to the one without', () => {
    const t = spdOfIds(STELLA, [fast, ...rest]);
    const w = worldOf(ctx, st, [STELLA, AER], { spd: { [STELLA]: goal(t) } });
    const tp = teamPlan(w, { team: [STELLA, AER] })!;
    expect(tp.members.find((m) => m.to === STELLA)!.after.slots.gloves?.item.id).toBe(fast.id);
  });

  it('a reachable target keeps the Speed Set: Stella gives up a helmet with more points for the set rows', () => {
    const four = (['helmet', 'armor', 'gloves', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 1, ATK: 3, CHC: 2 }));
    const off = piece('helmet', 'Attack', { SPD: 1, ATK: 6, CHC: 4 });
    const s2 = store({ [STELLA]: { pool: [...four, off], worn: four } });
    const plain = worldOf(ctx, s2, [STELLA]);
    const p0 = bestKit(plain.gauge(STELLA)!, candidates(plain, { to: STELLA }));
    expect(p0.slots.helmet?.item.id).toBe(off.id); // without a goal the strong helmet beats the Speed ×4 rows
    const t = spdOfIds(STELLA, four);
    expect(t).toBeGreaterThan(spdOfIds(STELLA, [off, ...four.slice(1)]));
    const w = worldOf(ctx, s2, [STELLA], { spd: { [STELLA]: goal(t) } });
    const kit = bestKit(w.gauge(STELLA)!, candidates(w, { to: STELLA }));
    expect(kit.slots.helmet?.item.id).toBe(four[0].id);
    expect(kit.key.goal).toBe(0);
  });

  it('an unreachable target degrades smoothly: the term is linear, the kit takes the SPD it can and the loss stays', () => {
    const s3 = store({ [STELLA]: { pool: [mine, fast, ...rest], worn: [mine, ...rest] } });
    const w = worldOf(ctx, s3, [STELLA], { spd: { [STELLA]: goal(999) } });
    const g = w.gauge(STELLA)!;
    const kit = bestKit(g, candidates(w, { to: STELLA }));
    expect(kit.slots.gloves?.item.id).toBe(fast.id);
    expect(kit.key.goal).toBe(SPD_MILLI * (999 - spdOfIds(STELLA, [fast, ...rest])));
  });

  it('both goals on one member: the sum of the two terms; the line carries EFF and SPD', () => {
    // Beth needs EFF (rule R), SPD first in her chain: plain she takes the 6-SPD gloves; with both goals the gloves with EFF 6 and
    // SPD 3 meet both targets — the 6 EFF segments she'd miss cost more than the 3 SPD segments and the CHC she gives up
    const effG = piece('gloves', 'Speed', { EFF: 6, ATK: 4 }), both = piece('gloves', 'Speed', { EFF: 6, SPD: 3, ATK: 4, CHC: 3 });
    const s4 = store({ [BETH]: { pool: [mine, fast, effG, both, ...rest], worn: [mine, ...rest] } });
    const plain = worldOf(ctx, s4, [BETH]);
    expect(bestKit(plain.gauge(BETH)!, candidates(plain, { to: BETH })).slots.gloves?.item.id).toBe(fast.id);
    const tS = spdOfIds(BETH, [both, ...rest]);
    const probe = worldOf(ctx, s4, [BETH], { goals: { [BETH]: { t: 1, star: 1, bonus: 0 } } }).gauge(BETH)!.goal!;
    const tE = Math.ceil(probe.lin(ids([both, ...rest])));
    const w = worldOf(ctx, s4, [BETH], { goals: { [BETH]: { t: tE, star: 1, bonus: 0 } }, spd: { [BETH]: goal(tS) } });
    const g = w.gauge(BETH)!;
    const kit = bestKit(g, candidates(w, { to: BETH }));
    expect(kit.slots.gloves?.item.id).toBe(both.id);
    expect(kit.key.goal).toBe(g.goal!.loss(ids([both, ...rest])) + g.spd!.loss(ids([both, ...rest])));
    expect(kitIds(kit.slots)).toBe(kitIds(bruteKit(g, candidates(w, { to: BETH })).slots));
    const { line } = planOf(w, BETH);
    expect(line.eff).toBeDefined();
    expect(line.spd).toBeDefined();
  });
});

describe('around the goal', () => {
  const mate = (name: string, star: number) => ({ c: S.char(name), star });

  it('spdBonus: every member\'s team row at its ★ adds up (Dianne ★5 + Mene ★6 = 15), a self row only for its hero', () => {
    const dianne = S.char('Dianne'), mene = S.char('Mene'), claire = S.char('Claire');
    expect(dianne.spdUp).toEqual({ t: [0, 0, 0, 5, 5, 10], tm: 1 });
    const team = [mate('Akari', 4), mate('Dianne', 5), mate('Mene', 6), mate('Claire', 6)];
    expect(spdBonus(S.char('Akari'), 4, team)).toBe(15);
    expect(spdBonus(dianne, 5, team)).toBe(15); // her own row counts once
    expect(spdBonus(claire, 6, team)).toBe(25); // + her self row 10
    expect(spdBonus(S.char('Akari'), 4, [mate('Akari', 4), mate('Claire', 6)])).toBe(0);
    expect(spdBonus(mene, 3, [mate('Mene', 3)])).toBe(0); // ★3 — not unlocked
  });

  it('spdReach = the most SPD of every kit (brute force over small pools), Speed rows included', () => {
    const g = S.gen(4403);
    const sp = S.setId('Speed');
    for (let t = 0; t < 25; t++) {
      const c = g.pick(S.heroes);
      const pool = S.randPool(g, profileOf(ctx, c)!, 2, true).map((p) => (p.slot !== 'weapon' && p.slot !== 'accessory' && g.rnd() < 0.5 ? { ...p, setId: sp, bt: g.rnd() < 0.5 ? 4 as const : 0 as const } : p));
      const by = SLOT_ORDER.map((s) => [null, ...pool.filter((p) => p.slot === s)]);
      let best = 0;
      const walk = (i: number, kit: Piece[]) => {
        if (i === by.length) { best = Math.max(best, spdOf(ctx, c, kit)!.total); return; }
        for (const p of by[i]) walk(i + 1, p ? [...kit, p] : kit);
      };
      walk(0, []);
      expect(spdReach(ctx, c, pool), `case ${t}`).toBe(best);
    }
  });

  // E4-1: «Команда» says «не догнать» (and drops the goal) by what the trade itself could give the member (MODEL.md §13 item 12)
  describe('tradeSpdReach: the trade\'s own candidates, not every piece', () => {
    // Stella wears her own gear; Aer wears gloves with 6 SPD that pass her bar and a helmet with 6 SPD that fails it
    const mine = piece('gloves', 'Speed', { ATK: 4, CHC: 4, CHD: 4 }), fast = piece('gloves', 'Speed', { SPD: 6, ATK: 4, CHC: 4, CHD: 2 });
    const junkHelmet = piece('helmet', 'Speed', { SPD: 6, DEF: 4 }), junkShoes = piece('shoes', 'Speed', { SPD: 6, DEF: 4 });
    const rest = (['helmet', 'armor', 'shoes'] as const).map((s) => piece(s, 'Speed', { SPD: 2, ATK: 4, CHC: 3 }));
    const stella = S.char('Demiurge Stella');
    const wornBy = (st: ReturnType<typeof store>) => Object.values(st.worn ?? {}).flatMap((w) => Object.values(w ?? {}).flatMap((id) => (id ? [st.pieces[id]] : [])));
    const reach = (st: ReturnType<typeof store>) => tradeSpdReach(ctx, stella, worldOf(ctx, st, [STELLA, AER]), st.pieces);

    it('another hero\'s worn piece that fails the receiver\'s bar is out; one that passes counts', () => {
      const st = store({ [STELLA]: { pool: [mine, ...rest], worn: [mine, ...rest] }, [AER]: { pool: [fast, junkHelmet], worn: [fast, junkHelmet] } });
      const w = worldOf(ctx, st, [STELLA, AER]);
      expect(w.gauge(STELLA)!.value(junkHelmet.id)!.ok).toBe(false);
      expect(w.gauge(STELLA)!.value(fast.id)!.ok).toBe(true);
      // the old count — every piece worn by anyone — takes the helmet the trade would never hand over
      expect(spdReach(ctx, stella, wornBy(st))).toBe(spdOfIds(STELLA, [fast, junkHelmet, rest[1], rest[2]]));
      expect(reach(st)).toBe(spdOfIds(STELLA, [fast, ...rest])); // Aer's gloves; her own helmet stays
      expect(reach(st)).toBeLessThan(spdReach(ctx, stella, wornBy(st)));
    });

    it('a parked piece: into an empty slot with no bar, into a filled one only if it passes', () => {
      const park = { park: [junkShoes.id] };
      const empty = store({ [STELLA]: { pool: [mine, ...rest.slice(0, 2)], worn: [mine, ...rest.slice(0, 2)] }, [AER]: { pool: [junkShoes] } }, park);
      expect(reach(empty)).toBe(spdOfIds(STELLA, [mine, rest[0], rest[1], junkShoes])); // shoes slot empty — better than nothing
      const filled = store({ [STELLA]: { pool: [mine, ...rest], worn: [mine, ...rest] }, [AER]: { pool: [junkShoes] } }, park);
      expect(reach(filled)).toBe(spdOfIds(STELLA, [mine, ...rest]));
    });

    it('someone\'s spare is never reached: the hero\'s pool piece not worn by anyone is held for him', () => {
      const st = store({ [STELLA]: { pool: [mine, ...rest], worn: [mine, ...rest] }, [AER]: { pool: [fast] } });
      expect(reach(st)).toBe(spdOfIds(STELLA, [mine, ...rest]));
    });
  });

  it('the target and the chance: surely first above boss × 100/95; no chance below × 0.95', () => {
    expect(firstAt(276)).toBe(291);
    expect(firstAt(211)).toBe(223);
    expect(turnOf(firstAt(211), 211, []).state).toBe('first');
    expect(anyChance(201, 211)).toBe(true);
    expect(anyChance(200, 211)).toBe(false);
    expect(anyChance(190, 200)).toBe(false); // exactly 0.95 × the boss: a tie of the extremes, no chance (E1-1)
    expect(anyChance(191, 200)).toBe(true);
  });

  it('reasonsAt: a row the boss is immune to goes; a team row stays', () => {
    const v = S.char('Veronica'), a = S.char('Akari');
    // E4-6: her S2 shield lands on the ally with the lowest HP (shield1), not on the team
    expect(v.turn).toEqual([{ s: 's1', k: 'taunt', fx: '32' }, { s: 's2', k: 'shield1' }]);
    expect(reasonsAt(v, ['32'])).toEqual([{ s: 's2', k: 'shield1' }]);
    // E4-7: Akari's ATK down rolls 40 % at skill levels 1–2 and 55 % from 3: lv 3 (missing — holds from level 1)
    expect(reasonsAt(a, ['26', '32'])).toEqual([{ s: 's1', k: 'atk', fx: '18', lv: 3 }]);
    expect(S.char('Dolly').turn).toEqual([{ s: 's1', k: 'atk', fx: '18', lv: 5 }]); // 30 / 40 / 50 % at levels 1 / 3 / 5
    expect(S.char('Omega Nadja').turn).toEqual([{ s: 's1', k: 'slow', fx: '26', lv: 5 }]);
    expect(reasonsAt(a, ['18'])).toEqual([]);
    expect(reasonsAt(S.char('Aer'), [])).toEqual([]);
  });
});
