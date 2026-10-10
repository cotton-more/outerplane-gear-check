// «Партия» — the plan for a batch (MODEL.md §8): the usual verdict, strongest first, decisions applied to
// a copy of the store; one piece — one fate; the entered order never decides a fate.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { inputOfPiece, planBatch, skipKey, undoPlan, type Entry, type Fate, type Plan } from '@/features/batch/plan';
import { poolView } from '@/features/gear/pool';
import { verdictOf } from '@/features/gear/verdict';
import { char, gen, idx, mk, prof, randArmor } from '../gear/statSets';

// store: pools by hero name; worn — by default everything in the pool is worn
function world(roster: string[], pools: Record<string, Piece[]> = {}, worn?: Record<string, string[]>) {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st: GearStore = { v: 3, seq: 0, pieces: {}, pools: {}, worn: {} };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    const on = worn?.[name] ?? list.map((p) => p.id);
    st.worn![id] = Object.fromEntries(list.filter((p) => on.includes(p.id)).map((p) => [p.slot, p.id])) as Worn;
  }
  st.seq = Object.keys(st.pieces).length;
  return { ctx, st };
}
const E = (p: Piece, twin = false): Entry => ({ input: inputOfPiece(p), twin });
const key = (x: ItemInput) => JSON.stringify([x.slot, x.grade, x.setId, x.itemKey, x.main, Object.entries(x.subs), x.bt ?? null]);
// a fate without entry numbers: «корм для #2» → the fed piece's content
function norm(plan: Plan, f: Fate): string {
  switch (f.kind) {
    case 'wear': case 'keep': case 'reserve': return `${f.kind}:${f.c.name}`;
    case 'feed': return 'feed:' + ('entry' in f.to ? key(plan.lines.find((l) => l.n === (f.to as { entry: number }).entry && !l.off)!.input) : f.to.piece.id);
    case 'same': return 'same:' + f.same.piece.id;
    case 'maybe': return 'maybe';
    default: return f.kind;
  }
}
const fatesOf = (plan: Plan) => plan.lines.filter((l) => !l.off).map((l) => key(l.input) + ' → ' + norm(plan, l.fate)).sort();
// one physical piece — one line, and the lines match the final store: a «wear» line's piece is worn by its hero, a
// «keep» (not held) / «reserve» line's piece is in its hero's pool, a taken-off / set-aside line is a recorded piece
const same = (p: Piece, x: ItemInput) => key(inputOfPiece(p)) === key({ ...x, bt: inputOfPiece(p).bt });
function problems(base: GearStore, plan: Plan): string[] {
  const out: string[] = [];
  const offs = plan.lines.filter((l) => l.off).map((l) => l.off!.piece.id);
  if (new Set(offs).size !== offs.length) out.push('a piece on two lines');
  for (const l of plan.lines) {
    const f = l.fate;
    if (l.off && !base.pieces[l.off.piece.id]) out.push(`${l.id}: off line for a piece the plan made`);
    if (f.kind === 'wear') {
      const w = plan.st.worn?.[f.c.id]?.[l.input.slot];
      if (!w || !same(plan.st.pieces[w], l.input)) out.push(`${l.id}: «wear ${f.c.name}», not worn at the end`);
    }
    if (f.kind === 'keep' && f.held && !plan.st.pools[l.off!.c.id]?.includes(l.off!.piece.id)) out.push(`${l.id}: held, but gone from the pool`);
    if ((f.kind === 'keep' && !f.held) || f.kind === 'reserve') {
      if (!(plan.st.pools[f.c.id] ?? []).some((id) => same(plan.st.pieces[id], l.input))) out.push(`${l.id}: «${f.kind} ${f.c.name}», not in the pool at the end`);
    }
  }
  return out;
}

const sG = (id = 'sG') => mk(id, 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const sB = (id = 'sB') => mk(id, 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const epicHelm = (id = 'eH') => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' });
const weak = (id: string) => mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0);
const good = (id: string) => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);

