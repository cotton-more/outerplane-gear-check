// The trade as a record (MODEL.md §7 items 4, 7, 9; .x/0200-boss E2b Q1–Q7): «Оставить как было» freezes the receiver's
// slot, the end gives every piece taken off an owner (giver → emptied member → parking), parked pieces wait for anyone,
// the walk's lines and ticks, one record and one undo.
import { describe, expect, it } from 'vitest';
import { applyWalk, stampOf } from '@/features/trade/model/apply';
import { slotKey, type World } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { teamPlan } from '@/features/trade/model/team';
import { lineDone, linesOfWalk, NO_DECISIONS, outcomeOf, walkLeft, type Decisions, type Line } from '@/features/trade/model/walk';
import { worldOf } from '@/features/trade/model/world';
import { EMPTY_GEAR, type GearStore } from '@/features/gear/model/gear';
import { ctx, HERO, piece, store, synthWorld, type SynthHero } from './helpers';

type Items = Parameters<typeof synthWorld>[0]['items'];
const mk = (items: Items, heroes: Record<string, SynthHero>, parked: string[] = []): World => {
  const w = synthWorld({ items, heroes });
  return parked.length ? { ...w, parked: new Set(parked), held: new Set([...heldIds(w)].filter((id) => !parked.includes(id))) } : w;
};
const heldIds = (w: World) => {
  const worn = new Set(w.heroes.flatMap((h) => Object.values(h.worn)));
  return new Set(w.heroes.flatMap((h) => h.pool.filter((id) => !worn.has(id))));
};
const no = { v: 0, fit: 'no' as const, ok: false }; // can wear, fails the bar

// one hero's whole outcome: his plan, then the end
const hero = (w: World, to: string, d: Decisions = NO_DECISIONS) => {
  const hp = heroPlan(w, { to, frozen: new Set(d.frozen) });
  return outcomeOf(w, [{ plans: [{ to, plan: hp.plan }] }], [to], [to], d);
};
const team = (w: World, members: string[], d: Decisions = NO_DECISIONS) => {
  const tp = teamPlan(w, { team: members, frozen: new Set(d.frozen) })!;
  return outcomeOf(w, tp.steps, tp.order, members, d);
};
const short = (l: Line): string => {
  switch (l.kind) {
    case 'lock': return `lock ${l.hero}.${l.slot} ${l.item} → ${l.to.kind === 'park' ? 'park' : l.to.hero}`;
    case 'equip': return `${l.hero}.${l.slot} ← ${l.item} (${l.from.kind}${'hero' in l.from ? ' ' + l.from.hero : ''})`;
    case 'kept': return `${l.hero}.${l.slot} kept`;
    case 'hole': return `${l.hero}.${l.slot} empty`;
    case 'repl': return `${l.hero}.${l.slot} ← ${l.item} of ${l.from}${l.kept ? ' (kept)' : ''}`;
    case 'park': return `park ${l.item} on ${l.hero} (${l.why})`;
  }
};

// Rin (R) re-dressed: Caren's helmet, Stella's armor, Valentine's accessory; R's old accessory is class-locked (V can't)
const rinWorld = () => mk({
  rh: { slot: 'helmet' }, ch: { slot: 'helmet' }, ra: { slot: 'armor' }, sa: { slot: 'armor' },
  rx: { slot: 'accessory' }, vx: { slot: 'accessory' },
}, {
  R: { worn: { helmet: 'rh', armor: 'ra', accessory: 'rx' }, value: { rh: 2, ch: 10, ra: 2, sa: 10, rx: 2, vx: 10 } },
  C: { worn: { helmet: 'ch' }, value: { ch: 5, rh: 1 } },
  S: { worn: { armor: 'sa' }, value: { sa: 5, ra: 1 } },
  V: { worn: { accessory: 'vx' }, value: { vx: 5, rx: null } },
});

