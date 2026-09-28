// Экипировка (logic/gear): вещь с формы — в билд, сегменты после Reforge, Breakthrough, хранение и резервная копия.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import {
  addFourth, buildKey, decodeGear, equipOn, setYellow, EMPTY_GEAR, encodeGear, equip, newerGear, reforgesDone, replaceStat, restoreGear, samePiece, share,
  tapSegment, undoEquip, unequip, updatePiece, usedIn,
} from '../src/logic/gear';
import type { ItemInput } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
const K = buildKey('2000089', 'Speed');
const K2 = buildKey('2000089', 'Speed/Immu');

describe('экипировка: надеть, заменить, снять', () => {
  it('надетая вещь — с жёлтыми сегментами из оценки, Breakthrough не указан', () => {
    const { store, piece, old } = equip(EMPTY_GEAR, K, helmet({ 'DEF%': 2, CHC: 2 }), '2026-09-28');

    expect(old).toBeNull();
    expect(piece).toMatchObject({ yellow: { 'DEF%': 2, CHC: 2 }, lit: { 'DEF%': 2, CHC: 2 }, bt: null, at: '2026-09-28' });
    expect(store.builds[K].slots.helmet).toBe(piece.id);
  });

  it('замена: старая уходит из хранилища, если её больше нигде нет; в другом билде — остаётся', () => {
    const a = equip(EMPTY_GEAR, K, helmet({ CHC: 1 }));
    const shared = share(a.store, K2, 'helmet', a.piece.id);

    const b = equip(shared, K, helmet({ CHD: 2 }));

    expect(b.old?.id).toBe(a.piece.id);
    expect(usedIn(b.store, a.piece.id)).toEqual([K2]);
    expect(Object.keys(equip(a.store, K, helmet({ CHD: 2 })).store.pieces)).toHaveLength(1);
  });

  it('«Вернуть» — только этот слот: старая вещь снова в билде, другие правки за это время остаются', () => {
    const a = equip(EMPTY_GEAR, K, helmet({ CHC: 1 }));
    const other = equip(a.store, K2, { ...helmet({ SPD: 2 }), slot: 'armor' });
    const b = equip(other.store, K, helmet({ CHD: 2 }));        // старая a ушла из хранилища (gc)
    const edited = updatePiece(b.store, other.piece.id, { bt: 3 }); // правка другой вещи после «Надеть»

    const back = undoEquip(edited, K, 'helmet', b.piece, b.old);

    expect(back.builds[K].slots.helmet).toBe(a.piece.id);
    expect(back.pieces[a.piece.id]).toEqual(a.piece);
    expect(back.pieces[b.piece.id]).toBeUndefined();
    expect(back.pieces[other.piece.id].bt).toBe(3);
    // слот успели поменять ещё раз — «Вернуть» его не трогает
    expect(undoEquip(unequip(edited, K, 'helmet'), K, 'helmet', b.piece, b.old).builds[K]).toBeUndefined();
  });

  it('та же вещь во второй билд того же персонажа — одна запись в двух билдах; у другого персонажа — своя', () => {
    const a = equip(EMPTY_GEAR, K, helmet({ CHC: 2, CHD: 1 }));
    const b = equipOn(a.store, '2000089', K2, helmet({ CHC: 2, CHD: 1 }));

    expect(b).toMatchObject({ shared: K, piece: { id: a.piece.id } });
    expect(usedIn(b.store, a.piece.id)).toEqual([K, K2]);
    expect(equipOn(a.store, '2000077', buildKey('2000077', 'Speed'), helmet({ CHC: 2, CHD: 1 })).shared).toBeNull();
    expect(equipOn(a.store, '2000089', K2, helmet({ CHC: 3, CHD: 1 })).shared).toBeNull();
  });

  it('снять последнюю вещь — билда в хранилище больше нет', () => {
    const a = equip(EMPTY_GEAR, K, helmet({ CHC: 1 }));
    expect(unequip(a.store, K, 'helmet')).toMatchObject({ pieces: {}, builds: {} });
  });
});

