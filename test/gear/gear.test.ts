// Экипировка (features/gear/model/gear, features/gear/store/gearStore, операции features/gear/pool): вещи у персонажа (хранилище v3), перенос v1 → v3,
// сегменты после Reforge, Breakthrough, резервная копия, «Надеть», «Убрать» и «Вернуть».
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { dropChar, EMPTY_GEAR, fixPins, gc, gearedChars, holdersOf, isWorn, newPiece, setPin, stalePins, undoDrop, undoPin, updateIn, updatePiece, type GearStore, type Piece } from '@/features/gear/model/gear';
import { buildKey } from '@/game/build/variants';
import { normalizeFusion, switchFusion } from '@/features/gear/model/fusion';
import { decodeGear, encodeGear, loadGear, newerGear, readsWhole, restoreGear, unfuseChar } from '@/features/gear/store/gearStore';
import { planFor, planPut, poolView, putOn, stashOn, removeFrom, removeUndo, undoPut, undoRemove, undoWear, undoWearAll, wearAll, wearFromPool } from '@/features/gear/pool';
import type { ItemInput } from '@/game/item/item';
import { pinOptions, profileOf } from '@/game/build/profile';
import { poolInfo } from '@/features/gear/pool/info';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const speed = set('Speed');
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
const CAREN = '2000089', KAPPA = '2000077';
const K = buildKey(CAREN, 'Speed');
const K2 = buildKey(CAREN, 'Speed/Immu');
const rec = (id: string, x: ItemInput, bt: Piece['bt'] = null, lit = x.subs): Piece =>
  ({ id, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main, yellow: x.subs, lit, bt, at: '' });
const v1 = (pieces: Piece[], builds: Record<string, Record<string, string>>, extra: Record<string, unknown> = {}) => ({
  v: 1, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])),
  builds: Object.fromEntries(Object.entries(builds).map(([k, slots]) => [k, { slots, at: '' }])), ...extra,
});
const v2 = (pieces: Piece[], pools: Record<string, string[]>, extra: Partial<GearStore> = {}): GearStore =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...extra });

describe('перенос v1 → v3 (design-final §F, stat-sets PLAN Д11)', () => {
  it('1. одна запись в нескольких билдах персонажа — один id в его пуле; «Собираю» и билды v1 не хранятся', () => {
    const p1 = rec('p1', helmet({ CHC: 2 }));
    const st = restoreGear(v1([p1], { [K]: { helmet: 'p1' }, [K2]: { helmet: 'p1' } }), idx);
    expect(st).toEqual({ v: 3, seq: 1, pieces: { p1 }, pools: { [CAREN]: ['p1'] } });
  });

  it('2. запись у двух персонажей — в оба пула, без копии', () => {
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 2 }))], { [K]: { helmet: 'p1' }, [buildKey(KAPPA, 'Speed')]: { helmet: 'p1' } }), idx);
    expect(st.pools).toEqual({ [CAREN]: ['p1'], [KAPPA]: ['p1'] });
    expect(Object.keys(st.pieces)).toEqual(['p1']);
  });

  it('3a / 3b. одинаковые вещи — две записи у двух персонажей и у одного: не сливаются', () => {
    const a = rec('p1', helmet({ CHC: 2 })), b = rec('p2', helmet({ CHC: 2 }));
    expect(restoreGear(v1([a, b], { [K]: { helmet: 'p1' }, [buildKey(KAPPA, 'Speed')]: { helmet: 'p2' } }), idx).pools)
      .toEqual({ [CAREN]: ['p1'], [KAPPA]: ['p2'] });
    expect(restoreGear(v1([a, b], { [K]: { helmet: 'p1' }, [K2]: { helmet: 'p2' } }), idx).pools).toEqual({ [CAREN]: ['p1', 'p2'] });
  });

  it('4. билд, которого нет в данных (переименовали), — вещи в пул', () => {
    const old = buildKey(CAREN, 'Speed (old)');
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 2 }))], { [old]: { helmet: 'p1' } }), idx);
    expect(st.pools).toEqual({ [CAREN]: ['p1'] });
    expect(st.v1builds).toBeUndefined();
  });

  it('5. незнакомые персонажи и сеты — пулы хранятся (страница их не покажет)', () => {
    const st = restoreGear(v1([rec('p1', { ...helmet({ CHC: 1 }), setId: 'nope' })], { '9999999/X': { helmet: 'p1' } }), idx);
    expect(st.pools).toEqual({ '9999999': ['p1'] });
    expect(st.pieces.p1.setId).toBe('nope');
  });

  it('6. слот не тот — вещь выпадает из билда, как в v1; ни в одном билде — из хранилища', () => {
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 1 }))], { [K]: { armor: 'p1' } }), idx);
    expect(st).toMatchObject({ pieces: {}, pools: {} });
  });

  it('проверка v1 без изменений: сегменты в рамках, до 4 сабстатов, мусор отброшен, seq — не меньше номеров', () => {
    const raw = {
      v: 1, seq: 1,
      pieces: {
        p7: { id: 'p7', slot: 'helmet', grade: 'unique', setId: speed, yellow: { CHC: 9, BOGUS: 1, CHD: 1, SPD: 1, 'DEF%': 1, 'ATK%': 1 }, lit: { CHC: 12, CHD: 'y' }, bt: 7, at: 'x' },
        p2: { id: 'p2', slot: 'nope', grade: 'unique', yellow: {} },
      },
      builds: { [K]: { slots: { helmet: 'p7', gloves: 'p9' }, at: '' } },
    };
    const st = restoreGear(raw, idx);
    expect(Object.keys(st.pieces)).toEqual(['p7']);
    expect(st.pieces.p7).toMatchObject({ yellow: { CHC: 4, CHD: 1, SPD: 1, 'DEF%': 1 }, lit: { CHC: 6, CHD: 1 }, bt: null });
    expect(st.seq).toBe(7);
  });

  it('незнакомые поля хранилища и вещи переживают перенос, «Надеть» и код копии; поля прежней модели — нет', () => {
    const raw = { ...v1([rec('p1', helmet({ CHC: 2 }), 1)], { [K]: { helmet: 'p1' } }, { note: 'x', marks: { [K]: 'want' }, aim: { [CAREN]: K } }), builds: { [K]: { slots: { helmet: 'p1' }, at: '', tryon: true } } };
    (raw.pieces.p1 as unknown as Record<string, unknown>).enh = 15;
    const st = putOn(ctx, restoreGear(raw, idx), CAREN, { ...helmet({ SPD: 1 }), slot: 'armor' }).st;
    const back = decodeGear(encodeGear(st), idx) as GearStore;
    expect(back).toMatchObject({ note: 'x', pieces: { p1: { enh: 15 } } });
    expect([back.v1builds, back.marks, back.aim]).toEqual([undefined, undefined, undefined]);
  });

  it('ни одна вещь не теряется: каждая вещь v1 — в каком-то пуле', () => {
    const pieces = [rec('p1', helmet({ CHC: 1 })), rec('p2', { ...helmet({ SPD: 1 }), slot: 'armor' }), rec('p3', { ...helmet({ CHD: 1 }), slot: 'gloves' })];
    const st = restoreGear(v1(pieces, { [K]: { helmet: 'p1', armor: 'p2' }, [buildKey(KAPPA, 'Speed')]: { gloves: 'p3', helmet: 'p1' } }), idx);
    expect(Object.keys(st.pieces).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(new Set(Object.values(st.pools).flat())).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  // правило владельца 2026-09-30 (было: вещи X сливались к Core Fusion X): у Core Fusion свои вещи — вещи X убраны
  it('Core Fusion: вещи у X и у Core Fusion X — у Core Fusion его вещи, вещи X убраны (features/gear/model/fusion)', () => {
    const [eternal, cf] = ['Eternal', 'Core Fusion Eternal'].map((n) => D.chars.find((c) => c.name === n)!);
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 1 })), rec('p2', helmet({ CHD: 1 }))], { [`${eternal.id}/Speed`]: { helmet: 'p1' }, [`${cf.id}/Speed`]: { helmet: 'p2' } }), idx);
    expect(st.pools).toEqual({ [cf.id]: ['p2'] });
  });
});

