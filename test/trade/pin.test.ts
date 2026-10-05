// «Обмен вещами», этап 4: отметка героя «Не отдавать надетое» в хранилище вещей (.x/0040-trade/TESTS.md, A3–A7, A9).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { dropChar, isPinned, pinnedOf, setPinned, undoDrop, type GearStore, type Piece } from '@/features/gear/model/gear';
import { normalizeFusion, switchFusion } from '@/features/gear/model/fusion';
import { decodeGear, encodeGear, restoreGear, unfuseChar } from '@/features/gear/store/gearStore';
import { removeFrom, removeUndo } from '@/features/gear/pool';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const id = (name: string) => D.chars.find((c) => c.name === name)!.id;
const [X, CF, CAREN, KAPPA] = [id('Eternal'), id('Core Fusion Eternal'), id('Caren'), id('Kappa')];
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const P = (pid: string, slot: Piece['slot'] = 'helmet'): Piece =>
  ({ id: pid, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { SPD: 1 }, lit: { SPD: 1 }, bt: null, at: '' });
const v2 = (pools: Record<string, string[]>, extra: Partial<GearStore> = {}): GearStore => {
  const ids = [...new Set(Object.values(pools).flat())];
  return { v: 2, seq: ids.length, pieces: Object.fromEntries(ids.map((pid) => [pid, P(pid)])), pools, ...extra };
};
const reload = (st: GearStore): GearStore => restoreGear(JSON.parse(JSON.stringify(st)), idx);

describe('A3: закрепить, повторить, снять', () => {
  it('A3: отметка видна после перезапуска', () => {
    const st = setPinned(v2({ [CAREN]: ['p1'] }), CAREN, true);
    expect(isPinned(reload(st), CAREN)).toBe(true);
  });
  it('A3: повторная отметка возвращает то же хранилище', () => {
    const st = setPinned(v2({ [CAREN]: ['p1'] }), CAREN, true);
    expect(setPinned(st, CAREN, true)).toBe(st);
  });
  it('A3: снять — не закреплён', () => {
    const st = setPinned(v2({ [CAREN]: ['p1'] }), CAREN, true);
    expect(isPinned(setPinned(st, CAREN, false), CAREN)).toBe(false);
  });
});

describe('A4: код копии и испорченная отметка', () => {
  it('A4: encodeGear → decodeGear — отметка на месте', () => {
    const st = setPinned(v2({ [CAREN]: ['p1'], [KAPPA]: ['p2'] }), KAPPA, true);
    const back = decodeGear(encodeGear(st), idx) as GearStore;
    expect(pinnedOf(back, [CAREN, KAPPA])).toEqual([KAPPA]);
  });
  it('A4: pinned не массив — отметок нет, пулы и вещи прочитаны', () => {
    const raw = { ...v2({ [CAREN]: ['p1'] }), pinned: 'x' };
    const st = restoreGear(raw, idx);
    expect(pinnedOf(st, [CAREN])).toEqual([]);
    expect(st.pools).toEqual({ [CAREN]: ['p1'] });
    expect(Object.keys(st.pieces)).toEqual(['p1']);
  });
  it('A4: не строки, повторы и герои без пула отброшены', () => {
    const raw = { ...v2({ [CAREN]: ['p1'] }), pinned: [CAREN, 5, CAREN, 'нет-пула'] };
    expect(restoreGear(raw, idx).pinned).toEqual([CAREN]);
  });
});

