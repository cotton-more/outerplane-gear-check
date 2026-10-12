// Dressing in turn (MODEL.md §7 item 8): the picker's gain of each hero is the number on his plan's hero line; the order —
// by name, the re-dressed last in the order they were done (owner, Q1a). Labels and the sheet — test/trade/trade.dom.test.ts.
import { describe, expect, it } from 'vitest';
import type { Piece } from '@/features/gear/model/gear';
import type { Subs } from '@/game/item/subs';
import { runAll, runChunks } from '@/features/trade/model/chunks';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { ARMOR_SLOTS, SLOT_ORDER, type World } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { heroGain, turnGains, turnOrder } from '@/features/trade/model/turn';
import { lineGain, linesOf } from '@/features/trade/model/view';
import { worldOf } from '@/features/trade/model/world';
import { HERO, hasOwner, lcg, loadOwner, piece, realWorld, store } from './helpers';

// what the plan's hero line says (TradeSheet: heroPlan → advance → linesOf, the receiver's line)
function planLineGain(w: World, to: string): number | null {
  const hp = heroPlan(w, { to });
  if (!hp.plan.changes.length) return null;
  const step = { plans: [{ to, plan: hp.plan }], fills: hp.holes.fills };
  const line = linesOf(w, advance(w, step), [to], heroMoves(w, to, step)).find((l) => l.hero === to)!;
  return lineGain(line);
}

// six fixture heroes with seeded pools, half of each worn
function seeded(seed: number): World {
  const rnd = lcg(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const sets = ['Speed', 'Penetration', 'Attack', 'Critical Strike', 'Immunity', 'Defense'];
  const stats = ['SPD', 'CHC', 'CHD', 'ATK%', 'ATK', 'HP%', 'DEF%', 'EFF', 'RES'];
  const heroes = [HERO.rin, HERO.karen, HERO.noa, HERO.delta, HERO.maya, HERO.leah];
  const st = store(Object.fromEntries(heroes.map((h) => {
    const pool: Piece[] = Array.from({ length: 6 + Math.floor(rnd() * 8) }, () => {
      const slot = pick(SLOT_ORDER), lit: Subs = {};
      const k = 1 + Math.floor(rnd() * 4);
      while (Object.keys(lit).length < k) lit[pick(stats)] = 1 + Math.floor(rnd() * 6);
      return piece(slot, ARMOR_SLOTS.includes(slot) ? pick(sets) : null, lit, { bt: rnd() < 0.5 ? 4 : 0 });
    });
    const worn = SLOT_ORDER.map((s) => pool.find((p) => p.slot === s)).filter((p): p is Piece => !!p && rnd() < 0.6);
    return [h, { pool, worn }];
  })));
  return realWorld(st);
}

describe('the picker gain = the plan line gain', () => {
  it('every hero of 12 seeded worlds', () => {
    let shown = 0;
    for (let i = 0; i < 12; i++) {
      const w = seeded(2026_10_12 + i);
      for (const h of w.heroes) {
        const g = heroGain(w, h.id);
        expect(g, `world ${i}, ${h.id}`).toBe(planLineGain(w, h.id));
        if (g !== null) shown++;
      }
    }
    expect(shown).toBeGreaterThan(10);
  });

  it('a re-dressed hero is locked: the others no longer count on his worn gear', () => {
    const k = piece('helmet', 'Speed', { ATK: 6, CHC: 6, CHD: 6, SPD: 6 });
    const r = piece('helmet', 'Defense', { RES: 1 });
    const st = store({ [HERO.karen]: { pool: [k], worn: [k] }, [HERO.rin]: { pool: [r], worn: [r] } });
    const open = realWorld(st, [HERO.karen, HERO.rin]);
    const shut = realWorld(st, [HERO.karen, HERO.rin], [HERO.karen]);
    expect(heroGain(open, HERO.rin)).toBe(planLineGain(open, HERO.rin));
    expect(heroGain(open, HERO.rin)).toBeGreaterThan(0);
    expect(heroGain(shut, HERO.rin)).toBeNull();
  });

  it.skipIf(!hasOwner())('the owner snapshot: every hero with builds', () => {
    const o = loadOwner();
    const w = worldOf(o.ctx, o.st, o.roster);
    const ids = o.roster.filter((id) => o.ctx.idx.CHAR[id]?.builds.length);
    const gains = runAll(turnGains(w, ids));
    for (const id of ids) expect(gains.get(id), id).toBe(planLineGain(w, id));
  });
});

describe('the picker order', () => {
  const name = (id: string) => ({ a: 'Rin', b: 'Aer', c: 'Caren', d: 'Beth' })[id] ?? id;
  it('by name, the re-dressed last in done order', () => {
    expect(turnOrder(['a', 'b', 'c', 'd'], [], name)).toEqual(['b', 'd', 'c', 'a']);
    expect(turnOrder(['a', 'b', 'c', 'd'], ['c', 'b'], name)).toEqual(['d', 'a', 'c', 'b']);
  });
  it('«Вернуть»: an unlocked hero goes back to his place by name', () => {
    expect(turnOrder(['a', 'b', 'c', 'd'], ['b'], name)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('a done hero outside the list stays out', () => {
    expect(turnOrder(['a'], ['z'], name)).toEqual(['a']);
  });
});

describe('chunks', () => {
  it('the same gains as at once; abort — null', async () => {
    const w = seeded(77);
    const ids = w.heroes.map((h) => h.id);
    expect(await runChunks(turnGains(w, ids))).toEqual(runAll(turnGains(w, ids)));
    const ac = new AbortController();
    const p = runChunks(turnGains(w, ids), ac.signal);
    ac.abort();
    expect(await p).toBeNull();
  });
});
