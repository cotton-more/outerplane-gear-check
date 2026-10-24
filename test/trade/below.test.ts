// «Обмен вещами»: armor of the order's set below the receiver's bar (MODEL.md §7 item 2; HISTORY.md 0250, owner 2026-10-24,
// option B): a candidate only as a piece its set needs. The owner's case — Regina pinned to Penetration ×4, Bryn wears the
// only Penetration set, every piece below her bar
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { candidates } from '@/features/trade/model/cands';
import { heroPlan } from '@/features/trade/model/plan';
import { teamPlan } from '@/features/trade/model/team';
import type { World } from '@/features/trade/model/model';
import { synthWorld, type SynthHero } from './helpers';

const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const below = (v: number) => ({ v, fit: 'no' as const, ok: false });

// R wears own Attack armor (o-slot, `own` points each); B wears Penetration (p-slot, `pen` points each for R, below R's bar)
// in `penSlots`; R orders Penetration ×4 worth `bonus`
function world(o: { own: number; pen: number; bonus: number; penSlots?: SlotId[]; parts?: SynthHero['parts']; extra?: Record<string, SynthHero> }): World {
  const penSlots = o.penSlots ?? ARMOR;
  const items: Parameters<typeof synthWorld>[0]['items'] = {};
  for (const s of ARMOR) items['o-' + s] = { slot: s, set: 'Attack' };
  for (const s of penSlots) items['p-' + s] = { slot: s, set: 'Pen' };
  return synthWorld({
    items,
    heroes: {
      R: {
        worn: Object.fromEntries(ARMOR.map((s) => [s, 'o-' + s])),
        parts: o.parts ?? [{ set: 'Pen', n: 4 }],
        bonus: { Pen: { 4: o.bonus } },
        value: { ...Object.fromEntries(ARMOR.map((s) => ['o-' + s, o.own])), ...Object.fromEntries(penSlots.map((s) => ['p-' + s, below(o.pen)])) },
      },
      B: { worn: Object.fromEntries(penSlots.map((s) => [s, 'p-' + s])), value: Object.fromEntries(penSlots.map((s) => ['p-' + s, 5])) },
      ...o.extra,
    },
  });
}
const got = (w: World) => heroPlan(w, { to: 'R' }).plan.changes.map((c) => c.cand.item.id).sort();

describe('below the bar — only for the order\'s set', () => {
  it('Regina: four weak Penetration pieces + the ×4 bonus beat her Attack → all four from Bryn', () => {
    const w = world({ own: 3, pen: 1, bonus: 20 }); // 4 + 20 > 12
    expect(got(w)).toEqual(['p-armor', 'p-gloves', 'p-helmet', 'p-shoes']);
    expect(heroPlan(w, { to: 'R' }).missing).toEqual([]);
  });

  it('the set can\'t come together (three slots) — no weak piece comes, R keeps her own', () => {
    expect(got(world({ own: 3, pen: 1, bonus: 20, penSlots: ['helmet', 'armor', 'gloves'] }))).toEqual([]);
  });

  it('a strong stat kit beats the set — stats win', () => {
    expect(got(world({ own: 7, pen: 1, bonus: 20 }))).toEqual([]); // 28 > 24
  });

  it('a ×2 part: two weak pieces come for the half, a third one doesn\'t, though it has more points than R\'s own', () => {
    const w = synthWorld({
      items: {
        'o-helmet': { slot: 'helmet', set: 'Attack' }, 'o-armor': { slot: 'armor', set: 'Attack' }, 'o-gloves': { slot: 'gloves', set: 'Attack' },
        'p-helmet': { slot: 'helmet', set: 'Pen' }, 'p-armor': { slot: 'armor', set: 'Pen' }, 'p-gloves': { slot: 'gloves', set: 'Pen' },
      },
      heroes: {
        R: {
          worn: { helmet: 'o-helmet', armor: 'o-armor', gloves: 'o-gloves' },
          parts: [{ set: 'Pen', n: 2 }], bonus: { Pen: { 2: 10 } },
          value: { 'o-helmet': 2, 'o-armor': 2, 'o-gloves': 2, 'p-helmet': below(3), 'p-armor': below(3), 'p-gloves': below(3) },
        },
        B: { worn: { helmet: 'p-helmet', armor: 'p-armor', gloves: 'p-gloves' }, value: { 'p-helmet': 5, 'p-armor': 5, 'p-gloves': 5 } },
      },
    });
    const ids = got(w);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => id.startsWith('p-'))).toBe(true);
  });

  it('a weak piece of the set doesn\'t push out a fit one of the same set that may stand alone', () => {
    // helmet: B's weak Penetration (5) and C's fit one (4); the set can't come together — C's helmet replaces R's own (3)
    const w = world({
      own: 3, pen: 5, bonus: 20, penSlots: ['helmet', 'armor'],
      extra: { C: { worn: { helmet: 'q-helmet' }, value: { 'q-helmet': 5 } } },
    });
    const w2: World = { ...w, items: { ...w.items, 'q-helmet': { id: 'q-helmet', slot: 'helmet', code: 'q-helmet', bt: 0, set: 'Pen', t4: false, ord: 99, chc: 0 } } };
    const g = w2.gauge('R')!;
    const gauge = (id: string) => (id === 'R' ? { ...g, value: (x: string) => (x === 'q-helmet' ? { v: 4000, fit: 'no' as const, ok: true } : g.value(x)) } : w2.gauge(id));
    expect(got({ ...w2, gauge })).toEqual(['q-helmet']);
  });

  it('"By stats" (no parts): pieces below the bar are no candidates', () => {
    const c = candidates(world({ own: 3, pen: 1, bonus: 20, parts: [] }), { to: 'R' });
    expect(ARMOR.flatMap((s) => (c[s] ?? []).map((x) => x.item.id)).filter((id) => id.startsWith('p-'))).toEqual([]);
  });

  it('the team trade takes the set too; with its holder in the team, the sum decides', () => {
    const base = world({ own: 3, pen: 1, bonus: 20, extra: { E1: { value: {} }, E2: { value: {} } } });
    const after = (team: string[]) => ARMOR.map((s) => teamPlan(base, { team })!.members.find((m) => m.to === 'R')!.after.slots[s]?.item.id);
    expect(after(['R', 'E1', 'E2'])).toEqual(ARMOR.map((s) => 'p-' + s));
    // B loses 4 × 5, R gains 24 − 12: the team's sum is lower — R keeps her own (MODEL.md §7 item 6)
    expect(after(['R', 'B', 'E1', 'E2'])).toEqual(ARMOR.map((s) => 'o-' + s));
  });
});
