// «Надеть в игре» (features/ingame, HISTORY.md 0230): a line per hero and slot, live while the app has that record worn
// there; a second «Надеть» replaces the line; «Вернуть» brings back the one it replaced; a superseded promise leaves the
// pool (features/gear/pool putOn promised) and the new line carries no «taken off» note; storage.
import { describe, expect, it } from 'vitest';
import { EMPTY_GEAR, updateIn, type GearStore } from '@/features/gear/model/gear';
import { putOn, removeFrom, wearFromPool, type PutResult } from '@/features/gear/pool';
import { switchFusion } from '@/features/gear/model/fusion';
import type { ItemInput } from '@/game/item/item';
import type { SlotId } from '@/game/data/types';
import {
  addLine, countOf, isLive, lineAt, lineOf, NO_INGAME, promisedOf, pruned, removeLine, restoreIngame, restoreLine, sectionsOf, undoLine,
  type Ingame, type Line,
} from '@/features/ingame/ingame';
import { char, ctx, idx, setId } from '../gear/statSets';

const caren = char('Caren'), kappa = char('Kappa');
const piece = (slot: SlotId, set: string, subs: Record<string, number>, grade: 'unique' | 'rare' = 'unique'): ItemInput =>
  ({ slot, grade, setId: setId(set), itemKey: null, main: null, subs, bt: 0 });
