// «Партия» — the plan for a batch (.x/0110-batch/PLAN.md §3): the usual verdict, strongest first, decisions applied to
// a copy of the store; one piece — one fate; the entered order never decides a fate.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { inputOfPiece, planBatch, skipKey, undoPlan, type Entry, type Fate, type Plan } from '@/features/batch/plan';
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

const sG = () => mk('sG', 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const sB = () => mk('sB', 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const epicHelm = () => mk('eH', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' });
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

  it('random batches: the same fates in any entered order; one line per piece; at most 4 feeds per target', () => {
    const names = ['Caren', 'Rin', 'Aer', 'Kappa'];
    for (let seed = 1; seed <= 12; seed++) {
      const g = gen(seed);
      const pools: Record<string, Piece[]> = {};
      for (const n of names) pools[n] = ['helmet', 'armor', 'gloves', 'shoes'].map((s) => ({ ...randArmor(g, prof(n), s as Piece['slot']), id: `${n}-${s}-${seed}` }));
      const { ctx, st } = world(names, pools);
      const batch = Array.from({ length: 10 }, () => E({ ...randArmor(g, prof(g.pick(names)), g.pick(['helmet', 'armor', 'gloves', 'shoes'] as const)), bt: 0 }));
      const a = planBatch(ctx, st, batch);
      const shuffled = [...batch].reverse();
      const b = planBatch(ctx, st, shuffled);
      expect(fatesOf(b), `seed ${seed}`).toEqual(fatesOf(a));
      expect(a.lines.filter((l) => !l.off)).toHaveLength(batch.length);
      const per = new Map<string, number>();
      for (const l of a.lines) if (l.fate.kind === 'feed') { const k = JSON.stringify(l.fate.to); per.set(k, (per.get(k) ?? 0) + 1); }
      expect(Math.max(0, ...per.values()), `seed ${seed}`).toBeLessThanOrEqual(4);
    }
  });
});