describe('plan of a batch', () => {
  it('Rin case in one batch: the good Legendary is worn, the weak one feeds it — whatever the entered order', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const a = planBatch(ctx, st, [E(weak('L1')), E(good('L2'))]);
    expect(a.lines.map((l) => [l.id, l.fate.kind])).toEqual([['1', 'feed'], ['2', 'wear'], ['2~1', expect.stringMatching(/^(junk|maybe)$/)]]);
    expect(a.lines[0].fate).toMatchObject({ kind: 'feed', to: { entry: 2 } });
    expect(a.lines[1].fate).toMatchObject({ kind: 'wear', c: { name: 'Caren' }, instead: { id: 'eH' } });
    expect(a.lines[2].off).toMatchObject({ c: { name: 'Caren' }, piece: { id: 'eH' } });
    const b = planBatch(ctx, st, [E(good('L2')), E(weak('L1'))]);
    expect(fatesOf(b)).toEqual(fatesOf(a));
    expect(a.counts).toEqual({ wear: 1, keep: 0, feed: 1, junk: a.lines[2].fate.kind === 'junk' ? 1 : 0 });
  });

  it('four pieces per target: the new piece gets four and «T4»; the rest are not fed to it', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB()] });
    const batch = [E(good('L2')), ...['w1', 'w2', 'w3', 'w4', 'w5'].map((id, i) => E({ ...weak(id), lit: { SPD: 1, RES: 1, EFF: 1, HP: 1 + (i % 2) } }))];
    const plan = planBatch(ctx, st, batch);
    const fed = plan.lines.filter((l) => l.fate.kind === 'feed');
    expect(fed).toHaveLength(4);
    expect(fed.every((l) => l.fate.kind === 'feed' && 'entry' in l.fate.to && l.fate.to.entry === 1)).toBe(true);
    expect(plan.lines[0].fate).toMatchObject({ kind: 'wear', t4: true });
    expect(plan.t4).toHaveLength(1);
    expect(plan.st.pieces[plan.t4[0]].bt).toBe(4);
    expect(plan.lines.filter((l) => l.fate.kind !== 'feed' && l.n > 1).map((l) => l.fate.kind)).not.toContain('feed');
  });

  it('two identical pieces in a batch are two pieces, not «looks set aside»', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB()] });
    const plan = planBatch(ctx, st, [E(weak('a')), E(weak('b'))]);
    expect(plan.lines.map((l) => l.fate.kind)).not.toContain('same');
    expect(plan.lines[0].fate).toMatchObject({ kind: 'reserve', c: { name: 'Caren' } });
  });

  it('a piece that looks like a set-aside record — «same», no operation; «Это другой» plans it as a second copy', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), weak('L1')] }, { Caren: ['sG', 'sB'] });
    const plan = planBatch(ctx, st, [E(weak('x'))]);
    expect(plan.lines[0].fate).toMatchObject({ kind: 'same', same: { piece: { id: 'L1' } } });
    expect(plan.ops).toHaveLength(0);
    const twin = planBatch(ctx, st, [E(weak('x'), true)]);
    expect(twin.lines[0].fate.kind).not.toBe('same');
  });

  it('«Не брать» leaves the hero out for that line', () => {
    const { ctx, st } = world(['Caren', 'Aer'], { Caren: [sG(), sB()], Aer: [{ ...sG(), id: 'aG' }, { ...sB(), id: 'aB' }] });
    const plan = planBatch(ctx, st, [E(good('L2'))]);
    const first = plan.lines[0].fate as Extract<Fate, { c: unknown }>;
    expect(first.kind).toBe('wear');
    const other = planBatch(ctx, st, [E(good('L2'))], new Set([skipKey('1', first.c.id)]));
    expect(other.lines[0].fate).toMatchObject({ kind: 'wear' });
    expect((other.lines[0].fate as Extract<Fate, { c: unknown }>).c.name).not.toBe(first.c.name);
  });

  it('«Вернуть» brings the store back', () => {
    const { ctx, st } = world(['Caren', 'Aer'], { Caren: [sG(), sB(), epicHelm()], Aer: [{ ...sG(), id: 'aG' }] });
    const plan = planBatch(ctx, st, [E(good('L2')), E(weak('L1')), E(good('L3'))]);
    expect(plan.ops.length).toBeGreaterThan(0);
    const back = undoPlan(plan.st, plan);
    expect(back.pools).toEqual(st.pools);
    expect(back.worn).toEqual(st.worn);
  });

  it("the hero's own weak reserve the new piece pushes out gets its own line: feed to the new one", () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm(), weak('L1')] }, { Caren: ['sG', 'sB', 'eH'] });
    const plan = planBatch(ctx, st, [E(good('L2'))]);
    expect(plan.lines[0].fate).toMatchObject({ kind: 'wear', c: { name: 'Caren' }, instead: { id: 'eH' } });
    const res = plan.lines.find((l) => l.off?.piece.id === 'L1')!;
    expect(res.off).toMatchObject({ c: { name: 'Caren' }, was: 'stash' });
    expect(res.fate).toEqual({ kind: 'feed', to: { entry: 1 } });
    expect(plan.lines.find((l) => l.off?.piece.id === 'eH')?.off?.was).toBe('worn');
    expect(plan.lines).toHaveLength(3);
    expect(plan.counts.feed).toBe(1);
    const back = undoPlan(plan.st, plan);
    expect(back.pools).toEqual(st.pools);
    expect(back.worn).toEqual(st.worn);
  });

  it("another hero's reserve the new piece eats leaves that hero's pool, with its own line; «Вернуть» puts it back", () => {
    const { ctx, st } = world(['Caren', 'Aer'], {
      Caren: [sG('cG'), sB('cB')],
      Aer: [sG('aG'), sB('aB'), epicHelm('aH'), weak('L1')],
    }, { Caren: ['cG', 'cB'], Aer: ['aG', 'aB', 'aH'] });
    const plan = planBatch(ctx, st, [E(good('L2'))]);
    expect(plan.lines[0].fate).toMatchObject({ kind: 'wear', c: { name: 'Caren' }, instead: null });
    const res = plan.lines.find((l) => l.off?.piece.id === 'L1')!;
    expect(res.off).toMatchObject({ c: { name: 'Aer' }, was: 'stash' });
    expect(res.fate).toEqual({ kind: 'feed', to: { entry: 1 } });
    expect(plan.st.pools[char('Aer').id]).not.toContain('L1');
    const back = undoPlan(plan.st, plan);
    expect(back.pools).toEqual(st.pools);
    expect(back.worn).toEqual(st.worn);
  });

  it('the eaten reserve counts against the four feeds of the new piece', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), weak('L1')] }, { Caren: ['sG', 'sB'] });
    const weaks = ['w1', 'w2', 'w3', 'w4'].map((id, i) => E({ ...weak(id), lit: { SPD: 1, RES: 1, EFF: 1 + (i >> 1), HP: 1 + (i % 2) } }));
    const plan = planBatch(ctx, st, [E(good('L2')), ...weaks]);
    expect(plan.lines.find((l) => l.off?.piece.id === 'L1')?.off?.was).toBe('stash');
    const fed = plan.lines.filter((l) => l.fate.kind === 'feed' && 'entry' in l.fate.to && l.fate.to.entry === 1);
    expect(fed).toHaveLength(4);
    expect(plan.lines.filter((l) => l.fate.kind === 'feed')).toHaveLength(4);
  });

  it('a piece the plan put on and a later «Надень» took off has one line — its own, matching the final store (seed 358)', () => {
    const { ctx, st } = world(['Caren', 'Rin'], {
      Caren: [mk('Ch', 'helmet', 'Revenge', { CHD: 4, SPD: 3, DEF: 5, 'DMG UP%': 3 })],
      Rin: [
        mk('Rh', 'helmet', 'Speed', { 'DMG RED%': 1, CHD: 3, SPD: 4, ATK: 6 }),
        mk('Ra', 'armor', 'Resilience', { 'DMG UP%': 5, 'DEF%': 5, 'ATK%': 3, CHC: 2 }),
        mk('Rg', 'gloves', 'Speed', { 'DEF%': 4, RES: 2, CHC: 1 }, 4, { grade: 'rare' }),
      ],
    });
    const plan = planBatch(ctx, st, [
      E(mk('b1', 'armor', 'Penetration', { 'DMG UP%': 6, 'HP%': 5, ATK: 5, SPD: 6 }, 0)),
      E(mk('b2', 'armor', 'Speed', { SPD: 3, 'ATK%': 5, 'HP%': 6, CHD: 4 }, 0)),
    ]);
    expect(problems(st, plan)).toEqual([]);
    // owner 2026-10-08, (c): with no pin the Speed armor (#2) goes on Rin first; Rin's old armor goes on Caren's empty
    // slot under it, and #1 is left «Спорно» — no piece on two lines (was: #1 on Rin, #2 set aside for Caren)
    expect(plan.lines.map((l) => [l.id, l.fate.kind, 'c' in l.fate ? l.fate.c.name : ''])).toEqual([['1', 'maybe', ''], ['2', 'wear', 'Rin'], ['2~1', 'wear', 'Caren']]);
    expect(plan.lines[2].off).toMatchObject({ piece: { id: 'Ra' }, was: 'worn' });
  });

  it('a reserve the plan made that a later «Надень» eats feeds that piece — not planned again', () => {
    // #1 goes on Aer («Не брать» Caren), Aer's old helmet comes off and goes on Caren's empty slot; #2, the weak one, is
    // Caren's reserve by then («Не брать» Aer) — the moved helmet eats it
    const { ctx, st } = world(['Caren', 'Aer'], { Caren: [sG(), sB()], Aer: [sG('aG'), sB('aB'), mk('aH', 'helmet', 'Speed', { CHC: 2, CHD: 2, SPD: 1, HP: 1 }, 0)] });
    const best = mk('L3', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, 0);
    const plan = planBatch(ctx, st, [E(best), E(weak('L1'))], new Set([skipKey('1', char('Caren').id), skipKey('2', char('Aer').id)]));
    expect(plan.lines.map((l) => [l.id, l.fate.kind])).toEqual([['1', 'wear'], ['1~1', 'wear'], ['2', 'feed']]);
    const caren = char('Caren').id;
    // #2 was set aside first (its record is the one the moved helmet's «Надень» removed), now it feeds that helmet
    const eaten = plan.ops.flatMap((o) => ('r' in o && o.c === caren ? o.r.removed : []));
    expect(eaten).toHaveLength(1);
    expect(plan.lines[2].fate).toMatchObject({ kind: 'feed', to: { c: { name: 'Caren' }, piece: { id: plan.st.worn?.[caren]?.helmet } } });
    expect(plan.wornFed).toBe(true);
    expect(problems(st, plan)).toEqual([]);
  });

  // random batches on the fixture: 8 heroes, some slots empty, some pieces set aside; 8–12 pieces, mostly one set
  it('random batches: one line per piece, lines match the final store, nothing silent, any order, capacity, «Вернуть»', () => {
    const names = ['Caren', 'Rin', 'Aer', 'Kappa', 'Maxwell', 'Tamamo-no-Mae', 'Monad Eva', 'Hilde'];
    const slots = ['helmet', 'armor', 'gloves', 'shoes'] as const;
    const pools0 = (st: GearStore) => JSON.stringify([
      Object.fromEntries(Object.entries(st.pools).filter(([, v]) => v.length).sort()),
      Object.fromEntries(Object.entries(st.worn ?? {}).filter(([, v]) => Object.keys(v).length).sort()),
    ]);
    for (let seed = 1; seed <= 100; seed++) {
      const g = gen(seed);
      const pools: Record<string, Piece[]> = {}, worn: Record<string, string[]> = {};
      for (const n of names) {
        pools[n] = slots.filter(() => g.rnd() < 0.8).map((s) => ({ ...randArmor(g, prof(n), s), id: `${n}-${s}` }));
        worn[n] = pools[n].filter(() => g.rnd() < 0.8).map((p) => p.id);
      }
      const { ctx, st } = world(names, pools, worn);
      const set = g.pick([...prof(g.pick(names)).menuSets]);
      const batch = Array.from({ length: 8 + g.int(5) }, () => {
        const p = randArmor(g, prof(g.pick(names)), g.pick(slots));
        return E({ ...p, setId: g.rnd() < 0.7 ? set : p.setId, bt: 0 });
      });
      const at = `seed ${seed}`;
      const plan = planBatch(ctx, st, batch);

      // one piece — one line; wear / keep / reserve lines match the final store; no line for a record the plan made
      expect(plan.lines.filter((l) => !l.off), at).toHaveLength(batch.length);
      expect(problems(st, plan), at).toEqual([]);

      // nothing silent: a recorded piece that leaves a hero's pool has its own line, or «Надень» dropped it in another
      // slot (the «Лишнее убрано» note on «Записать план»)
      for (const [c, ids] of Object.entries(st.pools)) {
        for (const id of ids.filter((x) => !plan.st.pools[c]?.includes(x))) {
          const line = plan.lines.some((l) => l.off?.piece.id === id && l.off.c.id === c);
          const pruned = plan.ops.some((o) => 'r' in o && o.c === c && o.r.removed.some((p) => p.id === id && p.slot !== o.r.slot));
          expect(line || pruned, `${at}: ${id} left ${c} silently`).toBe(true);
        }
      }

      // the entered order never decides a fate
      const order = batch.map((e) => [g.rnd(), e] as const).sort((x, y) => x[0] - y[0]).map(([, e]) => e);
      expect(fatesOf(planBatch(ctx, st, order)), at).toEqual(fatesOf(plan));

      // capacity: no «Разобрать» while the usual verdict on the final store (targets fed four times left out) says
      // «material now»
      const per = new Map<string, number>();
      for (const l of plan.lines) if (l.fate.kind === 'feed' && !('entry' in l.fate.to)) per.set(l.fate.to.piece.id, (per.get(l.fate.to.piece.id) ?? 0) + 1);
      const full = new Set([...per].filter(([, k]) => k >= 4).map(([id]) => id));
      const view = poolView(ctx, plan.st);
      for (const l of plan.lines.filter((x) => x.fate.kind === 'junk')) {
        const r = verdictOf(ctx, (id) => view.hero(id), l.input, { twin: true, full });
        expect(r?.kind === 'material' && r.sub === 'now', `${at}: ${l.id} «Разобрать», but material now`).toBe(false);
      }

      // «Вернуть»: pools and worn as before
      expect(pools0(undoPlan(plan.st, plan)), at).toBe(pools0(st));
    }
  });
});