describe('хранилище v3 и код копии', () => {
  it('v3: id без вещей и повторы выброшены, пустые пулы убраны; незнакомые поля — как есть', () => {
    const raw = { ...v2([rec('p1', helmet({ CHC: 1 }))], { [CAREN]: ['p1', 'p1', 'p9'], [KAPPA]: ['p9'], x: 'no' as never }), extra: 1 };
    expect(restoreGear(raw, idx)).toEqual({ v: 3, seq: 1, pieces: raw.pieces, pools: { [CAREN]: ['p1'] }, extra: 1 });
  });

  it('gc: вещь, которой нет ни в одном пуле, стирается', () => {
    const st = gc(v2([rec('p1', helmet({ CHC: 1 })), rec('p2', helmet({ CHD: 1 }))], { [CAREN]: ['p1'] }));
    expect(Object.keys(st.pieces)).toEqual(['p1']);
  });

  it('v: 4 — «новее» и пусто; v: 1, v: 2 и v: 3 — не новее; мусор — пусто', () => {
    expect(newerGear({ v: 4 })).toBe(true);
    expect([1, 2, 3].map((v) => newerGear({ v }))).toEqual([false, false, false]);
    expect(restoreGear({ v: 4, pieces: {}, pools: {} }, idx)).toEqual(EMPTY_GEAR);
    expect(restoreGear('x', idx)).toEqual(EMPTY_GEAR);
  });

  it('код: OGC-GEAR2 туда и обратно; OGC-GEAR1 — переносится; OGC-GEAR3 и внутри v: 4 — «новее»; пустой и чужой — нет', () => {
    const st = v2([rec('p1', helmet({ CHC: 2 }))], { [CAREN]: ['p1'] });
    const code = encodeGear(st);
    expect(code.startsWith('OGC-GEAR2 ')).toBe(true);
    expect(decodeGear(code, idx)).toEqual(st);
    const b64 = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeGear('OGC-GEAR1 ' + b64(v1([rec('p1', helmet({ CHC: 2 }))], { [K]: { helmet: 'p1' } })), idx)).toMatchObject({ v: 3, pools: { [CAREN]: ['p1'] } });
    expect(decodeGear('OGC-GEAR3 ' + b64({ v: 3 }), idx)).toBe('newer');
    expect(decodeGear('OGC-GEAR2 ' + b64({ v: 4, pieces: {}, pools: {} }), idx)).toBe('newer');
    expect(decodeGear(encodeGear(EMPTY_GEAR), idx)).toBeNull(); // пустая копия не затирает записи
    expect(decodeGear('OGC-GEAR2 !!!', idx)).toBeNull();
    expect(decodeGear('SPD, CHC', idx)).toBeNull();
  });

  // находка 23: самодельные и испорченные коды
  it('ключ билда v1 без «/» — весь ключ персонаж (не обрезан на последнюю цифру)', () => {
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 1 }))], { [CAREN]: { helmet: 'p1' } }), idx);
    expect(st.pools).toEqual({ [CAREN]: ['p1'] });
  });

  it('seq — только конечные числа: id «pInfinity» и seq: Infinity не дают новой вещи затереть старую', () => {
    const p = rec('pInfinity', helmet({ CHC: 1 })), q = rec('p7', helmet({ CHD: 1 }));
    const st = restoreGear({ ...v2([p, q], { [CAREN]: ['pInfinity', 'p7'] }), seq: Infinity }, idx);
    expect(st.seq).toBe(7);
    const { st: next, piece } = newPiece(st, helmet({ SPD: 1 }));
    expect(piece.id).toBe('p8');
    expect(next.pieces.pInfinity).toEqual(p);
  });

  it('seq — только целые до 2^53: при seq: 1e16 и id «p9007199254740993» две новые вещи получают разные id', () => {
    const p = rec('p9007199254740993', helmet({ CHC: 1 })), q = rec('p7', helmet({ CHD: 1 }));
    const st = restoreGear({ ...v2([p, q], { [CAREN]: ['p9007199254740993', 'p7'] }), seq: 1e16 }, idx);
    const a = newPiece(st, helmet({ SPD: 1 }));
    const b = newPiece(a.st, helmet({ SPD: 2 }));
    expect([a.piece.id, b.piece.id]).toEqual(['p8', 'p9']);
    expect(b.st.pieces.p9007199254740993).toEqual(p);
  });

  it('пул не массивом: строка — одна вещь, объект — его значения, прочее — пусто; вещи из других пулов остаются', () => {
    const a = rec('p1', helmet({ CHC: 1 })), b = rec('p2', helmet({ CHD: 1 })), c = rec('p3', helmet({ SPD: 1 }));
    const raw = v2([a, b, c], { [CAREN]: 'p1' as never, [KAPPA]: { helmet: 'p2' } as never, x: 5 as never, y: ['p3'] });
    const st = restoreGear(raw, idx);
    expect(st.pools).toEqual({ [CAREN]: ['p1'], [KAPPA]: ['p2'], y: ['p3'] });
    expect(Object.keys(st.pieces)).toEqual(['p1', 'p2', 'p3']);
  });

  it('OGC-GEAR1 без пробела после префикса — читается, как до v2 (b02e947)', () => {
    const b64 = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const raw = v1([rec('p1', helmet({ CHC: 2 }))], { [K]: { helmet: 'p1' } });
    expect(decodeGear('OGC-GEAR1' + b64(raw), idx)).toMatchObject({ pools: { [CAREN]: ['p1'] } });
    expect(decodeGear('OGC-GEAR2' + encodeGear(v2([rec('p1', helmet({ CHC: 2 }))], { [CAREN]: ['p1'] })).slice('OGC-GEAR2 '.length), idx))
      .toMatchObject({ pools: { [CAREN]: ['p1'] } });
  });

  it('gearedChars — по пулам', () => {
    expect([...gearedChars(v2([rec('p1', helmet({ CHC: 1 }))], { [CAREN]: ['p1'] }))]).toEqual([[CAREN, 1]]);
  });
});

describe('«Надеть», «Убрать», отметки и «Вернуть»', () => {
  const four = (): GearStore => {
    // Speed ×4 надет: слабые вещи пул держит, пока они надеты
    const ps = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => rec('p' + (i + 1), { ...helmet({ RES: 1 }), slot: slot as Piece['slot'] }));
    return v2(ps, { [CAREN]: ps.map((p) => p.id) }, { worn: { [CAREN]: Object.fromEntries(ps.map((p) => [p.slot, p.id])) } });
  };

  it('новая запись: жёлтые из оценки, Breakthrough не указан, seq + 1; такая же уже есть — всё равно новая', () => {
    const r = putOn(ctx, EMPTY_GEAR, CAREN, helmet({ 'DEF%': 2, CHC: 2 }), { at: '2026-09-28' });
    expect(r).toMatchObject({ id: 'p1', removed: [], piece: { yellow: { 'DEF%': 2, CHC: 2 }, lit: { 'DEF%': 2, CHC: 2 }, bt: null, at: '2026-09-28' } });
    expect(r.st).toMatchObject({ seq: 1, pools: { [CAREN]: ['p1'] } });
    // в Оценку вводят новую вещь из инвентаря (решение владельца 2026-10-01): «Уже есть» нет
    expect(putOn(ctx, r.st, CAREN, helmet({ 'DEF%': 2, CHC: 2 }))).toMatchObject({ id: 'p2' });
  });

  it('«Заменить»: вытесненная из всех сборок уходит из пула; «Вернуть» — как было (запись снова есть)', () => {
    const st = four();
    const r = putOn(ctx, st, CAREN, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }));
    expect(r.removed.map((p) => p.id)).toEqual(['p1']);
    expect(r.st.pools[CAREN]).toEqual(['p2', 'p3', 'p4', 'p5']);
    expect(r.st.pieces.p1).toBeUndefined();
    const back = undoPut(r.st, CAREN, r);
    expect(back.pools[CAREN].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(back.pieces.p1).toEqual(st.pieces.p1);
  });

  it('«Вернуть» — только это: правка другой вещи остаётся; вещь уже убрали — ничего', () => {
    const r = putOn(ctx, four(), CAREN, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }));
    const edited = updatePiece(r.st, 'p2', { bt: 3 });
    expect(undoPut(edited, CAREN, r).pieces.p2.bt).toBe(3);
    const gone = removeFrom(edited, CAREN, r.id);
    expect(undoPut(gone, CAREN, r)).toBe(gone);
  });

  // шаг 10 (В9): было — «Она же — и у Kappa» (putOn record: та же запись в двух пулах). Пулы независимы: «Надеть» такой
  // же вещи, как у другого, — всегда своя запись; правка у одного другого не трогает
  it('такая же вещь, как у Kappa, — у Caren своя запись; Breakthrough у Kappa — только у неё', () => {
    const a = putOn(ctx, EMPTY_GEAR, KAPPA, helmet({ CHC: 2 }));
    const b = putOn(ctx, a.st, CAREN, helmet({ CHC: 2 }));
    expect({ id: b.id, seq: b.st.seq, kappa: b.st.pools[KAPPA], caren: b.st.pools[CAREN] }).toEqual({ id: 'p2', seq: 2, kappa: ['p1'], caren: ['p2'] });
    expect(updatePiece(b.st, a.id, { bt: 4 }).pieces[b.id].bt).toBe(null);
  });




  // шаг 10: «Разобрал — убрать у всех» (removeEverywhere) ушло вместе с общими записями (В9)
  it('«Убрать у Caren» — только у неё (старая общая запись у Kappa остаётся); «Вернуть» — обратно', () => {
    const st = v2([rec('p1', helmet({ CHC: 2 }))], { [CAREN]: ['p1'], [KAPPA]: ['p1'] });
    const gone = removeFrom(st, CAREN, 'p1');
    expect(gone.pools).toEqual({ [KAPPA]: ['p1'] });
    const solo = removeFrom(gone, KAPPA, 'p1');
    expect(solo).toMatchObject({ pools: {}, pieces: {} });
    expect(undoRemove(solo, st.pieces.p1, [CAREN, KAPPA])).toMatchObject({ pools: { [CAREN]: ['p1'], [KAPPA]: ['p1'] }, pieces: { p1: st.pieces.p1 } });
  });
});