describe('the end: replacements and parking', () => {
  it('the giver gets the old piece; a class-locked one parks on the hero it came off; the walk locks it first', () => {
    const o = hero(rinWorld(), 'R');
    expect(o.ends.repl.map((r) => [r.to, r.slot, r.item, r.from])).toEqual([['C', 'helmet', 'rh', 'R'], ['S', 'armor', 'ra', 'R']]);
    expect(o.ends.park).toEqual([{ item: 'rx', hero: 'R', slot: 'accessory', why: 'class', giver: 'V' }]);
    expect(linesOfWalk(o.walk).map(short)).toEqual([
      'R.weapon empty',
      'lock R.accessory rx → park', 'R.accessory ← vx (worn V)',
      'lock R.helmet rh → C', 'R.helmet ← ch (worn C)',
      'lock R.armor ra → S', 'R.armor ← sa (worn S)',
      'R.gloves empty', 'R.shoes empty',
      'C.helmet ← rh of R', 'S.armor ← ra of R', 'park rx on R (class)', 'V.accessory empty',
    ]);
    // w2: the replacements are worn, the parked piece stays in R's pool unworn
    const by = (id: string) => o.w2.heroes.find((h) => h.id === id)!;
    expect([by('C').worn.helmet, by('S').worn.armor, by('V')?.worn.accessory]).toEqual(['rh', 'ra', undefined]);
    expect(by('R').pool).toContain('rx');
    expect(by('R').pool).not.toContain('rh');
  });

  it('a replacement kept as it was: the giver\'s slot stays empty, the piece parks', () => {
    const o = hero(rinWorld(), 'R', { ...NO_DECISIONS, kept: [slotKey('C', 'helmet')] });
    expect(o.ends.repl.find((r) => r.to === 'C')!.kept).toBe(true);
    expect(o.ends.park.map((p) => [p.item, p.why, p.giver])).toEqual([['rx', 'class', 'V'], ['rh', 'kept', 'C']]);
    expect(o.ends.holes.filter((h) => !h.receiver).map((h) => h.hero)).toEqual(['C', 'V']);
    expect(o.w2.heroes.find((h) => h.id === 'C')).toBeUndefined(); // C gave her only piece and got none back
  });

  it('the giver can\'t wear it → another team member whose slot emptied in this trade', () => {
    // A takes B's accessory (B outside, can't wear A's old one); N takes M's; M's slot emptied → A's old one goes to M
    const w = mk({ aa: { slot: 'accessory' }, ba: { slot: 'accessory' }, ma: { slot: 'accessory' } }, {
      A: { worn: { accessory: 'aa' }, value: { aa: 0, ba: 10, ma: 1 } },
      M: { worn: { accessory: 'ma' }, value: { ma: 0, aa: no, ba: 1 } },
      N: { value: { ma: 10, aa: 1, ba: 1 } },
      B: { worn: { accessory: 'ba' }, value: { ba: 0, aa: null } },
    });
    const o = team(w, ['A', 'M', 'N']);
    expect(o.ends.repl.map((r) => [r.to, r.item, r.from])).toEqual([['M', 'aa', 'A']]);
    expect(o.ends.park).toEqual([]);
    expect(o.ends.holes.filter((h) => h.slot === 'accessory').map((h) => h.hero)).toEqual(['B']);
  });

  it('replacements come after every member\'s step: a piece a later step takes is no replacement; the chain\'s end gets the rest', () => {
    // A takes B's helmet; M takes A's old one in his step (cost 2); M's old one goes to B — the end of the chain M ← A ← B
    const w = mk({ ah: { slot: 'helmet' }, bh: { slot: 'helmet' }, mh: { slot: 'helmet' } }, {
      A: { worn: { helmet: 'ah' }, value: { ah: 0, bh: 10, mh: 0 } },
      M: { worn: { helmet: 'mh' }, value: { mh: 0, ah: 6, bh: 1 } },
      B: { worn: { helmet: 'bh' }, value: { bh: 5, mh: 1, ah: 1 } },
    });
    const o = team(w, ['A', 'M']);
    expect(o.moves.moves.map((m) => [m.hero, m.item])).toEqual([['A', 'bh'], ['M', 'ah']]);
    expect(o.ends.repl.map((r) => [r.to, r.item, r.from])).toEqual([['B', 'mh', 'M']]);
    // A's old helmet is taken by M later in the walk: A locks it before putting on B's
    expect(linesOfWalk(o.walk).map(short).filter((x) => !x.endsWith('empty')).slice(0, 3)).toEqual(['lock A.helmet ah → M', 'A.helmet ← bh (worn B)', 'lock M.helmet mh → B']);
  });
});

