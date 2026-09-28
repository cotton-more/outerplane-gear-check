// Экипировка (logic/gear): вещь с формы — в билд, сегменты после Reforge, Breakthrough, хранение и резервная копия.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import {
  addFourth, buildKey, decodeGear, EMPTY_GEAR, encodeGear, equip, reforgesDone, replaceStat, restoreGear, samePiece, share,
  tapSegment, unequip, updatePiece, usedIn,
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

  it('незнакомая версия — пусто; мусор — пусто', () => {
    expect(restoreGear({ v: 2, pieces: {} }, idx)).toEqual(EMPTY_GEAR);
    expect(restoreGear('x', idx)).toEqual(EMPTY_GEAR);
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