describe('«Надеть»: что уходит из пула (В1, PLAN Д7)', () => {
  // «Надеть» убирает то, что пул держал (features/gear/pool/info: надетое, раскладка, лучшие сета, запас), а с новой
  // надетой — нет. Ставшее ненужным раньше остаётся: на карточке «больше не нужна» и «Убрать у Caren»
  const JUNK = { RES: 1, EFF: 1, HP: 1, ATK: 1 }, STRONG = { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 };
  const A = (slot: Piece['slot'], s: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs });
  const pool = (ps: Piece[], who = CAREN) => v2(ps, { [who]: ps.map((p) => p.id) });
  const helmets = () => [rec('p1', A('helmet', 'Speed', JUNK)), rec('p2', A('helmet', 'Attack', STRONG)), rec('p3', A('armor', 'Speed', JUNK)), rec('p4', A('gloves', 'Speed', JUNK))];
  const SHOES = A('shoes', 'Speed', { CHC: 3, CHD: 2, 'DEF%': 1, HP: 1 });

  it('надетый Defense-шлем, который новый лучший Defense-шлем сменил, уходит; «Вернуть» — как было', () => {
    const ps = [rec('p1', A('helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 })), rec('p2', A('armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }))];
    const st = { ...pool(ps), worn: { [CAREN]: { helmet: 'p1', armor: 'p2' } } };
    const r = putOn(ctx, st, CAREN, A('helmet', 'Defense', { 'DEF%': 4, CHC: 2, CHD: 4, SPD: 1 }));
    expect(r.removed.map((p) => p.id)).toEqual(['p1']);
    expect(r.st.pools[CAREN]).toEqual(['p2', 'p3']);
    expect({ ...undoPut(r.st, CAREN, r), seq: st.seq }).toEqual(st);
  });

  it('ненужная до «Надеть» остаётся: «Надеть» убирает только то, что пул держал', () => {
    const ps = [rec('p1', A('helmet', 'Speed', JUNK)), rec('p2', A('helmet', 'Speed', STRONG))];
    expect(poolView(ctx, pool(ps)).of(CAREN)!.unused.map((p) => p.id)).toEqual(['p1']);
    const r = putOn(ctx, pool(ps), CAREN, A('gloves', 'Speed', { CHC: 3, CHD: 2 }));
    expect(r.removed).toEqual([]);
    expect(poolView(ctx, r.st).of(CAREN)!.unused.map((p) => p.id)).toEqual(['p1']);
  });

  it('свойство: уходит только то, что пул держал до и не держит после; новая и надетые других слотов — никогда', () => {
    const caren = idx.CHAR[CAREN];
    const P = profileOf(ctx, caren)!;
    const sets = ['Speed', 'Defense', 'Immunity', 'Attack', 'Life'];
    const subsets = [JUNK, STRONG, { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { CHC: 2, HP: 1, EFF: 1, RES: 1 }];
    let n = 0;
    for (let i = 0; i < 120; i++) {
      const ps = (['helmet', 'armor', 'gloves', 'shoes'] as const).flatMap((sl, k) => [0, 1].filter((j) => (i + k + j) % 3 !== 0)
        .map((j) => rec(`p${k}${j}`, A(sl, sets[(i + k * 3 + j) % sets.length], subsets[(i + k + j * 2) % subsets.length]), (i + j) % 2 ? 4 : null)));
      const worn = Object.fromEntries(ps.filter((p) => p.id.endsWith('0')).map((p) => [p.slot, p.id]));
      const st = { ...pool(ps), worn: { [CAREN]: worn } };
      const x = A((['helmet', 'armor', 'gloves', 'shoes'] as const)[i % 4], sets[i % sets.length], subsets[(i * 7) % subsets.length]);
      const r = putOn(ctx, st, CAREN, x);
      const before = poolInfo(P, ps, new Set(Object.values(worn)));
      for (const p of r.removed) {
        expect(before.why.has(p.id)).toBe(true);
        expect(r.st.pools[CAREN]).not.toContain(p.id);
        if (p.slot !== x.slot) expect(worn[p.slot]).not.toBe(p.id);
      }
      expect(r.st.pools[CAREN]).toContain(r.id);
      n += r.removed.length;
    }
    expect(n).toBeGreaterThan(0);
  });

  it('Р1 (прежний): слабый Speed-шлем при сильном Attack-шлеме — новые Speed-ботинки ничего не убирают', () => {
    const r = putOn(ctx, pool(helmets()), CAREN, SHOES);
    expect(r.removed).toEqual([]);
  });

  it('planPut — то же, что уберёт и отметит «Надеть», без записи', () => {
    const st = pool([...helmets(), rec('p5', A('shoes', 'Attack', { CHC: 2, HP: 1, EFF: 1, RES: 1 }))]);
    const { piece } = newPiece(st, SHOES, '');
    const plan = planPut(ctx, idx.CHAR[CAREN], Object.values(st.pieces), piece);
    const r = putOn(ctx, st, CAREN, SHOES);
    expect(plan.removed.map((p) => p.id)).toEqual(r.removed.map((p) => p.id));
  });

  // подпись кнопки (poolVs replaces) — planFor по виду пула; должна совпасть с тем, что сделает putOn (находка 5)
  const same = (st: GearStore, who: string, x: ItemInput) => {
    const plan = planFor(ctx, poolView(ctx, st), who, x)!;
    const r = putOn(ctx, st, who, x);
    return [plan.removed.map((p) => p.id), r.removed.map((p) => p.id)];
  };
  const eternal = '2000043', cfEternal = '2700043';
  it.each([
    ['пустой слот, ненужная вещь другого слота', () => same(pool(helmets()), CAREN, SHOES)],
    ['две вещи её слота', () => same(pool([...helmets(), rec('p5', A('shoes', 'Attack', { CHC: 2, HP: 1, EFF: 1, RES: 1 }))]), CAREN, SHOES)],
    ['Eternal, 4 Attack: Speed-шлем начнёт Speed', () => same(pool(['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => rec('e' + i, A(sl as Piece['slot'], 'Attack', { SPD: 3, EFF: 2, CHC: 2 }))), eternal), eternal, A('helmet', 'Speed', { SPD: 1, HP: 1, RES: 1, DEF: 1 }))],
    ['Core Fusion Eternal, 4 Effectiveness', () => same(pool(['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => rec('e' + i, A(sl as Piece['slot'], 'Effectiveness', { SPD: 2, EFF: 2, CHC: 1, HP: 1 }))), cfEternal), cfEternal, A('helmet', 'Speed', { SPD: 3, EFF: 2, CHC: 2, 'ATK%': 1 }))],
  ])('planFor — то же, что сделает putOn: %s', (_, run) => {
    const [plan, put] = run();
    expect(plan).toEqual(put);
  });
});

describe('«Надеть»: вариант, где она встала, — начат и с ней (Р14)', () => {
  // Gnosis Domine: Def-шлем и Def-ботинки на T4, Immunity- и Patience-перчатки — собраны Def ×2 в Pen Def и Pen Immu.
  // Pen-ботинки в Pen Def — «сет 3 из 4» вместо Def-ботинок, Def ×2 там распадается. Было: ближе всех стал Pen Immu,
  // Pen Def выпадал, и «Надеть» ставил ему «Собираю»; по Р14 Pen Def начат — собирается сам
  const GNOSIS = '2000112';
  const A = (slot: Piece['slot'], s: string): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs: { CHC: 1 } });
  const ps = [rec('p1', A('helmet', 'Defense'), 4), rec('p2', A('gloves', 'Immunity'), 4), rec('p3', A('gloves', 'Patience')), rec('p4', A('shoes', 'Defense'), 4)];
  const st = v2(ps, { [GNOSIS]: ps.map((p) => p.id) });
  const PEN = { ...A('shoes', 'Penetration'), subs: { HP: 1, CHC: 1, RES: 4, EFF: 3 } };

  it('новые ботинки не «ненужные»', () => {
    const r = putOn(ctx, st, GNOSIS, PEN);
    expect(poolView(ctx, r.st).of(GNOSIS)!.unused.map((p) => p.id)).not.toContain(r.id);
  });
});

describe('«Надеть»: начало сборки и «Вернуть»', () => {
  // у Caren собран Speed ×4, Defense-вещей нет; новый Defense-шлем в Speed не встаёт
  const A = (slot: Piece['slot'], s: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs });
  const mid = { CHC: 2, CHD: 2, 'DEF%': 1, HP: 1 };
  const pcs = (['helmet', 'armor', 'gloves', 'shoes'] as const).map((sl, i) => rec('p' + (i + 1), A(sl, 'Speed', mid)));
  const st = v2(pcs, { [CAREN]: pcs.map((p) => p.id) });
  const DEF = A('helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
  const unused = (s: GearStore) => poolView(ctx, s).of(CAREN)!.unused.map((p) => p.id);

  it('старый Defense-шлем уже начал Def (Р14): новый его заменяет', () => {
    const old = rec('p5', A('helmet', 'Defense', { HP: 1, RES: 1 }));
    const r = putOn(ctx, v2([...pcs, old], { [CAREN]: [...pcs, old].map((p) => p.id) }), CAREN, DEF);
    // слабый старый шлем пул не держал и до «Надеть» («больше не нужна») — «Надеть» его не трогает (PLAN Д7)
    expect(r.removed.map((p) => p.id)).toEqual([]);
  });

  it('новый шлем не «ненужный»: Def начат им и собирается сам', () => {
    const r = putOn(ctx, st, CAREN, DEF);
    expect(unused(r.st)).toEqual([]);
  });

  // A Penetration helmet with weak stats fits only Pen: not the Speed variants, not «По статам» (a Speed helmet is better there)
  // but the pool keeps each variant's build (В2, "what the pool keeps" — (a)) — the helmet is needed
  it('встала только в Pen — шлем нужен', () => {
    const r = putOn(ctx, st, CAREN, A('helmet', 'Penetration', { RES: 1, EFF: 1 }));
    expect(unused(r.st)).not.toContain(r.id);
  });

  it('«Вернуть» после «Надеть» — хранилище как до неё (seq не откатывается: номер вещи не переиспользуется)', () => {
    const r = putOn(ctx, st, CAREN, A('helmet', 'Penetration', { RES: 1, EFF: 1 }));
    const back = undoPut(r.st, CAREN, r);
    expect({ ...back, seq: 0 }).toEqual({ ...st, seq: 0 });
  });

  it('встала и в собираемый вариант — шлем нужен', () => {
    // Immunity-шлем встаёт в Speed/Immu, который собирается сам (Speed ×2 из четырёх Speed)
    const r = putOn(ctx, st, CAREN, A('helmet', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }));
    expect(unused(r.st)).not.toContain(r.id);
  });
});

// шаг 10: блоки «сегменты и Reforge» (tapSegment, setYellow, replaceStat, addFourth, reforgesDone, reforgeScale) и «та
// же вещь» (samePiece) ушли вместе с функциями: правка в шторке — updateIn (ниже), окна «Это шлем Rin?» нет (В9)

// Шаг 5 «Оценка — единственный ввод»: правка в шторке вещи (Н1) — уровни 1–6, «T4» у брони, 4-й сабстат у Epic (В-А2);
// предел суммы (В-А5); только у этого героя — старая общая запись делится (В9, copy-on-write)
describe('правка в шторке (updateIn)', () => {
  const RIN = '2000019';
  const AT = '2026-10-01';
  const L = helmet({ 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 });
  const solo = () => v2([rec('p1', helmet({ RES: 1 })), rec('p2', L), rec('p3', helmet({ HP: 1 }))], { [CAREN]: ['p1', 'p2', 'p3'] });
  const shared = () => v2([rec('p1', helmet({ RES: 1 })), rec('p2', L), rec('p3', helmet({ HP: 1 }))], { [RIN]: ['p2', 'p3'], [CAREN]: ['p1', 'p2', 'p3'] });

  it('запись только у этого героя — тот же id и то же место, seq не растёт; уровень и дата — новые', () => {
    const st = solo();
    const r = updateIn(idx, st, CAREN, 'p2', { lit: { SPD: 4 } }, AT);
    expect({ id: r.id, pool: r.st.pools[CAREN], seq: r.st.seq }).toEqual({ id: 'p2', pool: ['p1', 'p2', 'p3'], seq: 3 });
    expect(r.st.pieces.p2).toMatchObject({ lit: { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 4 }, at: AT });
  });

  it('общая запись: у Rin прежняя, у Caren новая (seq + 1) на том же месте; возвращает новый id', () => {
    const st = shared();
    const r = updateIn(idx, st, CAREN, 'p2', { lit: { SPD: 4 } }, AT);
    expect({ id: r.id, seq: r.st.seq, caren: r.st.pools[CAREN], rin: r.st.pools[RIN] }).toEqual({ id: 'p4', seq: 4, caren: ['p1', 'p4', 'p3'], rin: ['p2', 'p3'] });
    expect(r.st.pieces.p2).toBe(st.pieces.p2);
    expect(r.st.pieces.p4).toMatchObject({ id: 'p4', setId: speed, lit: { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 4 }, at: AT });
    expect([holdersOf(r.st, 'p2'), holdersOf(r.st, 'p4')]).toEqual([[RIN], [CAREN]]);
  });

  it('после деления запись Caren — уже её одной: следующая правка — тот же id', () => {
    const once = updateIn(idx, shared(), CAREN, 'p2', { lit: { SPD: 4 } }, AT);
    const twice = updateIn(idx, once.st, CAREN, once.id, { lit: { SPD: 5 } }, AT);
    expect({ id: twice.id, seq: twice.st.seq, caren: twice.st.pools[CAREN] }).toEqual({ id: 'p4', seq: 4, caren: ['p1', 'p4', 'p3'] });
  });

  it('уровень 6 — да; 7, 0 и дробный — не применяется', () => {
    const st = solo();
    expect(updateIn(idx, st, CAREN, 'p2', { lit: { SPD: 6 } }, AT).st.pieces.p2.lit.SPD).toBe(6);
    for (const n of [7, 0, 2.5]) expect(updateIn(idx, st, CAREN, 'p2', { lit: { SPD: n } }, AT)).toEqual({ st, id: 'p2' });
  });

  it('смены стата нет (Transistone — не правка): стат, которого у вещи нет, — не применяется', () => {
    const st = solo();
    expect(updateIn(idx, st, CAREN, 'p2', { lit: { ATK: 2 } }, AT)).toEqual({ st, id: 'p2' });
  });

  it('«T4» → 4 и обратно → 0; Breakthrough не указан тоже становится 4', () => {
    const on = updateIn(idx, solo(), CAREN, 'p2', { bt: 4 }, AT);
    expect(on.st.pieces.p2.bt).toBe(4);
    expect(updateIn(idx, on.st, CAREN, 'p2', { bt: 0 }, AT).st.pieces.p2.bt).toBe(0);
  });

  // было (В4): у оружия не применялась. Вопрос 7 (б) ревью eval-only: «T4» у Legendary оружия и аксессуара — материал
  // такого же предмета
  it.each(['weapon', 'accessory'] as const)('«T4» у Legendary %s → 4 и обратно → 0; не указан тоже становится 4', (slot) => {
    const w = rec('p1', { slot, grade: 'unique', setId: null, itemKey: 'x', main: 'ATK%', subs: { CHC: 2 } });
    const on = updateIn(idx, v2([w], { [CAREN]: ['p1'] }), CAREN, 'p1', { bt: 4 }, AT);
    expect(on.st.pieces.p1.bt).toBe(4);
    expect(updateIn(idx, on.st, CAREN, 'p1', { bt: 0 }, AT).st.pieces.p1.bt).toBe(0);
  });

  // было: не применяется. .x/0060 SPEC 4.2: у Epic оружия «T4» есть, старая запись «не указан» — тоже переключается
  it('«T4» у Epic оружия → 4 и обратно → 0', () => {
    const w = rec('p1', { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { CHC: 2 } });
    const on = updateIn(idx, v2([w], { [CAREN]: ['p1'] }), CAREN, 'p1', { bt: 4 }, AT);
    expect(on.st.pieces.p1.bt).toBe(4);
    expect(updateIn(idx, on.st, CAREN, 'p1', { bt: 0 }, AT).st.pieces.p1.bt).toBe(0);
  });

  it('4-й сабстат у Epic с тремя — с уровнем 1; у Legendary, у Epic с четырьмя и тот же стат — нет', () => {
    const epic = v2([rec('p1', helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }, 'rare'))], { [CAREN]: ['p1'] });
    expect(updateIn(idx, epic, CAREN, 'p1', { add: 'SPD' }, AT).st.pieces.p1).toMatchObject({ yellow: { SPD: 1 }, lit: { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 } });
    const legend = v2([rec('p1', helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }))], { [CAREN]: ['p1'] });
    const epic4 = v2([rec('p1', helmet({ 'DEF%': 3, CHC: 2, CHD: 2, HP: 1 }, 'rare'))], { [CAREN]: ['p1'] });
    expect(updateIn(idx, legend, CAREN, 'p1', { add: 'SPD' }, AT).st).toBe(legend);
    expect(updateIn(idx, epic4, CAREN, 'p1', { add: 'SPD' }, AT).st).toBe(epic4);
    expect(updateIn(idx, epic, CAREN, 'p1', { add: 'CHC' }, AT).st).toBe(epic);
  });

  it('4-й сабстат — только допустимый на предмете, как на форме: PEN% и HP% у шлема (main HP%) — нет', () => {
    const epic = v2([rec('p1', helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }, 'rare'))], { [CAREN]: ['p1'] });
    for (const k of ['PEN%', 'CDMG RED%', 'HP%', 'нет-такого', '']) expect(updateIn(idx, epic, CAREN, 'p1', { add: k }, AT).st).toBe(epic);
    expect(updateIn(idx, epic, CAREN, 'p1', { add: 'HP' }, AT).st.pieces.p1.lit.HP).toBe(1);
  });

  it('после правки хранилище читается целиком: restoreGear — та же запись, readsWhole', () => {
    const epic = v2([rec('p1', helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }, 'rare'))], { [CAREN]: ['p1'] });
    const raw = JSON.parse(JSON.stringify(updateIn(idx, epic, CAREN, 'p1', { add: 'SPD', lit: { CHC: 5 } }, AT).st));
    expect({ whole: readsWhole(raw, idx), piece: restoreGear(raw, idx).pieces.p1 }).toEqual({ whole: true, piece: raw.pieces.p1 });
  });

  it('старая запись с оранжевыми после правки — один уровень: yellow = min(lit, 4)', () => {
    // жёлтые CHC 2 / CHD 3, горит 5 / 3; правка только Breakthrough
    const st = v2([rec('p1', helmet({ CHC: 2, CHD: 3 }), null, { CHC: 5, CHD: 3 })], { [CAREN]: ['p1'] });
    expect(updateIn(idx, st, CAREN, 'p1', { bt: 4 }, AT).st.pieces.p1).toMatchObject({ yellow: { CHC: 4, CHD: 3 }, lit: { CHC: 5, CHD: 3 }, bt: 4 });
  });

  it('предел суммы: рост выше 22 у Legendary и 17 у Epic — не применяется; до предела — да', () => {
    const legend = v2([rec('p1', helmet({ 'DEF%': 6, CHC: 6, CHD: 6, SPD: 3 }))], { [CAREN]: ['p1'] });
    expect(updateIn(idx, legend, CAREN, 'p1', { lit: { SPD: 4 } }, AT).st.pieces.p1.lit.SPD).toBe(4);
    expect(updateIn(idx, legend, CAREN, 'p1', { lit: { SPD: 5 } }, AT).st).toBe(legend);
    const epic = v2([rec('p1', helmet({ 'DEF%': 6, CHC: 6, CHD: 4 }, 'rare'))], { [CAREN]: ['p1'] });
    expect(updateIn(idx, epic, CAREN, 'p1', { lit: { CHD: 5 } }, AT).st.pieces.p1.lit.CHD).toBe(5);
    expect(updateIn(idx, epic, CAREN, 'p1', { lit: { CHD: 6 } }, AT).st).toBe(epic);
    // 4-й сабстат — тоже рост суммы: у Epic 6/6/5 (17) его не добавить
    const full = updateIn(idx, epic, CAREN, 'p1', { lit: { CHD: 5 } }, AT).st;
    expect(updateIn(idx, full, CAREN, 'p1', { add: 'SPD' }, AT).st).toBe(full);
  });

  it('старая Legendary 6/6/6/6 (сумма 24): снять сегмент и «T4» — можно, поднять — нет', () => {
    const st = v2([rec('p1', helmet({ 'DEF%': 4, CHC: 4, CHD: 4, SPD: 4 }), null, { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 })], { [CAREN]: ['p1'] });
    expect(updateIn(idx, st, CAREN, 'p1', { lit: { SPD: 5 } }, AT).st.pieces.p1.lit).toEqual({ 'DEF%': 6, CHC: 6, CHD: 6, SPD: 5 });
    expect(updateIn(idx, st, CAREN, 'p1', { bt: 4 }, AT).st.pieces.p1).toMatchObject({ bt: 4, lit: { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 } });
    // переставить сегмент (сумма та же) — тоже можно: сумма не растёт
    const minus = updateIn(idx, st, CAREN, 'p1', { lit: { SPD: 5 } }, AT).st;
    expect(updateIn(idx, minus, CAREN, 'p1', { lit: { SPD: 6 } }, AT).st).toBe(minus);
  });

  it('ничего не поменялось, вещи нет в пуле героя или записи нет — то же хранилище', () => {
    const st = shared();
    expect(updateIn(idx, st, CAREN, 'p2', { lit: { SPD: 1 }, bt: undefined }, AT)).toEqual({ st, id: 'p2' });
    expect(updateIn(idx, st, RIN, 'p1', { lit: { RES: 2 } }, AT)).toEqual({ st, id: 'p1' });
    expect(updateIn(idx, st, CAREN, 'p9', { lit: { RES: 2 } }, AT)).toEqual({ st, id: 'p9' });
  });

  it('копия не оставляет висячих id: gc, «Убрать у Rin», переход Core Fusion и правило Core Fusion', () => {
    const [eternal, cf] = ['Eternal', 'Core Fusion Eternal'].map((n) => D.chars.find((c) => c.name === n)!.id);
    const st = v2([rec('p1', L), rec('p2', helmet({ HP: 1 }))], { [RIN]: ['p1'], [eternal]: ['p1'], [cf]: ['p2'] });
    const r = updateIn(idx, st, eternal, 'p1', { bt: 4 }, AT);
    const dangling = (x: GearStore) => Object.values(x.pools).flat().filter((id) => !x.pieces[id]);
    expect(dangling(gc(r.st))).toEqual([]);
    expect(Object.keys(gc(r.st).pieces).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(gc({ ...r.st, pools: { ...r.st.pools, [RIN]: [] } }).pieces.p1).toBeUndefined();
    const n = normalizeFusion(idx, [eternal, cf, RIN], r.st);
    expect({ dangling: dangling(n.st), pieces: Object.keys(n.st.pieces).sort() }).toEqual({ dangling: [], pieces: ['p1', 'p2'] });
    const sw = switchFusion(idx, [eternal, RIN], r.st, cf)!;
    expect({ dangling: dangling(sw.st), cf: sw.st.pools[cf], rin: sw.st.pools[RIN] }).toEqual({ dangling: [], cf: ['p2', 'p3'], rin: ['p1'] });
  });
});

