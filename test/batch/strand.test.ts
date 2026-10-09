// I-4 (merge review A1): a «Корм» whose target a later «Надень» took out of the pool is decided again — the feed follows the
// piece that took its place, and nothing (the «T4» mark included) lands on a record that is gone.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { entriesOf, NEW_BATCH, type Batch, type BatchEntry } from '@/features/batch/batch';
import { inputOfPiece, planBatch, type Fate, type Plan } from '@/features/batch/plan';
import { char, idx, mk } from '../gear/statSets';

function world(roster: string[], pools: Record<string, Piece[]> = {}) {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st: GearStore = { v: 3, seq: 0, pieces: {}, pools: {}, worn: {} };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    st.worn![id] = Object.fromEntries(list.map((p) => [p.slot, p.id])) as Worn;
  }
  st.seq = Object.keys(st.pieces).length;
  return { ctx, st };
}
const piece = (p: Piece): BatchEntry => ({ kind: 'piece', input: inputOfPiece(p) });
const batchOf = (items: BatchEntry[]): Batch => ({ ...NEW_BATCH, items });
const plan = (ctx: ReturnType<typeof world>['ctx'], st: GearStore, b: Batch): Plan => planBatch(ctx, st, entriesOf(b), new Set(b.skip));
const fate = (p: Plan, id: string): Fate => p.lines.find((l) => l.id === id)!.fate;

describe('a feed target that a later «Надень» took out of the pool', () => {
  // FC: #1 feeds Roxie's worn weapon q2; #2 goes on Roxie, takes q2 off, and q2 is itself fed to #2
  const W = (id: string, main: string, lit: Record<string, number>, bt: 0 | 4 | null = 0) => mk(id, 'weapon', null, lit, bt, { itemKey: '17', main });
  const roster = () => world(['Gnosis Domine', 'Roxie'], { 'Gnosis Domine': [], Roxie: [W('q2', 'ATK%', { CHD: 3, SPD: 5, CHC: 4, HP: 3 }, null)] });
  it('no feed is left on the record that left the pool; every feed goes to a piece that is there at the end', () => {
    const { ctx, st } = roster();
    const b = batchOf([piece(W('a', 'DEF%', { 'ATK%': 1, RES: 1, CHC: 2, SPD: 2 })), piece(W('b', 'ATK%', { CHC: 5, 'DMG UP%': 4, SPD: 6, 'DMG RED%': 2 })), piece(W('c', 'DEF%', { CHC: 1, DEF: 4, EFF: 3, 'HP%': 4 }))]);
    const p = plan(ctx, st, b);
    expect(p.st.pools[char('Roxie').id]).not.toContain('q2');
    for (const l of p.lines) {
      const f = l.fate;
      if (f.kind !== 'feed') continue;
      if ('entry' in f.to) expect(['wear', 'keep']).toContain(fate(p, String(f.to.entry)).kind);
      else expect(p.st.pools[f.to.c.id]).toContain(f.to.piece.id);
    }
    expect(fate(p, '1')).toMatchObject({ kind: 'feed', to: { entry: 2 } });          // #1 follows the weapon Roxie got
    expect(fate(p, '2~1')).toMatchObject({ kind: 'feed', to: { entry: 2 } });        // q2 itself feeds #2
    expect(p.wornFed).toBe(false);
  });
  it('the T4 mark is not lost: four feeds to the new weapon give it «T4» on its line', () => {
    const { ctx, st } = roster();
    const feeds = [0, 1, 2, 3].map((i) => piece(W('f' + i, 'DEF%', { 'ATK%': 1 + (i % 2), RES: 1 + i, CHC: 2, SPD: 2 })));
    const b = batchOf([...feeds, piece(W('b', 'ATK%', { CHC: 5, 'DMG UP%': 4, SPD: 6, 'DMG RED%': 2 }))]);
    const p = plan(ctx, st, b);
    const bestN = 5, best = fate(p, '5');
    expect(best.kind).toBe('wear');
    // three of the batch and q2 — four feeds, all to the new weapon (none to the record that left the pool)
    expect(p.lines.filter((l) => l.fate.kind === 'feed' && 'entry' in l.fate.to && l.fate.to.entry === bestN)).toHaveLength(4);
    expect(p.lines.every((l) => l.fate.kind !== 'feed' || 'entry' in l.fate.to || p.st.pools[l.fate.to.c.id]?.includes(l.fate.to.piece.id))).toBe(true);
    expect(best).toMatchObject({ kind: 'wear', t4: true });
  });
});