describe('A5: у закреплённого не осталось вещей, Core Fusion', () => {
  const pinned = () => setPinned(v2({ [CAREN]: ['p1', 'p2'], [KAPPA]: ['p3'] }), CAREN, true);
  it('A5: удалили все вещи — отметки нет и поля нет', () => {
    const st = removeFrom(removeFrom(pinned(), CAREN, 'p1'), CAREN, 'p2');
    expect(isPinned(st, CAREN)).toBe(false);
    expect('pinned' in st).toBe(false);
  });
  it('A5: removeUndo — снова закреплён', () => {
    const st = pinned();
    const undo1 = removeUndo(st, CAREN, st.pieces.p1);
    const s1 = removeFrom(st, CAREN, 'p1');
    const undo2 = removeUndo(s1, CAREN, s1.pieces.p2);
    const s2 = removeFrom(s1, CAREN, 'p2');
    expect(isPinned(s2, CAREN)).toBe(false);
    expect(isPinned(undo2(s2), CAREN)).toBe(true);
    expect(isPinned(undo1(undo2(s2)), CAREN)).toBe(true);
  });
  it('A5: dropChar → undoDrop — закреплён', () => {
    const { st, dropped } = dropChar(pinned(), CAREN);
    expect(isPinned(st, CAREN)).toBe(false);
    expect(isPinned(undoDrop(st, dropped), CAREN)).toBe(true);
  });
  it('A5: закреплённый X в Core Fusion — закреплён CF, X нет; обратно — X снова', () => {
    const st = setPinned(v2({ [X]: ['p1'] }), X, true);
    const sw = switchFusion(idx, [CAREN, X], st, CF)!;
    expect(isPinned(sw.st, CF)).toBe(true);
    expect(isPinned(sw.st, X)).toBe(false);
    const back = unfuseChar(sw.st, X, CF, sw);
    expect(isPinned(back, X)).toBe(true);
  });
  it('A5: у CF свои вещи, закреплён только X — после перехода CF закреплён, после «Вернуть» снова нет', () => {
    const st = setPinned(v2({ [X]: ['p1'], [CF]: ['p2'] }), X, true);
    const sw = switchFusion(idx, [CAREN, X], st, CF)!;
    expect(isPinned(sw.st, CF)).toBe(true);
    const back = unfuseChar(sw.st, X, CF, sw);
    expect(isPinned(back, X)).toBe(true);
    expect(isPinned(back, CF)).toBe(false);
  });
});

describe('A6: список закреплённых', () => {
  it('A6: в порядке ростера, снятие убирает из списка', () => {
    let st = v2({ [CAREN]: ['p1'], [KAPPA]: ['p2'], [X]: ['p3'] });
    st = setPinned(setPinned(st, X, true), CAREN, true);
    expect(pinnedOf(st, [KAPPA, CAREN, X])).toEqual([CAREN, X]);
    expect(pinnedOf(setPinned(st, CAREN, false), [KAPPA, CAREN, X])).toEqual([X]);
  });
});

describe('A7: слияние пулов X и Core Fusion X', () => {
  const merged = (pinX: boolean, pinCF: boolean, pools: Record<string, string[]>) => {
    let st = v2(pools);
    if (pinX) st = setPinned(st, X, true);
    if (pinCF) st = setPinned(st, CF, true);
    return normalizeFusion(idx, [CF], st).st;
  };
  const both = { [X]: ['p1'], [CF]: ['p2'] };
  it('A7: закреплён только X — CF закреплён', () => expect(isPinned(merged(true, false, both), CF)).toBe(true));
  it('A7: закреплён только CF — закреплён', () => expect(isPinned(merged(false, true, both), CF)).toBe(true));
  it('A7: закреплены оба — закреплён', () => expect(isPinned(merged(true, true, both), CF)).toBe(true));
  it('A7: не закреплён никто — не закреплён', () => expect(isPinned(merged(false, false, both), CF)).toBe(false));
  it('A7: вещи только у X (moved), X закреплён — CF закреплён, X нет', () => {
    const st = merged(true, false, { [X]: ['p1'] });
    expect(isPinned(st, CF)).toBe(true);
    expect(isPinned(st, X)).toBe(false);
  });
});

describe('A9: герой без вещей', () => {
  it('A9: setPinned на героя без пула — то же хранилище, не закреплён', () => {
    const st = v2({ [CAREN]: ['p1'] });
    const next = setPinned(st, KAPPA, true);
    expect(next).toBe(st);
    expect(isPinned(next, KAPPA)).toBe(false);
  });
});