// «Надето», шаг 1: worn (слот → запись пула героя) — данные и инвариант «надетое ⊂ пул»
describe('надетое (worn)', () => {
  const RIN = '2000019';
  const shoes = (subs: Record<string, number>): ItemInput => ({ ...helmet(subs), slot: 'shoes' });
  const plain = () => v2([rec('p1', helmet({ CHC: 2 })), rec('p2', shoes({ RES: 1 })), rec('p3', helmet({ HP: 1 }))], { [CAREN]: ['p1', 'p2'], [KAPPA]: ['p3', 'p1'] });
  const dressed = (): GearStore => ({
    ...plain(),
    worn: { [CAREN]: { helmet: 'p1', shoes: 'p2' }, [KAPPA]: { helmet: 'p3' } },
  });
  // надетое ⊂ пул героя, слот записи = ключ
  const consistent = (st: GearStore) =>
    Object.entries(st.worn ?? {}).every(([c, w]) => Object.keys(w).length > 0 && Object.entries(w).every(([slot, id]) => !!id && !!st.pools[c]?.includes(id) && st.pieces[id]?.slot === slot));
  const [eternal, cf] = ['Eternal', 'Core Fusion Eternal'].map((n) => D.chars.find((c) => c.name === n)!.id);
  // то же хранилище, но вещи Caren — у Eternal (и вещи Kappa — у Core Fusion Eternal, если withCf)
  const asEternal = (st: GearStore, withCf = false): GearStore => {
    const { worn: _w, ...rest } = st;
    const to = (x: Record<string, unknown> | undefined) => x && { [eternal]: x[CAREN], ...(withCf ? { [cf]: x[KAPPA] } : {}) };
    return {
      ...rest, pools: to(st.pools) as GearStore['pools'],
      ...(st.worn ? { worn: to(st.worn) as GearStore['worn'] } : {}),
    };
  };
  // все мутации списка вещей
  const mutations: [string, (st: GearStore) => GearStore][] = [
    ['gc', (st) => gc(st)],
    ['«Убрать у Caren» надетую', (st) => removeFrom(st, CAREN, 'p1')],
    ['«Убрать» последнюю вещь Kappa', (st) => removeFrom(removeFrom(st, KAPPA, 'p3'), KAPPA, 'p1')],
    ['«Вернуть» после «Убрать»', (st) => undoRemove(removeFrom(st, CAREN, 'p1'), st.pieces.p1, [CAREN], isWorn(st, CAREN, st.pieces.p1) ? [CAREN] : [])],
    ['«Вернуть» после «Убрать» последней вещи', (st) => { const one = removeFrom(st, KAPPA, 'p1'); return removeUndo(one, KAPPA, one.pieces.p3)(removeFrom(one, KAPPA, 'p3')); }],
    ['«Надеть» с заменой шлема', (st) => putOn(ctx, st, CAREN, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }), { replace: 'p1' }).st],
    ['«Вернуть» после «Надеть»', (st) => { const r = putOn(ctx, st, CAREN, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }), { replace: 'p1' }); return undoPut(r.st, CAREN, r); }],
    ['dropChar', (st) => dropChar(st, CAREN).st],
    ['undoDrop', (st) => { const r = dropChar(st, CAREN); return undoDrop(r.st, r.dropped); }],
    ['updateIn общей записи (копия)', (st) => updateIn(idx, st, CAREN, 'p1', { lit: { CHC: 3 } }).st],
    ['updateIn своей записи', (st) => updateIn(idx, st, CAREN, 'p2', { lit: { RES: 2 } }).st],
    ['normalizeFusion moved', (st) => normalizeFusion(idx, [cf], asEternal(st)).st],
    ['normalizeFusion removed', (st) => normalizeFusion(idx, [], asEternal(st, true)).st],
    ['switchFusion', (st) => switchFusion(idx, [], asEternal(st), cf)!.st],
    ['unfuseChar', (st) => { const sw = switchFusion(idx, [], asEternal(st), cf)!; return unfuseChar(sw.st, sw.from, sw.to, sw); }],
  ];

  it.each(mutations)('%s: надетое — из пула героя и в своём слоте', (_, act) => {
    const st = dressed();
    const after = act(st);
    expect(consistent(after)).toBe(true);
  });

  // «Надеть» надевает новую (шаг 2) — у него worn появляется: отдельный тест ниже
  const PUT = '«Надеть» с заменой шлема';
  it.each(mutations.filter(([name]) => name !== PUT))('%s: у хранилища без надетого поля worn не появляется', (_, act) => {
    const st = plain();
    const after = act(st);
    expect('worn' in after).toBe(false);
  });

  it('«Надеть» с заменой шлема у хранилища без надетого: worn — только новая в её слоте', () => {
    const st = plain();
    const r = putOn(ctx, st, CAREN, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 }), { replace: 'p1' });
    expect(r.st.worn).toEqual({ [CAREN]: { helmet: r.id } });
  });

  describe('чтение', () => {
    it('надетое прочитано как есть; код копии его сохраняет; прочитано целиком', () => {
      const st = dressed();
      const read = restoreGear(st, idx);
      const coded = decodeGear(encodeGear(st), idx) as GearStore;
      expect({ worn: read.worn, coded: coded.worn, whole: readsWhole(st, idx) }).toEqual({ worn: st.worn, coded: st.worn, whole: true });
    });

    const bad: [string, Partial<GearStore>, Partial<GearStore>][] = [
      ['висячий id', { worn: { [CAREN]: { helmet: 'p1', shoes: 'p9' } } }, { worn: { [CAREN]: { helmet: 'p1' } } }],
      ['запись не из пула героя', { worn: { [CAREN]: { helmet: 'p3' } } }, { worn: undefined }],
      ['чужой слот', { worn: { [CAREN]: { helmet: 'p1', gloves: 'p2' } } }, { worn: { [CAREN]: { helmet: 'p1' } } }],
      ['надетое у героя без пула', { worn: { [RIN]: { helmet: 'p1' } } }, { worn: undefined }],
      ['надетое не объектом', { worn: 'p1' as unknown as GearStore['worn'] }, { worn: undefined }],
    ];
    it.each(bad)('%s — отброшено, прочитано не целиком', (_, extra, kept) => {
      const raw = { ...plain(), ...extra };
      const read = restoreGear(raw, idx);
      expect({ worn: read.worn, whole: readsWhole(raw, idx) }).toEqual({ worn: undefined, ...kept, whole: false });
    });

    // пустое — не потеря (Р17, как пустые пулы): убрано, но прочитано целиком
    it('пустой объект надетого у героя — убран, прочитано целиком', () => {
      const raw = { ...plain(), worn: { [CAREN]: {}, [KAPPA]: { helmet: 'p3' } } };
      expect({ worn: restoreGear(raw, idx).worn, whole: readsWhole(raw, idx) }).toEqual({ worn: { [KAPPA]: { helmet: 'p3' } }, whole: true });
    });

    // старая вкладка переносит worn как есть, а после её «Убрать» запись висит; запись нормализации (Caren — в
    // ростер) при этом не пишется: readsWhole — условие записи в features/gear/store/stored
    it('старая вкладка: надето то, что она уже убрала, — при чтении отброшено, нормализация не пишется', () => {
      const raw = { ...plain(), pools: { [CAREN]: ['p2'], [KAPPA]: ['p3', 'p1'] }, worn: { [CAREN]: { helmet: 'p1', shoes: 'p2' } } };
      const n = loadGear(raw, idx, [KAPPA]);
      expect({ worn: n.st.worn, added: n.added, whole: readsWhole(raw, idx) })
        .toEqual({ worn: { [CAREN]: { shoes: 'p2' } }, added: [CAREN], whole: false });
    });
  });

  it('updateIn у общей записи: надетое — на новой записи, у другого героя — как было', () => {
    const st = dressed();
    const r = updateIn(idx, st, CAREN, 'p1', { lit: { CHC: 3 } });
    expect({ id: r.id, worn: r.st.worn }).toEqual({ id: 'p4', worn: { [CAREN]: { helmet: 'p4', shoes: 'p2' }, [KAPPA]: { helmet: 'p3' } } });
  });

  it('dropChar: надетое героя уходит; undoDrop — хранилище как было', () => {
    const before = dressed();
    const r = dropChar(before, CAREN);
    const back = undoDrop(r.st, r.dropped);
    expect({ gone: r.st.worn?.[CAREN], back, worn: JSON.stringify(back.worn) })
      .toEqual({ gone: undefined, back: before, worn: JSON.stringify(before.worn) });
  });

  it('«Убрать у Caren» надетую — не надета; «Вернуть» — снова надета', () => {
    const st = dressed();
    const p1 = st.pieces.p1;
    const gone = removeFrom(st, CAREN, 'p1');
    const back = undoRemove(gone, p1, [CAREN], [CAREN]);
    expect([isWorn(gone, CAREN, p1), isWorn(back, CAREN, p1), back.worn]).toEqual([false, true, st.worn]);
  });

  it('«Убрать» последнюю вещь героя и «Вернуть» — как было', () => {
    const st = { ...dressed(), pools: { [CAREN]: ['p1', 'p2'], [KAPPA]: ['p3'] } };
    const undo = removeUndo(st, KAPPA, st.pieces.p3);
    const gone = removeFrom(st, KAPPA, 'p3');
    expect({ gone: gone.worn?.[KAPPA], back: undo(gone) }).toEqual({ gone: undefined, back: st });
  });
});

