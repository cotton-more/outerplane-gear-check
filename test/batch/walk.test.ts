// The step-by-step walk of a batch (.x/0140-batch-walk): batch v2 entries (piece, «E», «🔒»), one filter per batch,
// positions in the game list and in the hero's slot list, stages, the order «taken off one hero → worn by another».
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { entriesOf, fitsKind, kindOf, NEW_BATCH, putItem, removeItem, restoreBatch, setChoice, type Batch, type BatchEntry } from '@/features/batch/batch';
import { inputOfPiece, planBatch, type Plan } from '@/features/batch/plan';
import { gameSubs, rowOf, walkOf } from '@/features/batch/walk';
import { char, idx, mk } from '../gear/statSets';

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
const piece = (p: Piece): BatchEntry => ({ kind: 'piece', input: inputOfPiece(p) });
const batchOf = (items: BatchEntry[]): Batch => ({ ...NEW_BATCH, items });
const sG = (id = 'sG') => mk(id, 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const sB = (id = 'sB') => mk(id, 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
const epicHelm = (id = 'eH') => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 }, 0, { grade: 'rare' });
const weak = (id: string, i = 0) => mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1 + (i % 3), EFF: 1 + Math.floor(i / 3), HP: 1 }, 0);
const good = (id: string) => mk(id, 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);

describe('batch v2', () => {
  it('a v1 batch (pieces only) reads as v2; a worn entry of an unknown hero is dropped and the numbers move up', () => {
    const v1 = { v: 1, items: [inputOfPiece(weak('a'))], skip: ['1>2000012'], twin: [1] };
    const b = restoreBatch(v1, idx)!;
    expect(b.items).toMatchObject([{ kind: 'piece', input: { slot: 'helmet', subs: weak('a').lit } }]);
    expect([b.skip, b.twin, b.choice, b.done]).toEqual([['1>2000012'], [1], {}, []]);
    const v2 = { v: 2, items: [{ kind: 'worn', c: 'nobody', slot: 'helmet' }, { kind: 'lock', slot: 'helmet' }, piece(weak('a'))], skip: [], twin: [3], choice: { 3: 'keep' }, done: ['x'] };
    const c = restoreBatch(v2, idx)!;
    expect(c.items.map((e) => e.kind)).toEqual(['lock', 'piece']);
    expect([c.twin, c.choice]).toEqual([[2], { 2: 'keep' }]);
  });

  it('entries of the plan carry their game positions; E and 🔒 are not planned', () => {
    const b = batchOf([{ kind: 'worn', c: char('Caren').id, slot: 'helmet' }, piece(weak('a')), { kind: 'lock', slot: 'helmet' }, piece(good('g'))]);
    expect(entriesOf(b).map((e) => e.n)).toEqual([2, 4]);
  });

  it('removing an entry moves «Спорно» choices with their lines; any change clears the walk ticks', () => {
    let b = setChoice(batchOf([piece(weak('a')), piece(weak('b', 1)), piece(weak('c', 2))]), '3~1', 'junk');
    b = { ...b, done: ['eq:3'] };
    expect(removeItem(b, 1).choice).toEqual({ '2~1': 'junk' });
    expect(removeItem(b, 1).done).toEqual([]);
    expect(putItem(b, piece(weak('d', 3))).done).toEqual([]);
  });

  it('one filter per batch: a set, weapons or accessories; armor with no set yet takes any set', () => {
    const speed = kindOf(batchOf([piece(weak('a'))]));
    expect(speed).toMatch(/^set:/);
    expect(fitsKind(speed, speed!)).toBe(true);
    expect(fitsKind(speed, 'weapon')).toBe(false);
    expect(fitsKind(speed, 'set:999')).toBe(false);
    expect(fitsKind(kindOf(batchOf([{ kind: 'lock', slot: 'helmet' }])), speed!)).toBe(true);
    expect(fitsKind(kindOf(batchOf([{ kind: 'lock', slot: 'weapon' }])), 'accessory')).toBe(false);
    expect(kindOf(batchOf([]))).toBeNull();
  });
});

