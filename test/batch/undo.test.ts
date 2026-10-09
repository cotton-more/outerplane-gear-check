// The undo of ✕ in the list (.x/0165-merge-fixes TEXTS.md §8): the entry comes back at its place with its marks
// («Не брать», «Это другой», «Спорно»); later entries and their marks move down again.
import { describe, expect, it } from 'vitest';
import { NEW_BATCH, removeItem, removedOf, restoreItem, type Batch, type BatchEntry } from '@/features/batch/batch';
import { inputOfPiece } from '@/features/batch/plan';
import { mk } from '../gear/statSets';

const piece = (id: string, i: number): BatchEntry => ({ kind: 'piece', input: inputOfPiece(mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1 + (i % 3), EFF: 1 + Math.floor(i / 3), HP: 1 }, 0)) });
const items: BatchEntry[] = [piece('a', 0), piece('b', 1), { kind: 'lock', slot: 'helmet' }, piece('c', 2), piece('d', 3)];
// marks on #2 (its own and its taken-off line «2~1»), on #4, and a hero-less «Спорно» on #5
const marked: Batch = { ...NEW_BATCH, items, skip: ['2>10', '2~1>11', '4>12'], twin: [2, 5], choice: { '2~1': 'junk', '4': 'keep', '5': 'junk' }, done: [] };

// the order of the marks is the order they were made in — not part of the batch's meaning
const norm = (b: Batch): Batch => ({ ...b, skip: [...b.skip].sort(), twin: [...b.twin].sort((a, z) => a - z) });

describe('✕ and «Вернуть»', () => {
  it.each([1, 2, 3, 4, 5])('removing #%i and undoing gives the same batch', (n) => {
    const gone = removedOf(marked, n)!;
    const without = removeItem(marked, n);
    expect(without.items).toHaveLength(4);
    expect(norm(restoreItem(without, gone))).toEqual(norm(marked));
  });
  it('the marks of the removed entry are gone while it is out; the later ones moved up', () => {
    const without = removeItem(marked, 2);
    expect(without).toMatchObject({ skip: ['3>12'], twin: [4], choice: { '3': 'keep', '4': 'junk' } });
  });
  it('an entry added in between does not matter: the removed one returns to its own place', () => {
    const gone = removedOf(marked, 2)!;
    const grown = { ...removeItem(marked, 2), items: [...removeItem(marked, 2).items, piece('e', 4)] };
    const back = restoreItem(grown, gone);
    expect(back.items.map((e) => (e.kind === 'piece' ? 'p' : 'l'))).toEqual(['p', 'p', 'l', 'p', 'p', 'p']);
    expect(back.items[1]).toBe(items[1]);
    expect(back).toMatchObject({ skip: expect.arrayContaining(['2>10', '2~1>11', '4>12']), twin: expect.arrayContaining([2, 5]) });
  });
  it('the walk\'s ticks are cleared by a restore, as by any change', () => {
    const gone = removedOf(marked, 3)!;
    expect(restoreItem({ ...removeItem(marked, 3), done: ['eq:1'] }, gone).done).toEqual([]);
  });
  it('nothing to remove — nothing to undo', () => {
    expect(removedOf(marked, 9)).toBeNull();
  });
});