describe('закрепление (pin, MODEL.md §6)', () => {
  const caren = idx.CHAR[CAREN];
  const [a, b] = pinOptions(caren);
  const base = () => v2([rec('p1', helmet({ CHC: 2 })), rec('p2', helmet({ HP: 1 }))], { [CAREN]: ['p1'], [KAPPA]: ['p2'] });

  it('setPin пишет и снимает («По статам» = null); undoPin — точечно', () => {
    const st = base();
    const one = setPin(st, CAREN, a.key);
    expect(one.st.pin).toEqual({ [CAREN]: a.key });
    const two = setPin(one.st, CAREN, b.key);
    expect({ was: two.was, pin: two.st.pin }).toEqual({ was: a.key, pin: { [CAREN]: b.key } });
    const off = setPin(two.st, CAREN, null);
    expect('pin' in off.st).toBe(false);
    expect(setPin(off.st, CAREN, null).st).toBe(off.st);
    expect(undoPin(off.st, CAREN, off).pin).toEqual({ [CAREN]: b.key });
    // за эти секунды закрепили другое — «Вернуть» не трогает
    expect(undoPin(setPin(two.st, CAREN, a.key).st, CAREN, two).pin).toEqual({ [CAREN]: a.key });
  });

  it('чтение: ключ как есть, код копии его сохраняет; не строка — отброшено, прочитано не целиком', () => {
    const st = setPin(base(), CAREN, a.key).st;
    expect(restoreGear(st, idx).pin).toEqual({ [CAREN]: a.key });
    expect((decodeGear(encodeGear(st), idx) as GearStore).pin).toEqual({ [CAREN]: a.key });
    expect(readsWhole(st, idx)).toBe(true);
    const bad = { ...base(), pin: { [CAREN]: 5 } };
    expect([restoreGear(bad, idx).pin, readsWhole(bad, idx)]).toEqual([undefined, false]);
  });

  it('от пула не зависит: «Убрать» последнюю вещь и gc закрепление не снимают; dropChar снимает, undoDrop возвращает', () => {
    const st = setPin(base(), CAREN, a.key).st;
    expect(gc(removeFrom(st, CAREN, 'p1')).pin).toEqual({ [CAREN]: a.key });
    const r = dropChar(st, CAREN);
    expect(r.st.pin).toBeUndefined();
    expect(undoDrop(r.st, r.dropped)).toEqual(st);
  });

  it('stalePins: билд переименовали — ключ устарел; пул героя — по профилю закрепления', () => {
    const stale = a.key.replace(a.build.name, a.build.name + ' old');
    expect(stalePins(idx, { pin: { [CAREN]: stale, [KAPPA]: pinOptions(idx.CHAR[KAPPA])[0].key } })).toEqual({ [CAREN]: stale });
    const st = setPin(base(), CAREN, a.key).st;
    expect(poolView(ctx, st).hero(CAREN)!.P.pin?.key).toBe(a.key);
    expect(poolView(ctx, base()).hero(CAREN)!.P.pin).toBeUndefined();
  });

  it('В5 ревью: билд переименовали, тот же набор с той же цепочкой есть — закрепление молча переходит; нет — снято', () => {
    const renamed = a.key.replace(a.build.name, a.build.name + ' old');
    const moved = fixPins(idx, setPin(base(), CAREN, renamed).st);
    expect([moved.st.pin, moved.gone]).toEqual([{ [CAREN]: a.key }, []]);
    // набора нет нигде — снято
    const lost = `${CAREN}/${a.build.name}#999x4`;
    const r = fixPins(idx, setPin(base(), CAREN, lost).st);
    expect([r.st.pin, r.gone]).toEqual([undefined, [[CAREN, lost]]]);
    // у Anarky две цепочки: цепочку пропавшего билда ключ не хранит — снято, а не перенесено наугад
    const anarky = idx.D.chars.find((c) => c.name === 'Anarky')!;
    const ak = pinOptions(anarky)[0].key.replace(pinOptions(anarky)[0].build.name, 'gone');
    expect(fixPins(idx, setPin(base(), anarky.id, ak).st).gone).toEqual([[anarky.id, ak]]);
    // живое закрепление — тот же объект
    const ok = setPin(base(), CAREN, a.key).st;
    expect(fixPins(idx, ok).st).toBe(ok);
  });
});