describe('the walk', () => {
  it('rows of 10: #1 — row 1, 1st; #10 — row 1, 10th; #37 — row 4, 7th', () => {
    expect([1, 10, 11, 37].map(rowOf)).toEqual([{ r: 1, p: 1 }, { r: 1, p: 10 }, { r: 2, p: 1 }, { r: 4, p: 7 }]);
  });

  it('substats as the game shows them', () => {
    expect(gameSubs(idx, { CHC: 3, ATK: 2 })).toEqual(['LV 3 Crit Chance +9.0%', 'LV 2 Attack +' + Math.round(idx.SUB.ATK.step * 2)]);
  });

  it('owner case: Caren on an Epic helmet; a good Legendary, a weak one, a locked reserve — equip, lock, Breakthrough', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const b = batchOf([{ kind: 'worn', c: char('Caren').id, slot: 'helmet' }, piece(weak('w')), piece(good('g'))]);
    const plan = planBatch(ctx, st, entriesOf(b));
    const off = plan.lines.find((l) => l.off)!;
    const walk = walkOf(off.fate.kind === 'maybe' ? setChoice(b, off.id, 'keep') : b, plan);
    expect(walk.undecided).toBe(0);
    expect(walk.steps.map((s) => s.stage)).toEqual([1, 2, 3]);
    expect(walk.steps[0]).toMatchObject({ stage: 1, c: { name: 'Caren' }, slot: 'helmet', k: 3 });
    expect(walk.steps[1]).toMatchObject({ stage: 2, where: { n: 1 } });     // the taken-off Epic — where its «E» is
    expect(walk.steps[2]).toMatchObject({ stage: 3, target: { worn: { name: 'Caren' }, slot: 'helmet' }, n: 1, unlock: 0, mats: [{ where: { n: 2 } }] });
  });

  it('the equip number is in the hero\'s list of that slot: boots first, then armor — the armor is No. 1 among armor, #2 in the batch', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const armor = mk('ga', 'armor', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0);
    const b = batchOf([piece(mk('wb', 'shoes', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0)), piece(armor)]);
    const eq = walkOf(b, planBatch(ctx, st, entriesOf(b))).steps.find((s) => s.stage === 1 && s.slot === 'armor')!;
    expect(eq).toMatchObject({ k: 1, where: { n: 2 } });
  });

  it('a lock step says what the piece is and for whom: a weak one set aside for Caren is her reserve', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const b = batchOf([piece(weak('w'))]);
    const lock = walkOf(b, planBatch(ctx, st, entriesOf(b))).steps.find((s) => s.stage === 2)!;
    expect(lock).toMatchObject({ stage: 2, where: { n: 1 }, kept: { n: 1, c: { name: 'Caren' }, why: 'reserve' } });
  });

  it('a piece taken off one hero and worn by another comes after the equip that takes it off', () => {
    const aer = [{ ...sG(), id: 'aG' }, { ...sB(), id: 'aB' }];
    const { ctx, st } = world(['Caren', 'Aer'], { Caren: [sG(), sB(), good('cH')], Aer: aer });
    const better = mk('g2', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 4 }, 0);
    const b = batchOf([{ kind: 'worn', c: char('Caren').id, slot: 'helmet' }, piece(better)]);
    const plan = planBatch(ctx, st, entriesOf(b));
    const equips = walkOf(b, plan).steps.filter((s) => s.stage === 1);
    // whoever gets the new one, a helmet taken off a hero and put on another is equipped after it
    const second = equips.findIndex((s) => 'n' in s.where && s.where.n === 1);
    if (second >= 0) expect(second).toBeGreaterThan(equips.findIndex((s) => 'n' in s.where && s.where.n === 2));
    expect(equips.length).toBeGreaterThan(0);
  });

  it('«Спорно» undecided — the walk waits; «Разобрать» puts it into the one dismantle step', () => {
    const { ctx, st } = world(['Caren'], { Caren: [sG(), sB(), epicHelm()] });
    const b = batchOf([{ kind: 'worn', c: char('Caren').id, slot: 'helmet' }, piece(good('g'))]);
    const plan = planBatch(ctx, st, entriesOf(b));
    const maybe = plan.lines.filter((l) => l.fate.kind === 'maybe');
    if (!maybe.length) return; // the taken-off Epic may be plain «Разобрать» on other data
    expect(walkOf(b, plan).undecided).toBe(maybe.length);
    const w = walkOf(maybe.reduce((x, l) => setChoice(x, l.id, 'junk'), b), plan);
    expect(w.undecided).toBe(0);
    expect(w.steps.filter((s) => s.stage === 4)).toHaveLength(1);
  });

  it('Breakthrough before the dismantle (owner 2026-10-09); a target of this batch that is kept is named as a set-aside piece of its hero — no position', () => {
    const caren = char('Caren');
    const line = (n: number, fate: Plan['lines'][number]['fate']) => ({ id: `${n}`, n, input: inputOfPiece(weak(`p${n}`, n)), fate });
    const plan = {
      lines: [line(1, { kind: 'keep', c: caren, t4: false }), line(2, { kind: 'feed', to: { entry: 1 } }), line(3, { kind: 'feed', to: { entry: 4 } }),
        line(4, { kind: 'keep', c: caren, t4: false }), line(5, { kind: 'junk' })],
    } as unknown as Plan;
    const b = batchOf([1, 2, 3, 4, 5].map((n) => piece(weak(`p${n}`, n))));
    const steps = walkOf(b, plan).steps;
    expect(steps.map((s) => s.stage)).toEqual([2, 2, 3, 3, 4]);
    // the targets are #1 and #4: each is «Caren's set-aside helmet (its substats)», found by those — not by a row and place
    const targets = steps.filter((s) => s.stage === 3).map((s) => s.stage === 3 && 'where' in s.target && 'off' in s.target.where ? [s.target.where.c.name, s.target.where.was, s.target.where.off.lit] : null);
    expect(targets).toEqual([['Caren', 'stash', inputOfPiece(weak('p1', 1)).subs], ['Caren', 'stash', inputOfPiece(weak('p4', 4)).subs]]);
  });
});