describe('«Оставить как было» — a frozen slot', () => {
  it('freezes only that receiver\'s slot: the piece he declined goes to another member; nothing leaves his slot', () => {
    const w = mk({ ah: { slot: 'helmet' }, mh: { slot: 'helmet' }, bh: { slot: 'helmet' } }, {
      A: { worn: { helmet: 'ah' }, value: { ah: 0, bh: 10, mh: 1 } },
      M: { worn: { helmet: 'mh' }, value: { mh: 0, bh: 8, ah: 9 } },
      B: { worn: { helmet: 'bh' }, value: { bh: 1, ah: 0, mh: 0 } },
    });
    const free = team(w, ['A', 'M']);
    expect(free.moves.moves.find((m) => m.hero === 'A')?.item).toBe('bh');
    const d = { ...NO_DECISIONS, frozen: [slotKey('A', 'helmet')] };
    const o = team(w, ['A', 'M'], d);
    expect(o.moves.moves.map((m) => [m.hero, m.item])).toEqual([['M', 'bh']]); // M takes it; A's helmet is not taken (ah: 9 for M)
    expect(o.w2.heroes.find((h) => h.id === 'A')!.worn.helmet).toBe('ah');
    expect(linesOfWalk(o.walk).filter((l) => l.hero === 'A' && l.kind !== 'hole').map(short)).toEqual(['A.helmet kept']);
  });

  it('the one-hero walk: a kept slot is done; the line it removed is gone; unchanged lines keep their keys', () => {
    const w = rinWorld();
    const a = hero(w, 'R');
    const b = hero(w, 'R', { ...NO_DECISIONS, frozen: [slotKey('R', 'armor')] });
    expect(linesOfWalk(b.walk).map(short)).not.toContain('S.armor ← ra of R');
    const kept = linesOfWalk(b.walk).find((l) => l.kind === 'kept')!;
    expect(lineDone(kept, new Set())).toBe(true);
    const keysA = new Set(linesOfWalk(a.walk).map((l) => l.key));
    const same = linesOfWalk(b.walk).filter((l) => l.kind !== 'kept' && l.kind !== 'hole').map((l) => keysA.has(l.key));
    expect(same.every(Boolean)).toBe(true);
  });
});

describe('parked pieces', () => {
  const pw = (rValue: number | typeof no, kValue: number | typeof no, parked = true) => mk({ px: { slot: 'accessory' } }, {
    R: { pool: ['px'], value: { px: rValue } },
    K: { value: { px: kValue } },
  }, parked ? ['px'] : []);

  it('goes back on its own hero into an empty slot, with no bar', () => {
    expect(heroPlan(pw(no, no), { to: 'R' }).plan.changes.map((c) => c.cand.item.id)).toEqual(['px']);
  });
  it('another hero takes it into an empty slot (cost 2); not parked — it is R\'s spare and nobody else\'s', () => {
    const p = heroPlan(pw(no, no), { to: 'K' }).plan.changes;
    expect(p.map((c) => [c.cand.item.id, c.cand.cost])).toEqual([['px', 2]]);
    expect(heroPlan(pw(no, 3, false), { to: 'K' }).plan.changes).toEqual([]);
  });
  it('into a filled slot only by the usual rules: failing the bar it stays parked', () => {
    const w = mk({ px: { slot: 'accessory' }, kx: { slot: 'accessory' } }, {
      R: { pool: ['px'], value: { px: no } },
      K: { worn: { accessory: 'kx' }, value: { kx: 0, px: { v: 5, fit: 'no', ok: false } } },
    }, ['px']);
    expect(heroPlan(w, { to: 'K' }).plan.changes).toEqual([]);
  });
  it('the walk says where it lies: «припаркована у R»', () => {
    const o = hero(pw(no, no), 'K');
    expect(linesOfWalk(o.walk).map(short)[1]).toBe('K.accessory ← px (parked R)');
  });
});