// «Надето», шаг 2: «Надеть» = надел в игре — вещь в пул и в надетое своего слота; «Надеть из пула», «Да, всё надето»;
// «Вернуть» — точечно (пул и надетое этого слота этого героя), не снимок worn
describe('«Надето»: «Надеть» надевает, «Надеть из пула», «Да, всё надето», «Вернуть»', () => {
  const A = (slot: Piece['slot'], s: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs });
  const STRONG = { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 }, NOTHING = { RES: 1, EFF: 1 };
  // S — сильный Speed-шлем (стоит во всех билдах Caren), J — шлем чужого сета без полезных Caren статов (ни в одном)
  const S = () => rec('p1', A('helmet', 'Speed', STRONG)), J = () => rec('p2', A('helmet', 'Life', NOTHING));
  const LIFE = A('helmet', 'Life', NOTHING), SPEED = A('helmet', 'Speed', { 'DEF%': 4, CHC: 4, CHD: 4, SPD: 4 });
  const dressed = (worn: Record<string, string>, ps = [S(), J()]) => v2(ps, { [CAREN]: ps.map((p) => p.id) }, { worn: { [CAREN]: worn } });
  const J_ = JSON.stringify;

  describe('«Надеть» с формы', () => {
    it('вещь без полезных статов после «Надеть» — в пуле, надета и не «ненужная»', () => {
      const r = putOn(ctx, v2([S()], { [CAREN]: ['p1'] }), CAREN, LIFE);
      const cp = poolView(ctx, r.st).of(CAREN)!;
      expect({ pool: r.st.pools[CAREN].includes(r.id), worn: r.st.worn?.[CAREN]?.helmet, unused: cp.unused.map((p) => p.id) })
        .toEqual({ pool: true, worn: r.id, unused: [] });
    });

    it('в слоте надета вещь, которую держит билд: она остаётся в пуле (не надета), новая надета', () => {
      const r = putOn(ctx, dressed({ helmet: 'p1' }, [S()]), CAREN, LIFE);
      expect({ removed: r.removed, pool: r.st.pools[CAREN], worn: r.st.worn }).toEqual({ removed: [], pool: ['p1', r.id], worn: { [CAREN]: { helmet: r.id } } });
    });

    it('в слоте надета вещь, которую не держит ни один билд: она уходит, новая надета', () => {
      const r = putOn(ctx, dressed({ helmet: 'p2' }), CAREN, LIFE);
      expect({ removed: r.removed.map((p) => p.id), pool: r.st.pools[CAREN], worn: r.st.worn }).toEqual({ removed: ['p2'], pool: ['p1', r.id], worn: { [CAREN]: { helmet: r.id } } });
    });

    it('«Надеть» с replace: уходит именно эта запись, надетое — на новой', () => {
      const r = putOn(ctx, dressed({ helmet: 'p1' }), CAREN, SPEED, { replace: 'p1' });
      expect({ removed: r.removed.map((p) => p.id), pool: r.st.pools[CAREN], worn: r.st.worn?.[CAREN] }).toEqual({ removed: ['p1'], pool: ['p2', r.id], worn: { helmet: r.id } });
    });

    it('надетое других слотов «Надеть» не трогает', () => {
      const boots = rec('p3', A('shoes', 'Life', NOTHING));
      const r = putOn(ctx, dressed({ helmet: 'p2', shoes: 'p3' }, [S(), J(), boots]), CAREN, LIFE);
      expect(r.st.worn?.[CAREN]).toEqual({ helmet: r.id, shoes: 'p3' });
    });

    it.each([
      ['надета вещь, которую держит билд', () => dressed({ helmet: 'p1' })],
      ['надета вещь, которую не держит ни один билд', () => dressed({ helmet: 'p2' })],
    ])('подпись (planFor) — то же, что сделает putOn: %s', (_, mk) => {
      const st = mk();
      const plan = planFor(ctx, poolView(ctx, st), CAREN, LIFE)!;
      const r = putOn(ctx, st, CAREN, LIFE);
      expect(plan.removed.map((p) => p.id)).toEqual(r.removed.map((p) => p.id));
    });
  });

  describe('«Вернуть» после «Надеть»', () => {
    it('пул и надетое её слота — как до «Надеть» (байт в байт, кроме счётчика id)', () => {
      const st = dressed({ helmet: 'p2' });
      const r = putOn(ctx, st, CAREN, LIFE);
      expect(J_({ ...undoPut(r.st, CAREN, r), seq: st.seq })).toBe(J_(st));
    });

    it('после «Надеть» в слоте надели другую — «Вернуть» её не снимает', () => {
      const r = putOn(ctx, dressed({ helmet: 'p1' }, [S()]), CAREN, LIFE);
      const other = wearFromPool(ctx, r.st, CAREN, 'p1')!.st;
      expect(undoPut(other, CAREN, r).worn).toEqual({ [CAREN]: { helmet: 'p1' } });
    });

    // перенос из шага 1 (проба build/worn/refute1a «putOn replacing worn then undoPut»): была в пуле, но не надета
    it('«Надеть» с replace надетой записи, потом «Вернуть» — она снова в пуле и надета', () => {
      const st = dressed({ helmet: 'p1' }, [S()]);
      const r = putOn(ctx, st, CAREN, SPEED, { replace: 'p1' });
      const back = undoPut(r.st, CAREN, r);
      expect({ pool: back.pools[CAREN], worn: back.worn }).toEqual({ pool: ['p1'], worn: { [CAREN]: { helmet: 'p1' } } });
    });
  });

  describe('«Надеть из пула» (wearFromPool)', () => {
    it('надетая сменилась; прежняя, которую держит билд, — в пуле', () => {
      const r = wearFromPool(ctx, dressed({ helmet: 'p1' }), CAREN, 'p2')!;
      expect({ removed: r.removed, pool: r.st.pools[CAREN], worn: r.st.worn }).toEqual({ removed: [], pool: ['p1', 'p2'], worn: { [CAREN]: { helmet: 'p2' } } });
    });

    it('прежняя, которую не держит ни один билд, уходит из пула', () => {
      const r = wearFromPool(ctx, dressed({ helmet: 'p2' }), CAREN, 'p1')!;
      expect({ removed: r.removed.map((p) => p.id), pool: r.st.pools[CAREN], worn: r.st.worn }).toEqual({ removed: ['p2'], pool: ['p1'], worn: { [CAREN]: { helmet: 'p1' } } });
    });

    it('ничего не создаёт: записи и счётчик те же', () => {
      const st = dressed({ helmet: 'p1' });
      const r = wearFromPool(ctx, st, CAREN, 'p2')!;
      expect({ seq: r.st.seq, pieces: Object.keys(r.st.pieces) }).toEqual({ seq: st.seq, pieces: ['p1', 'p2'] });
    });

    it.each([
      ['прежняя ушла из пула', () => dressed({ helmet: 'p2' }), 'p1'],
      ['прежняя осталась в пуле', () => dressed({ helmet: 'p1' }), 'p2'],
      ['слот был пуст, надет другой', () => dressed({ shoes: 'p3' }, [S(), J(), rec('p3', A('shoes', 'Life', NOTHING))]), 'p2'],
      ['у героя ничего не было надето', () => v2([S(), J()], { [CAREN]: ['p1', 'p2'] }), 'p2'],
    ])('«Вернуть» — байт в байт: %s', (_, mk, id) => {
      const st = mk();
      const r = wearFromPool(ctx, st, CAREN, id)!;
      expect(J_(undoWear(r.st, CAREN, r))).toBe(J_(st));
    });

    it('уже надета или не из его пула — ничего (null)', () => {
      const st = dressed({ helmet: 'p1' });
      expect([wearFromPool(ctx, st, CAREN, 'p1'), wearFromPool(ctx, st, KAPPA, 'p2'), wearFromPool(ctx, st, CAREN, 'zz')]).toEqual([null, null, null]);
    });
  });

  describe('«Да, всё надето» (wearAll)', () => {
    const six = () => [rec('w1', { ...A('helmet', 'Speed', STRONG) }), rec('w2', A('armor', 'Speed', STRONG)), rec('w3', A('gloves', 'Speed', STRONG)),
      rec('w4', A('shoes', 'Speed', STRONG)), rec('w5', { slot: 'weapon', grade: 'unique', setId: null, itemKey: null, main: 'DEF%', subs: STRONG }),
      rec('w6', { slot: 'accessory', grade: 'unique', setId: null, itemKey: null, main: 'DEF%', subs: STRONG })];

    it('по одной вещи на слот — надеты все', () => {
      const ps = six();
      const r = wearAll(v2(ps, { [CAREN]: ps.map((p) => p.id) }), CAREN)!;
      expect(r.st.worn).toEqual({ [CAREN]: { helmet: 'w1', armor: 'w2', gloves: 'w3', shoes: 'w4', weapon: 'w5', accessory: 'w6' } });
    });

    it('5 вещей без брони — надеты все пять, броня пустая', () => {
      const ps = six().filter((p) => p.slot !== 'armor');
      const r = wearAll(v2(ps, { [CAREN]: ps.map((p) => p.id) }), CAREN)!;
      expect(r.st.worn).toEqual({ [CAREN]: { helmet: 'w1', gloves: 'w3', shoes: 'w4', weapon: 'w5', accessory: 'w6' } });
    });

    it('две вещи в одном слоте — ничего (null)', () => {
      expect(wearAll(v2([S(), J()], { [CAREN]: ['p1', 'p2'] }), CAREN)).toBeNull();
    });

    it('на герое уже что-то надето — ничего (null)', () => {
      const ps = six();
      expect(wearAll(v2(ps, { [CAREN]: ps.map((p) => p.id) }, { worn: { [CAREN]: { helmet: 'w1' } } }), CAREN)).toBeNull();
    });

    it('«Вернуть» — байт в байт (и надетое других героев на месте)', () => {
      const ps = [...six(), rec('k1', helmet({ HP: 1 }))];
      const st = v2(ps, { [KAPPA]: ['k1'], [CAREN]: ps.slice(0, 6).map((p) => p.id) }, { worn: { [KAPPA]: { helmet: 'k1' } } });
      const r = wearAll(st, CAREN)!;
      expect(J_(undoWearAll(r.st, CAREN, r))).toBe(J_(st));
    });

    it('«Вернуть» не снимает то, что за эти секунды надели в слот заново', () => {
      const ps = [...six(), rec('w7', A('helmet', 'Speed', NOTHING))];
      const st = v2(ps, { [CAREN]: ps.slice(0, 6).map((p) => p.id) });
      const r = wearAll(st, CAREN)!;
      const later = wearFromPool(ctx, { ...r.st, pools: { [CAREN]: [...r.st.pools[CAREN], 'w7'] } }, CAREN, 'w7')!.st;
      expect(undoWearAll(later, CAREN, r).worn).toEqual({ [CAREN]: { helmet: 'w7' } });
    });
  });
});

describe('«Отложить для X» (stashOn)', () => {
  it('новая запись в пуле героя, не надета, с датой; «Вернуть» — как было', () => {
    const st = v2([], {}, { worn: {} });
    const r = stashOn(st, CAREN, helmet({ 'DEF%': 2, CHC: 2 }), '2026-10-06');
    expect(r.st.pools[CAREN]).toEqual(['p1']);
    expect(r.st.pieces.p1).toMatchObject({ at: '2026-10-06', bt: null, lit: { 'DEF%': 2, CHC: 2 } });
    expect(isWorn(r.st, CAREN, r.st.pieces.p1)).toBe(false);
    expect(undoPut(r.st, CAREN, r).pools[CAREN] ?? []).toEqual([]);
  });
});