// owner 2026-10-08 (Viella's gloves): a recorded piece below T4 fed four times is T4 — from any tier, the game takes no more
describe('«T4» on a recorded piece fed four times', () => {
  it('Caren\'s worn T0 helmet gets four weak copies — marked T4; «Вернуть» takes the mark back', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), good('cH')] });
    const plan = planBatch(ctx, st, ['w1', 'w2', 'w3', 'w4'].map((id, i) => E({ ...weak(id), lit: { SPD: 1, RES: 1 + (i % 2), EFF: 1 + (i >> 1), HP: 1 } })));
    expect(plan.lines.filter((l) => l.fate.kind === 'feed')).toHaveLength(4);
    expect(plan.t4).toEqual(['cH']);
    expect(plan.st.pieces.cH.bt).toBe(4);
    expect(plan.wornFed).toBe(false);                    // fed four — no «отметь T4» footnote
    expect(undoPlan(plan.st, plan).pieces.cH.bt).toBe(0);
  });

  it('fed fewer than four — not marked, the footnote stays', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), good('cH')] });
    const plan = planBatch(ctx, st, [E(weak('w1'))]);
    expect(plan.t4).toEqual([]);
    expect(plan.wornFed).toBe(true);
  });
});

// owner 2026-10-09 (#48 Ether Blade): a piece taken off one hero goes on another and becomes a feed target only after the
// entries are decided — a copy of it decided «Разобрать» before then is looked at again and feeds it
describe('a junk piece feeds a piece that reached a hero later', () => {
  it('Aer\'s Snow-white DEF% comes off and goes on Caren; the batch\'s weak copy feeds it, not «Разобрать»', () => {
    const W = (id: string, key: string, main: string, lit: Record<string, number>) => mk(id, 'weapon', null, lit, 0, { itemKey: key, main });
    const { ctx, st } = world(['Aer', 'Caren'], {
      Aer: [W('aSw', '19', 'DEF%', { DEF: 4, RES: 1, EFF: 1, HP: 1 })],            // not Aer's item — a stopgap at best
      Caren: [sG('cG'), sB('cB'), W('cSl', '14', 'DEF%', { RES: 1, EFF: 1, HP: 1, 'HP%': 1 })], // her Sledgehammer, weak
    });
    const plan = planBatch(ctx, st, [
      E(W('sure', '4', 'ATK%', { CHC: 3, CHD: 3, SPD: 2, 'DMG UP%': 2 })),       // Aer's own — goes on her
      E(W('copy', '19', 'DEF%', { DEF: 1, RES: 1, EFF: 1, HP: 1 })),             // a weak copy of the one coming off
    ]);
    const lines = plan.lines.map((l) => [l.id, l.fate.kind, 'c' in l.fate ? (l.fate as { c: { name: string } }).c.name : '']);
    expect(lines).toContainEqual(['1~1', 'wear', 'Caren']);
    expect(plan.lines.find((l) => l.n === 2 && !l.off)!.fate).toMatchObject({ kind: 'feed', to: { c: { name: 'Caren' } } });
    expect(problems(st, plan)).toEqual([]);
  });
});

// owner 2026-10-09: a T4 piece as feed lifts the target straight to T4 — it counts as all four feeds
describe('a T4 piece as feed', () => {
  it('fills the target at once: «T4» on it, no other piece is fed to it', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), good('cH')] });
    const t4 = { ...weak('w4'), bt: 4 as const };
    const plan = planBatch(ctx, st, [E(t4), E({ ...weak('w1'), lit: { SPD: 1, RES: 2, EFF: 1, HP: 1 } })]);
    expect(plan.lines[0].fate).toMatchObject({ kind: 'feed', to: { c: { name: 'Caren' }, piece: { id: 'cH' } } });
    expect(plan.lines[1].fate.kind).not.toBe('feed');
    expect(plan.st.pieces.cH.bt).toBe(4);
  });
});