describe('the record', () => {
  // Rin takes Caren's helmet; Rin's old helmet goes back to Caren (real data, the store)
  const k = piece('helmet', 'Speed', { ATK: 6, CHC: 6, CHD: 6, SPD: 6 });
  const r = piece('helmet', 'Speed', { ATK: 1, CHC: 1, HP: 1, RES: 1 });
  const acc = piece('accessory', null, { ATK: 2, CHC: 2, CHD: 2, SPD: 2 }, { itemKey: '1010', main: 'PEN%' });
  const st0 = store({ [HERO.karen]: { pool: [k], worn: [k] }, [HERO.rin]: { pool: [r], worn: [r] } });
  const ROSTER = [HERO.karen, HERO.rin];
  const outcome = (st: GearStore, d: Decisions = NO_DECISIONS) => {
    const w = worldOf(ctx, st, ROSTER);
    const hp = heroPlan(w, { to: HERO.rin, frozen: new Set(d.frozen) });
    return outcomeOf(w, [{ plans: [{ to: HERO.rin, plan: hp.plan }] }], [HERO.rin], [HERO.rin], d);
  };

  it('«Сделал» is off until every line is done; kept and entered lines count', () => {
    const o = outcome(st0);
    const lines = linesOfWalk(o.walk);
    const ticks = new Set<string>();
    const left0 = walkLeft(o.walk, ticks);
    expect(left0).toBe(lines.filter((l) => l.kind !== 'hole').length + lines.filter((l) => l.kind === 'hole').length);
    for (const l of lines) if (l.kind !== 'hole') ticks.add(l.key);
    expect(walkLeft(o.walk, ticks)).toBe(lines.filter((l) => l.kind === 'hole').length);
    const holes = lines.filter((l) => l.kind === 'hole').map((l) => slotKey(l.hero, l.slot));
    const d: Decisions = { ...NO_DECISIONS, left: holes.slice(1), entered: { [holes[0]]: { ...acc, subs: acc.lit, slot: 'weapon' } as never } };
    expect(walkLeft(outcome(st0, d).walk, ticks)).toBe(0);
  });

  it('one record: the move, the replacement, an entered piece; one undo gives back the very store', () => {
    const o = outcome(st0);
    const entered = [{ hero: HERO.rin, slot: 'accessory' as const, input: { slot: 'accessory' as const, grade: 'unique' as const, setId: null, itemKey: '1010', main: 'PEN%', subs: { ATK: 2, CHC: 2, CHD: 2, SPD: 2 } } }];
    const a = applyWalk(st0, { steps: o.steps, ends: o.ends, entered }, stampOf(st0), '2026-10-13')!;
    expect(a.st.worn?.[HERO.rin]?.helmet).toBe(k.id);
    expect(a.st.worn?.[HERO.karen]?.helmet).toBe(r.id);
    expect(a.st.pools[HERO.karen]).toEqual([r.id]);
    const added = a.st.worn?.[HERO.rin]?.accessory;
    expect(a.st.pieces[added!]).toMatchObject({ itemKey: '1010', main: 'PEN%', at: '2026-10-13' });
    expect(a.st.park).toBeUndefined();
    expect(a.undo(a.st)).toBe(st0);
    expect(stampOf(a.undo(a.st)!)).toBe(stampOf(st0));
    expect(a.undo({ ...a.st, seq: a.st.seq + 1 })).toBeNull(); // touched since — no undo
    expect(applyWalk(st0, { steps: o.steps, ends: o.ends, entered: [] }, stampOf(EMPTY_GEAR))).toBeNull(); // counted on another store
  });

  it('a kept replacement parks the piece in the store; the next trade offers it to Karen\'s empty helmet', () => {
    const d = { ...NO_DECISIONS, kept: [slotKey(HERO.karen, 'helmet')] };
    const o = outcome(st0, d);
    const a = applyWalk(st0, { steps: o.steps, ends: o.ends, entered: [] }, stampOf(st0))!;
    expect(a.st.park).toEqual([r.id]);
    expect(a.st.worn?.[HERO.karen]).toBeUndefined();
    const w = worldOf(ctx, a.st, ROSTER, { locked: new Set([HERO.rin]) }); // Rin is re-dressed: her helmet stays
    expect(w.parked?.has(r.id)).toBe(true);
    expect(heroPlan(w, { to: HERO.karen }).plan.changes.map((c) => [c.cand.item.id, c.cand.cost])).toEqual([[r.id, 2]]);
  });

  it('a received piece is not taken again (the re-dressed hero is locked); the replacement on the giver may be', () => {
    const o = outcome(st0);
    const st1 = applyWalk(st0, { steps: o.steps, ends: o.ends, entered: [] }, stampOf(st0))!.st;
    // Leah wants any good helmet: Rin's (locked) is not offered, Karen's replacement (Rin's old one) is
    const lh = piece('helmet', 'Speed', { HP: 1, RES: 1, EFF: 1, 'DEF%': 1 });
    const st2 = { ...st1, pieces: { ...st1.pieces, [lh.id]: lh }, pools: { ...st1.pools, [HERO.leah]: [lh.id] }, worn: { ...st1.worn, [HERO.leah]: { helmet: lh.id } } };
    const w = worldOf(ctx, st2, [...ROSTER, HERO.leah], { locked: new Set([HERO.rin]) });
    const took = heroPlan(w, { to: HERO.leah }).plan.changes.map((c) => c.cand.item.id);
    expect(took).not.toContain(k.id);
  });
});