const WEAK = piece('helmet', 'Speed', { 'DEF%': 1, CHC: 1, RES: 1 });
const MID = piece('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 2 });
const GOOD = piece('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 });

// «Надеть» from «Оценка» as useFormFlow does it: the slot's live promise before it, the put with the promised ids, the line
function equip(b: Ingame, st: GearStore, hero: string, x: ItemInput): { b: Ingame; st: GearStore; r: PutResult; line: Line; prev: Line | null } {
  const prev = lineAt(b, st, hero, x.slot);
  const r = putOn(ctx, st, hero, x, { promised: promisedOf(b, st, hero) });
  const line = lineOf(r, r.st, hero, prev);
  return { b: addLine(b, r.st, line), st: r.st, r, line, prev };
}

describe('lines', () => {
  it('a «Надеть» appends a line; a second one on the same slot replaces it in place, another slot goes last', () => {
    let { b, st } = equip(NO_INGAME, EMPTY_GEAR, caren.id, MID);
    ({ b, st } = equip(b, st, kappa.id, MID));
    ({ b, st } = equip(b, st, caren.id, piece('gloves', 'Speed', { 'DEF%': 2, CHC: 2 })));
    expect(b.lines.map((l) => [l.hero, l.slot, l.piece])).toEqual([[caren.id, 'helmet', 'p1'], [kappa.id, 'helmet', 'p2'], [caren.id, 'gloves', 'p3']]);
    ({ b, st } = equip(b, st, caren.id, GOOD));
    expect(b.lines.map((l) => [l.hero, l.slot, l.piece])).toEqual([[caren.id, 'helmet', 'p4'], [kappa.id, 'helmet', 'p2'], [caren.id, 'gloves', 'p3']]);
    expect(b.lines[0].snap).toMatchObject({ id: 'p4', slot: 'helmet', lit: GOOD.subs });
    // sections: by hero in the order of the first promise, slots in game order
    expect(sectionsOf(b, st).map((s) => [s.hero, s.lines.map((l) => l.line.slot)])).toEqual([[caren.id, ['helmet', 'gloves']], [kappa.id, ['helmet']]]);
    expect(countOf(b, st)).toBe(3);
  });

  it('«Вернуть» of that «Надеть» removes the line, or puts back the one it replaced; a later line of the slot is left alone', () => {
    const one = equip(NO_INGAME, EMPTY_GEAR, caren.id, MID);
    expect(undoLine(one.b, one.line, one.prev).lines).toEqual([]);
    const two = equip(one.b, one.st, caren.id, GOOD);
    expect(undoLine(two.b, two.line, two.prev).lines).toEqual([one.line]);
    const three = equip(two.b, two.st, caren.id, GOOD);
    expect(undoLine(three.b, two.line, two.prev)).toBe(three.b);
  });

  it('F2: superseded, then ticked, then «Вернуть» of the «Надеть»: the first promise comes back', () => {
    const one = equip(NO_INGAME, EMPTY_GEAR, caren.id, MID);
    const two = equip(one.b, one.st, caren.id, GOOD);
    const ticked = removeLine(two.b, two.line.id)!.next;
    expect(ticked.lines).toEqual([]);
    expect(undoLine(ticked, two.line, two.prev).lines).toEqual([one.line]);
    // the slot has a line again (a later «Надеть»): nothing comes back
    const later = equip(ticked, two.st, caren.id, MID);
    expect(undoLine(later.b, two.line, two.prev)).toBe(later.b);
    // without prev, a gone line is a no-op
    expect(undoLine(ticked, two.line, null)).toBe(ticked);
  });

  it('`was`: the piece the game takes off, when it stayed in the pool (lock); not on feed or none; a superseding line has none', () => {
    const strong = equip(NO_INGAME, EMPTY_GEAR, caren.id, GOOD);
    const weak = putOn(ctx, strong.st, caren.id, WEAK);
    expect(lineOf(weak, weak.st, caren.id, null)).toMatchObject({ off: 'lock', was: strong.r.id });
    expect(equip(NO_INGAME, EMPTY_GEAR, caren.id, MID).line.was).toBeUndefined();
    const e0 = putOn(ctx, EMPTY_GEAR, caren.id, piece('helmet', 'Speed', { 'DEF%': 1, CHC: 1 }, 'rare'));
    const e1 = putOn(ctx, e0.st, caren.id, piece('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 'rare'));
    expect(lineOf(e1, e1.st, caren.id, null).was).toBeUndefined();
    const l1 = lineOf(weak, weak.st, caren.id, null);
    const l2 = lineOf(weak, weak.st, caren.id, l1);
    expect(l2.off).toBeUndefined();
    expect(l2.was).toBeUndefined();
  });

  it('the tick removes a line; «Вернуть» puts it back in its place', () => {
    let { b, st } = equip(NO_INGAME, EMPTY_GEAR, caren.id, MID);
    ({ b, st } = equip(b, st, kappa.id, MID));
    const r = removeLine(b, b.lines[0].id)!;
    expect(r.next.lines.map((l) => l.hero)).toEqual([kappa.id]);
    expect(restoreLine(r.next, r.line, r.at)).toEqual(b);
    expect(removeLine(b, 'nope')).toBeNull();
  });

  it('the fate of the taken-off piece: empty slot — none; a reserve now — lock; Epic material of the new one — feed', () => {
    expect(equip(NO_INGAME, EMPTY_GEAR, caren.id, MID).line.off).toBeUndefined();
    // a weaker piece put on (name search): the strong one stays in the pool — in the game, lock it
    const strong = equip(NO_INGAME, EMPTY_GEAR, caren.id, GOOD);
    const weak = putOn(ctx, strong.st, caren.id, WEAK);
    expect(weak.st.pools[caren.id]).toContain(strong.r.id);
    expect(lineOf(weak, weak.st, caren.id, null).off).toBe('lock');
    // an Epic of the same set replaced by a better Epic — material of the new one
    const e0 = putOn(ctx, EMPTY_GEAR, caren.id, piece('helmet', 'Speed', { 'DEF%': 1, CHC: 1 }, 'rare'));
    const e1 = putOn(ctx, e0.st, caren.id, piece('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 'rare'));
    expect(e1.removed.map((p) => p.id)).toEqual([e0.id]);
    expect(lineOf(e1, e1.st, caren.id, null).off).toBe('feed');
    // a Legendary taken off and gone — nothing to do in the game (rated again from the inventory)
    const l1 = putOn(ctx, putOn(ctx, EMPTY_GEAR, caren.id, MID).st, caren.id, GOOD);
    expect(lineOf(l1, l1.st, caren.id, null).off).toBeUndefined();
  });

  it('fed: other heroes\' reserves the Breakthrough eats travel with the line', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, MID);
    const snap = { ...r.piece, id: 'p9' };
    expect(lineOf(r, r.st, caren.id, null, [{ hero: kappa.id, snap }]).fed).toEqual([{ hero: kappa.id, snap }]);
    expect(lineOf(r, r.st, caren.id, null, []).fed).toBeUndefined();
  });
});

describe('live = the record is worn there', () => {
  const start = () => equip(NO_INGAME, EMPTY_GEAR, caren.id, MID);

  it('removal drops the line', () => {
    const { b, st, r } = start();
    const after = removeFrom(st, caren.id, r.id);
    expect(isLive(after, b.lines[0])).toBe(false);
    expect(pruned(b, after).lines).toEqual([]);
    expect(pruned(b, st)).toBe(b);
  });

  it('a re-dress (another record of the pool worn in that slot) drops it', () => {
    const { b, r } = start();
    const two = putOn(ctx, EMPTY_GEAR, caren.id, GOOD);
    // the pool holds both: the promised record and one worn earlier; the card wears the other
    const st: GearStore = { ...two.st, seq: 2, pieces: { ...two.st.pieces, p2: { ...r.piece, id: 'p2' } }, pools: { [caren.id]: ['p1', 'p2'] }, worn: { [caren.id]: { helmet: 'p2' } } };
    const line = { ...b.lines[0], piece: 'p2', snap: { ...r.piece, id: 'p2' } };
    expect(isLive(st, line)).toBe(true);
    const re = wearFromPool(ctx, st, caren.id, 'p1')!;
    expect(isLive(re.st, line)).toBe(false);
  });

  it('a trade (the record moved to another hero) drops it', () => {
    const { b, st, r } = start();
    const moved: GearStore = { ...st, pools: { [kappa.id]: [r.id] }, worn: { [kappa.id]: { helmet: r.id } } };
    expect(isLive(moved, b.lines[0])).toBe(false);
  });

  it('a Core Fusion move (X → Core Fusion X) drops it', () => {
    const lisha = char('Lisha'), cf = char('Core Fusion Lisha');
    const { b, st } = equip(NO_INGAME, EMPTY_GEAR, lisha.id, MID);
    expect(isLive(st, b.lines[0])).toBe(true);
    const sw = switchFusion(idx, [lisha.id], st, cf.id)!;
    expect(sw.st.worn?.[cf.id]?.helmet).toBe('p1');
    expect(isLive(sw.st, b.lines[0])).toBe(false);
  });

  it('an edit of levels in the piece sheet keeps it; another piece under the same id (a backup loaded since) doesn\'t', () => {
    const { b, st, r } = start();
    const edited = updateIn(idx, st, caren.id, r.id, { lit: { 'DEF%': 3, CHC: 2, CHD: 2 } }).st;
    expect(edited.pieces[r.id].lit['DEF%']).toBe(3);
    expect(isLive(edited, b.lines[0])).toBe(true);
    expect(sectionsOf(b, edited)[0].lines[0].now.lit['DEF%']).toBe(3); // the list shows the record as it is now
    const other: GearStore = { ...st, pieces: { [r.id]: { ...r.piece, setId: setId('Defense') } } };
    expect(isLive(other, b.lines[0])).toBe(false);
  });
});

describe('superseded promise', () => {
  it('P1 promised, P2 on the same slot: P1 leaves the pool (not kept), the line now promises P2 and carries no «taken off» note', () => {
    // P0 — an Epic worn in the game; P1 replaces it (material — feed); then P2, a weaker piece found by name, on the slot
    const p0 = putOn(ctx, EMPTY_GEAR, caren.id, piece('helmet', 'Speed', { 'DEF%': 1, CHC: 1 }, 'rare'));
    const one = equip(NO_INGAME, p0.st, caren.id, piece('helmet', 'Speed', { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }, 'rare'));
    expect(one.line.off).toBe('feed');
    // without the option the pool would keep the stronger P1 beside a weaker P2 (it stays in the best layout)
    expect(putOn(ctx, one.st, caren.id, WEAK).st.pools[caren.id]).toContain(one.r.id);
    const two = equip(one.b, one.st, caren.id, WEAK);
    expect(two.prev).toEqual(one.line);
    expect(two.r.removed.map((p) => p.id)).toEqual([one.r.id]);
    expect(two.st.pools[caren.id]).toEqual([two.r.id]);
    expect(two.line.off).toBeUndefined();
    expect(two.b.lines).toEqual([two.line]);
    expect(two.b.lines).toHaveLength(1);
  });

  it('a promise of another hero or another slot is not superseded', () => {
    const one = equip(NO_INGAME, EMPTY_GEAR, kappa.id, GOOD);
    const two = equip(one.b, one.st, caren.id, MID);
    const gl = equip(two.b, two.st, caren.id, piece('gloves', 'Speed', { 'DEF%': 2, CHC: 2 }));
    expect(gl.prev).toBeNull();
    expect(gl.r.removed).toEqual([]);
    expect(gl.b.lines.map((l) => l.piece)).toEqual(['p1', 'p2', 'p3']);
  });

  it('the option never drops a record that isn\'t the slot\'s worn one: a reserve, promised or not, is judged as before', () => {
    // Caren wears a weak helmet; a strong one lies in her pool unworn (held: the best layout)
    const worn = putOn(ctx, EMPTY_GEAR, caren.id, WEAK);
    const st: GearStore = { ...worn.st, seq: 2, pieces: { ...worn.st.pieces, p2: { ...worn.piece, id: 'p2', lit: GOOD.subs, yellow: { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 } } }, pools: { [caren.id]: ['p1', 'p2'] } };
    const plain = putOn(ctx, st, caren.id, MID);
    expect(plain.st.pools[caren.id]).toContain('p2');
    for (const promised of [new Set(['p2']), new Set(['p2', 'nope']), new Set<string>()]) {
      const r = putOn(ctx, st, caren.id, MID, { promised });
      expect(r.removed).toEqual(plain.removed);
      expect(r.st).toEqual(plain.st);
    }
    // wearFromPool: the same guard — only the slot's worn record, and only when promised
    expect(wearFromPool(ctx, st, caren.id, 'p2', new Set(['nope']))).toEqual(wearFromPool(ctx, st, caren.id, 'p2'));
    expect(wearFromPool(ctx, st, caren.id, 'p2', new Set(['p1']))!.removed.map((p) => p.id)).toEqual(['p1']);
  });
});

describe('storage', () => {
  const good = () => equip(NO_INGAME, EMPTY_GEAR, caren.id, MID).b;

  it('reads back what it wrote', () => {
    const b = good();
    expect(restoreIngame(JSON.parse(JSON.stringify(b)), idx)).toEqual(b);
  });

  it('a bad value is nothing; a malformed line is dropped, the others stay', () => {
    for (const raw of [null, 7, 'x', [], {}, { v: 2, lines: [] }, { v: 1 }, { v: 1, lines: 'x' }]) expect(restoreIngame(raw, idx)).toEqual(NO_INGAME);
    const line = good().lines[0];
    const bad = [
      null, 5, { ...line, hero: 'nobody' }, { ...line, slot: 'hat' }, { ...line, piece: 7 }, { ...line, id: undefined },
      { ...line, snap: { ...line.snap, id: 'p7' } }, { ...line, snap: { ...line.snap, grade: 'epic' } },
      { ...line, snap: { ...line.snap, lit: { NOPE: 2 } } }, { ...line, snap: { ...line.snap, lit: { CHC: 9 } } },
      { ...line, snap: { ...line.snap, bt: 7 } }, { ...line, snap: null }, { ...line, off: 'sell' },
      { ...line, was: 7 }, { ...line, fed: 'x' }, { ...line, fed: [{ hero: kappa.id, snap: null }] },
    ];
    expect(restoreIngame({ v: 1, lines: [{ ...line, was: 'p0' }] }, idx).lines).toEqual([{ ...line, was: 'p0' }]);
    const other = { ...line, id: 'k', hero: kappa.id };
    const read = restoreIngame({ v: 1, lines: [...bad, other, { ...other, id: 'twice' }] }, idx);
    expect(read.lines).toEqual([other]);
  });
});