describe('сегменты и Reforge', () => {
  const base = equip(EMPTY_GEAR, K, helmet({ 'DEF%': 2, CHC: 1 })).piece;

  it('нажатие выше жёлтых добавляет оранжевые, повторное на последней — убирает', () => {
    const p1 = { ...base, ...tapSegment(base, 'DEF%', 4) };
    expect(p1.lit['DEF%']).toBe(4);
    expect({ ...p1, ...tapSegment(p1, 'DEF%', 4) }.lit['DEF%']).toBe(3);
  });

  it('нажатие на жёлтых поправляет их число, оранжевые остаются', () => {
    const p1 = { ...base, ...tapSegment(base, 'DEF%', 4) }; // 2 жёлтых + 2 оранжевых
    expect(tapSegment(p1, 'DEF%', 1)).toMatchObject({ yellow: { 'DEF%': 1 }, lit: { 'DEF%': 3 } });
  });

  it('сделано Reforge — по оранжевым; у Epic с 4-м сабстатом — ещё один (он пришёл первым Reforge)', () => {
    const leg = { ...base, lit: { 'DEF%': 4, CHC: 2 } };
    expect(reforgesDone(leg)).toBe(3);
    const epic = equip(EMPTY_GEAR, K, helmet({ ATK: 1, SPD: 3, 'DMG RED%': 3 }, 'rare')).piece;
    const reforged = { ...epic, ...addFourth(epic, 'DEF%') };
    expect(reforgesDone(reforged)).toBe(1);
    // пример владельца: OGC GLSN HSFP → OGC GQBG WXFQ — 7 жёлтых, после всех Reforge 13 сегментов
    expect(reforgesDone({ ...reforged, lit: { ATK: 3, SPD: 4, 'DMG RED%': 3, 'DEF%': 3 } })).toBe(6);
  });

  it('Transistone сменил стат — сегменты переезжают к новому', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(replaceStat(p1, 'CHC', 'CHD')).toEqual({ yellow: { 'DEF%': 2, CHD: 1 }, lit: { 'DEF%': 4, CHD: 1 } });
  });

  it('жёлтые можно поднять (опечатка при вводе) — оранжевые остаются; горящих не больше 6', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } }; // DEF% 2 жёлтых + 2 оранжевых
    expect(setYellow(p1, 'DEF%', 3)).toMatchObject({ yellow: { 'DEF%': 3 }, lit: { 'DEF%': 5 } });
    expect(setYellow(p1, 'CHC', 3)).toMatchObject({ yellow: { CHC: 3 }, lit: { CHC: 3 } });
    expect(reforgesDone({ ...p1, ...setYellow(p1, 'CHC', 3) })).toBe(2);
  });

  it('Transistone: новый стат со своими жёлтыми, оранжевые старого — с ним', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(setYellow(replaceStat(p1, 'DEF%', 'CHD'), 'CHD', 1)).toEqual({ yellow: { CHD: 1, CHC: 1 }, lit: { CHD: 3, CHC: 1 } });
  });

  it('Transistone на стат, который уже есть на вещи, ничего не меняет: сабстат не пропадает', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(replaceStat(p1, 'DEF%', 'CHC')).toEqual({ yellow: p1.yellow, lit: p1.lit });
  });

  it('Breakthrough и сегменты — одной записью: правка видна во всех билдах', () => {
    const a = equip(EMPTY_GEAR, K, helmet({ CHC: 1 }));
    const st = updatePiece(share(a.store, K2, 'helmet', a.piece.id), a.piece.id, { bt: 4 });
    expect(st.pieces[st.builds[K2].slots.helmet!].bt).toBe(4);
  });
});

describe('та же вещь', () => {
  it('по слоту, грейду, сету, main и жёлтым сегментам', () => {
    const p = equip(EMPTY_GEAR, K, helmet({ CHC: 2, CHD: 1 })).piece;
    expect(samePiece(helmet({ CHC: 2, CHD: 1 }), p)).toBe(true);
    expect(samePiece(helmet({ CHC: 2, CHD: 2 }), p)).toBe(false);
    expect(samePiece(helmet({ CHC: 2, CHD: 1 }, 'rare'), p)).toBe(false);
  });
});

describe('хранилище и резервная копия', () => {
  it('восстановление отбрасывает непонятное и держит сегменты в рамках: жёлтых 1…4, горит до 6', () => {
    const raw = {
      v: 1, seq: 3,
      pieces: {
        p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, yellow: { CHC: 9, BOGUS: 1 }, lit: { CHC: 12 }, bt: 7, at: 'x' },
        p2: { id: 'p2', slot: 'nope', grade: 'unique', yellow: {} },
      },
      builds: { [K]: { slots: { helmet: 'p1', armor: 'p1', gloves: 'p9' }, at: '' } },
    };
    const st = restoreGear(raw, idx);
    expect(Object.keys(st.pieces)).toEqual(['p1']);
    expect(st.pieces.p1).toMatchObject({ yellow: { CHC: 4 }, lit: { CHC: 6 }, bt: null });
    expect(st.builds[K].slots).toEqual({ helmet: 'p1' });
  });

  it('незнакомая версия — пусто и «новее»; мусор — пусто', () => {
    const v2 = { v: 2, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, yellow: { CHC: 2 }, lit: { CHC: 2 } } }, builds: { [K]: { slots: { helmet: 'p1' } } } };
    expect(restoreGear(v2, idx)).toEqual(EMPTY_GEAR);
    expect(newerGear(v2)).toBe(true);
    expect(newerGear({ v: 1 })).toBe(false);
    expect(restoreGear('x', idx)).toEqual(EMPTY_GEAR);
  });

  it('незнакомые поля следующей версии (v: 1) переживают чтение, «Надеть» и резервную копию', () => {
    const raw = { v: 1, seq: 1, note: 'x', pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: 1, at: '', enh: 15 } }, builds: { [K]: { slots: { helmet: 'p1' }, at: '', tryon: true } } };
    const st = equip(restoreGear(raw, idx), K2, helmet({ SPD: 1 })).store;
    const back = decodeGear(encodeGear(st), idx)!;

    expect(back).toMatchObject({ note: 'x', pieces: { p1: { enh: 15 } }, builds: { [K]: { tryon: true } } });
  });

  it('не число в сегментах — стат с жёлтыми как есть, без NaN', () => {
    const raw = { v: 1, seq: 1, pieces: { p1: { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, yellow: { CHC: 2, SPD: 'x' }, lit: { CHC: 'y' }, bt: null, at: '' } }, builds: { [K]: { slots: { helmet: 'p1' } } } };
    expect(restoreGear(raw, idx).pieces.p1).toMatchObject({ yellow: { CHC: 2 }, lit: { CHC: 2 } });
  });

  it('код копии читается обратно; чужой текст — нет', () => {
    const { store } = equip(EMPTY_GEAR, K, helmet({ 'DEF%': 2, CHC: 2 }));
    const code = encodeGear(store);

    expect(code.startsWith('OGC-GEAR1 ')).toBe(true);
    expect(decodeGear(code, idx)).toEqual(store);
    expect(decodeGear('OGC-GEAR1 !!!', idx)).toBeNull();
    expect(decodeGear('SPD, CHC', idx)).toBeNull();
  });
});
