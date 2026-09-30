// Экипировка (logic/gear, logic/gearStore, операции logic/pool): вещи у персонажа (хранилище v2), перенос v1 → v2,
// сегменты после Reforge, Breakthrough, резервная копия, «Надеть», «Убрать», отметки и «Вернуть».
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { makeCtx } from '../src/logic/context';
import {
  addFourth, buildKey, EMPTY_GEAR, gc, gearedChars, newPiece, reforgeScale, reforgesDone, replaceStat, samePiece, setYellow, tapSegment,
  updatePiece, type GearStore, type Piece,
} from '../src/logic/gear';
import { decodeGear, encodeGear, fuseChar, newerGear, restoreGear, unfuseChar } from '../src/logic/gearStore';
import { planFor, planPut, poolView, putOn, removeEverywhere, removeFrom, setMark, undoPut, undoRemove } from '../src/logic/pool';
import type { ItemInput } from '../src/logic/verdict';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
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
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...extra });

describe('перенос v1 → v2 (design-final §F)', () => {
  it('1. одна запись в нескольких билдах персонажа — один id в его пуле; билды с вещами — «Собираю»', () => {
    const p1 = rec('p1', helmet({ CHC: 2 }));
    const st = restoreGear(v1([p1], { [K]: { helmet: 'p1' }, [K2]: { helmet: 'p1' } }), idx);
    expect(st).toMatchObject({ v: 2, pools: { [CAREN]: ['p1'] }, marks: { [K]: 'want', [K2]: 'want' } });
    expect(st.pieces.p1).toEqual(p1);
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

  it('4. билд, которого нет в данных (переименовали), — вещи в пул, без отметки; прежние билды — в v1builds', () => {
    const old = buildKey(CAREN, 'Speed (old)');
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 2 }))], { [old]: { helmet: 'p1' } }), idx);
    expect(st.pools).toEqual({ [CAREN]: ['p1'] });
    expect(st.marks ?? {}).toEqual({});
    expect(st.v1builds).toEqual({ [old]: { slots: { helmet: 'p1' }, at: '' } });
  });

  it('4b. билд с несколькими связками — отметка на билде целиком (все варианты)', () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const key = buildKey(anarky.id, 'Defense mix');
    const st = restoreGear(v1([rec('p1', { ...helmet({ CHC: 1 }), setId: set('Defense') })], { [key]: { helmet: 'p1' } }), idx);
    expect(st.marks).toEqual({ [key]: 'want' });
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

  it('незнакомые поля хранилища и вещи переживают перенос, «Надеть» и код копии; пустой билд примерки v1 — в v1builds', () => {
    const raw = { ...v1([rec('p1', helmet({ CHC: 2 }), 1)], { [K]: { helmet: 'p1' } }, { note: 'x' }), builds: { [K]: { slots: { helmet: 'p1' }, at: '', tryon: true } } };
    (raw.pieces.p1 as unknown as Record<string, unknown>).enh = 15;
    const st = putOn(ctx, restoreGear(raw, idx), CAREN, { ...helmet({ SPD: 1 }), slot: 'armor' }).st;
    const back = decodeGear(encodeGear(st), idx) as GearStore;
    expect(back).toMatchObject({ note: 'x', pieces: { p1: { enh: 15 } }, v1builds: { [K]: { tryon: true } } });
  });

  it('ни одна вещь не теряется: каждая вещь v1 — в каком-то пуле', () => {
    const pieces = [rec('p1', helmet({ CHC: 1 })), rec('p2', { ...helmet({ SPD: 1 }), slot: 'armor' }), rec('p3', { ...helmet({ CHD: 1 }), slot: 'gloves' })];
    const st = restoreGear(v1(pieces, { [K]: { helmet: 'p1', armor: 'p2' }, [buildKey(KAPPA, 'Speed')]: { gloves: 'p3', helmet: 'p1' } }), idx);
    expect(Object.keys(st.pieces).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(new Set(Object.values(st.pools).flat())).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('autoNew — варианты, которые собираются сами, а в v1 не были начаты', () => {
    const four = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => rec('p' + (i + 1), { ...helmet({ CHC: 1 }), slot: slot as Piece['slot'] }));
    const st = restoreGear(v1(four, { [K]: Object.fromEntries(four.map((p) => [p.slot, p.id])) }), idx);
    expect(st.autoNew).toEqual([K2]); // Speed ×2 собран — Speed/Immu собирается сам
  });

  // правило владельца 2026-09-30 (было: вещи X сливались к Core Fusion X): у Core Fusion свои вещи — вещи X убраны
  it('Core Fusion: вещи у X и у Core Fusion X — у Core Fusion его вещи, вещи X убраны (logic/fusion)', () => {
    const [eternal, cf] = ['Eternal', 'Core Fusion Eternal'].map((n) => D.chars.find((c) => c.name === n)!);
    const st = restoreGear(v1([rec('p1', helmet({ CHC: 1 })), rec('p2', helmet({ CHD: 1 }))], { [`${eternal.id}/Speed`]: { helmet: 'p1' }, [`${cf.id}/Speed`]: { helmet: 'p2' } }), idx);
    expect(st.pools).toEqual({ [cf.id]: ['p2'] });
  });
});

describe('хранилище v2 и код копии', () => {
  it('v2: id без вещей и повторы выброшены, пустые пулы убраны, неверные отметки — тоже; незнакомые поля — как есть', () => {
    const raw = { ...v2([rec('p1', helmet({ CHC: 1 }))], { [CAREN]: ['p1', 'p1', 'p9'], [KAPPA]: ['p9'], x: 'no' as never }), marks: { [K]: 'want', [K2]: 'maybe' }, extra: 1 };
    expect(restoreGear(raw, idx)).toEqual({ v: 2, seq: 1, pieces: raw.pieces, pools: { [CAREN]: ['p1'] }, marks: { [K]: 'want' }, extra: 1 });
  });

  it('gc: вещь, которой нет ни в одном пуле, стирается', () => {
    const st = gc(v2([rec('p1', helmet({ CHC: 1 })), rec('p2', helmet({ CHD: 1 }))], { [CAREN]: ['p1'] }));
    expect(Object.keys(st.pieces)).toEqual(['p1']);
  });

  it('v: 3 — «новее» и пусто; v: 1 и v: 2 — не новее; мусор — пусто', () => {
    expect(newerGear({ v: 3 })).toBe(true);
    expect(newerGear({ v: 2 })).toBe(false);
    expect(restoreGear({ v: 3, pieces: {}, pools: {} }, idx)).toEqual(EMPTY_GEAR);
    expect(restoreGear('x', idx)).toEqual(EMPTY_GEAR);
  });

  it('код: OGC-GEAR2 туда и обратно; OGC-GEAR1 — переносится; OGC-GEAR3 и внутри v: 3 — «новее»; пустой и чужой — нет', () => {
    const st = v2([rec('p1', helmet({ CHC: 2 }))], { [CAREN]: ['p1'] });
    const code = encodeGear(st);
    expect(code.startsWith('OGC-GEAR2 ')).toBe(true);
    expect(decodeGear(code, idx)).toEqual(st);
    const b64 = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeGear('OGC-GEAR1 ' + b64(v1([rec('p1', helmet({ CHC: 2 }))], { [K]: { helmet: 'p1' } })), idx)).toMatchObject({ v: 2, pools: { [CAREN]: ['p1'] } });
    expect(decodeGear('OGC-GEAR3 ' + b64({ v: 3 }), idx)).toBe('newer');
    expect(decodeGear('OGC-GEAR2 ' + b64({ v: 3, pieces: {}, pools: {} }), idx)).toBe('newer');
    expect(decodeGear(encodeGear(EMPTY_GEAR), idx)).toBeNull(); // пустая копия не затирает записи
    expect(decodeGear('OGC-GEAR2 !!!', idx)).toBeNull();
    expect(decodeGear('SPD, CHC', idx)).toBeNull();
  });

  it('gearedChars — по пулам', () => {
    expect([...gearedChars(v2([rec('p1', helmet({ CHC: 1 }))], { [CAREN]: ['p1'] }))]).toEqual([[CAREN, 1]]);
  });
});

describe('«Надеть», «Убрать», отметки и «Вернуть»', () => {
  const four = (): GearStore => {
    const ps = ['helmet', 'armor', 'gloves', 'shoes'].map((slot, i) => rec('p' + (i + 1), { ...helmet({ RES: 1 }), slot: slot as Piece['slot'] }));
    return v2(ps, { [CAREN]: ps.map((p) => p.id) });
  };

  it('новая запись: жёлтые из оценки, Breakthrough не указан, seq + 1; такая же уже есть — ничего', () => {
    const r = putOn(ctx, EMPTY_GEAR, CAREN, helmet({ 'DEF%': 2, CHC: 2 }), { at: '2026-09-28' });
    expect(r).toMatchObject({ added: true, id: 'p1', removed: [], piece: { yellow: { 'DEF%': 2, CHC: 2 }, lit: { 'DEF%': 2, CHC: 2 }, bt: null, at: '2026-09-28' } });
    expect(r.st).toMatchObject({ seq: 1, pools: { [CAREN]: ['p1'] } });
    expect(putOn(ctx, r.st, CAREN, helmet({ 'DEF%': 2, CHC: 2 }))).toMatchObject({ added: false, id: 'p1' });
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

  it('та же запись у другого («Она же — и у Kappa», «Отдать Kappa»): id тот же, seq не растёт; Reforge и Breakthrough — общие', () => {
    const a = putOn(ctx, EMPTY_GEAR, CAREN, helmet({ CHC: 2 }));
    const b = putOn(ctx, a.st, KAPPA, helmet({ CHC: 2 }), { record: a.piece });
    expect(b).toMatchObject({ added: true, id: a.id, shared: [CAREN] });
    expect(b.st.seq).toBe(1);
    expect(updatePiece(b.st, a.id, { bt: 4 }).pieces[a.id].bt).toBe(4);
    // «Другая — своя» — новая запись
    expect(putOn(ctx, a.st, KAPPA, helmet({ CHC: 2 })).id).toBe('p2');
  });

  it('«Отдать» записи, которую gc уже стёр, — запись возвращается', () => {
    const p = rec('p1', helmet({ CHC: 2 }), 3);
    const r = putOn(ctx, EMPTY_GEAR, KAPPA, helmet({ CHC: 2 }), { record: p });
    expect(r.st.pieces.p1).toEqual(p);
  });

  it('начинает билд, который не собирался: «Собираю» для него; «Вернуть» снимает отметку', () => {
    // у Caren собран Speed ×4 (Speed/Immu — «Не собираю») и Immunity-шлем без дела; вторая Immunity собирает Immunity ×2
    // в Def/Immu, а в Speed не встаёт — Def/Immu «Собираю»
    const st0 = four();
    const st = { ...st0, pieces: { ...st0.pieces, p5: rec('p5', { ...helmet({ RES: 1 }), setId: set('Immunity') }) }, pools: { [CAREN]: ['p1', 'p2', 'p3', 'p4', 'p5'] }, marks: { [K]: 'want' as const, [K2]: 'skip' as const } };
    const r = putOn(ctx, st, CAREN, { ...helmet({ RES: 1 }), slot: 'armor', setId: set('Immunity') });
    expect(r.marks).toEqual([buildKey(CAREN, 'Def/Immu')]);
    expect(r.st.marks).toMatchObject({ [buildKey(CAREN, 'Def/Immu')]: 'want' });
    expect(undoPut(r.st, CAREN, r).marks).toEqual({ [K]: 'want', [K2]: 'skip' });
  });

  it('«Убрать у Caren» — только у неё; «Разобрал — убрать у всех» — у всех; «Вернуть» — обратно', () => {
    const st = v2([rec('p1', helmet({ CHC: 2 }))], { [CAREN]: ['p1'], [KAPPA]: ['p1'] });
    expect(removeFrom(st, CAREN, 'p1').pools).toEqual({ [KAPPA]: ['p1'] });
    const all = removeEverywhere(st, 'p1');
    expect(all).toMatchObject({ pools: {}, pieces: {} });
    expect(undoRemove(all, st.pieces.p1, [CAREN, KAPPA])).toMatchObject({ pools: { [CAREN]: ['p1'], [KAPPA]: ['p1'] }, pieces: { p1: st.pieces.p1 } });
  });

  it('отметка: поставить, заменить, снять', () => {
    const st = setMark(setMark(EMPTY_GEAR, K, 'want'), K2, 'skip');
    expect(st.marks).toEqual({ [K]: 'want', [K2]: 'skip' });
    expect(setMark(st, K, null).marks).toEqual({ [K2]: 'skip' });
  });

  it('Core Fusion попал в ростер — вещи X переходят к нему; «Вернуть» — обратно', () => {
    const st = v2([rec('p1', helmet({ CHC: 1 })), rec('p2', helmet({ CHD: 1 }))], { '2000043': ['p1'], '2700043': ['p2'] });
    const f = fuseChar(st, '2000043', '2700043');
    expect(f.st.pools).toEqual({ '2700043': ['p2', 'p1'] });
    expect(unfuseChar(f.st, '2000043', '2700043', f).pools).toEqual({ '2700043': ['p2'], '2000043': ['p1'] });
  });
});

describe('«Надеть»: что уходит из пула (Р7)', () => {
  // Р7: только вещь того слота, куда встала новая, и только если её больше нет ни в одной собираемой сборке.
  // Остальные ставшие ненужными остаются: на карточке «больше не нужна» и «Убрать у Caren»
  const JUNK = { RES: 1, EFF: 1, HP: 1, ATK: 1 }, STRONG = { 'DEF%': 6, CHC: 6, CHD: 6, SPD: 6 };
  const A = (slot: Piece['slot'], s: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs });
  const pool = (ps: Piece[], who = CAREN) => v2(ps, { [who]: ps.map((p) => p.id) });
  const short = (p: Piece) => `${p.slot}:${idx.SET[p.setId!].short}`;
  // слабый Speed-шлем, сильный Attack-шлем, Speed-броня и Speed-перчатки: новые Speed-ботинки в пустой слот — сборка
  // Speed берёт Attack-шлем (Speed ×3 и без него), Speed-шлем ни в одной сборке
  const helmets = () => [rec('p1', A('helmet', 'Speed', JUNK)), rec('p2', A('helmet', 'Attack', STRONG)), rec('p3', A('armor', 'Speed', JUNK)), rec('p4', A('gloves', 'Speed', JUNK))];
  const SHOES = A('shoes', 'Speed', { CHC: 3, CHD: 2, 'DEF%': 1, HP: 1 });

  it('вещь другого слота не убирается, даже если стала ненужной: она в пуле и «больше не нужна»', () => {
    // Immunity-броня и Defense-броня: все билды по одной вещи — собираются все ближайшие. Immunity-ботинки собирают
    // Immunity ×2 — Def больше не ближе всех, Defense-броне места нет
    const r = putOn(ctx, pool([rec('p1', A('armor', 'Immunity', JUNK)), rec('p2', A('armor', 'Defense', JUNK))]), CAREN, A('shoes', 'Immunity', JUNK));
    expect(r.removed).toEqual([]);
    expect(r.st.pools[CAREN]).toContain('p2');
    expect(poolView(ctx, r.st).of(CAREN)!.unused.map((p) => p.id)).toEqual(['p2']);
  });

  it('Р1: слабый Speed-шлем, который раскладка Speed отдала сильному Attack-шлему, — в пуле нужен: Speed ×4 собирается из пула', () => {
    const r = putOn(ctx, pool(helmets()), CAREN, SHOES);
    expect(r.removed).toEqual([]);
    expect(poolView(ctx, r.st).of(CAREN)!.unused).toEqual([]);
  });

  it('убирается только вещь её слота: Attack-ботинки уходят, Speed-шлем остаётся', () => {
    const r = putOn(ctx, pool([...helmets(), rec('p5', A('shoes', 'Attack', { CHC: 2, HP: 1, EFF: 1, RES: 1 }))]), CAREN, SHOES);
    expect(r.removed.map(short)).toEqual(['shoes:Attack']);
    expect(r.st.pools[CAREN]).toEqual(['p1', 'p2', 'p3', 'p4', 'p6']);
  });

  it('две вещи её слота стояли в разных сборках и больше нигде — уходят обе; «Вернуть» — обе обратно', () => {
    // Def: три Defense-вещи + Attack-ботинки не по связке; Def/Immu: Defense ×2 + слабые Immunity-ботинки. Сильные
    // Immunity-ботинки лучше обеих: в Def — вместо Attack, в Def/Immu — вместо слабой Immunity
    const ps = [
      rec('p1', A('helmet', 'Defense', { 'DEF%': 2, CHC: 2 })), rec('p2', A('armor', 'Defense', { 'DEF%': 2, CHC: 2 })),
      rec('p3', A('gloves', 'Defense', { 'DEF%': 2, CHC: 2 })), rec('p4', A('shoes', 'Attack', { 'DEF%': 2, CHC: 2 })),
      rec('p5', A('shoes', 'Immunity', JUNK)),
    ];
    const st = pool(ps);
    const r = putOn(ctx, st, CAREN, A('shoes', 'Immunity', STRONG));
    expect(r.removed.map(short)).toEqual(['shoes:Attack', 'shoes:Immunity']);
    expect(undoPut(r.st, CAREN, r).pools[CAREN].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('Р1: сильные Immunity-ботинки ломают Speed ×2 ради статов — Speed-ботинки остаются: Speed/Immu собирается из пула', () => {
    const ps = [
      rec('p1', A('helmet', 'Immunity', { 'DEF%': 2, CHC: 2 })), rec('p2', A('armor', 'Immunity', { 'DEF%': 2, CHC: 2 })),
      rec('p3', A('gloves', 'Speed', { 'DEF%': 2, CHC: 2 }), 4), rec('p4', A('shoes', 'Speed', JUNK), 4),
    ];
    const r = putOn(ctx, pool(ps), CAREN, A('shoes', 'Immunity', STRONG));
    expect(r.removed).toEqual([]);
    expect(poolView(ctx, r.st).of(CAREN)!.unused).toEqual([]);
  });

  it('Pen mix у Luna: 4-я Pen-вещь в ботинки — раскладка берёт Pen ×4, но Attack-вещи остаются: Pen ×2 + Attack ×2 собирается из пула (Р1)', () => {
    const luna = D.chars.find((c) => c.name === 'Demiurge Luna')!.id;
    const good = { 'ATK%': 3, CHC: 3, CHD: 3, SPD: 2 }, meh = { 'ATK%': 2, CHC: 1, CHD: 1, SPD: 1 };
    const ps = [rec('p1', A('helmet', 'Penetration', meh)), rec('p2', A('armor', 'Penetration', meh)), rec('p3', A('gloves', 'Penetration', meh)),
      rec('p4', A('gloves', 'Attack', good)), rec('p5', A('shoes', 'Attack', good))];
    const r = putOn(ctx, pool(ps, luna), luna, A('shoes', 'Penetration', meh));
    expect(r.removed).toEqual([]);
    expect(poolView(ctx, r.st).of(luna)!.unused).toEqual([]);
  });

  it('planPut — то же, что уберёт и отметит «Надеть», без записи', () => {
    const st = pool([...helmets(), rec('p5', A('shoes', 'Attack', { CHC: 2, HP: 1, EFF: 1, RES: 1 }))]);
    const { piece } = newPiece(st, SHOES, '');
    const plan = planPut(ctx, idx.CHAR[CAREN], Object.values(st.pieces), piece);
    const r = putOn(ctx, st, CAREN, SHOES);
    expect({ removed: plan.removed.map((p) => p.id), marks: plan.marks }).toEqual({ removed: r.removed.map((p) => p.id), marks: r.marks });
  });

  // подпись кнопки (poolVs replaces) — planFor по виду пула; должна совпасть с тем, что сделает putOn (находка 5)
  const same = (st: GearStore, who: string, x: ItemInput, tryOn: string | null = null) => {
    const plan = planFor(ctx, poolView(ctx, st, tryOn), who, x)!;
    const r = putOn(ctx, st, who, x, { tryOn });
    return [{ removed: plan.removed.map((p) => p.id), marks: plan.marks }, { removed: r.removed.map((p) => p.id), marks: r.marks }];
  };
  const eternal = '2000043', cfEternal = '2700043';
  it.each([
    ['пустой слот, ненужная вещь другого слота', () => same(pool(helmets()), CAREN, SHOES)],
    ['две вещи её слота', () => same(pool([...helmets(), rec('p5', A('shoes', 'Attack', { CHC: 2, HP: 1, EFF: 1, RES: 1 }))]), CAREN, SHOES)],
    ['Eternal, 4 Attack: Speed-шлем начнёт Speed', () => same(pool(['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => rec('e' + i, A(sl as Piece['slot'], 'Attack', { SPD: 3, EFF: 2, CHC: 2 }))), eternal), eternal, A('helmet', 'Speed', { SPD: 1, HP: 1, RES: 1, DEF: 1 }))],
    ['Core Fusion Eternal, 4 Effectiveness', () => same(pool(['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => rec('e' + i, A(sl as Piece['slot'], 'Effectiveness', { SPD: 2, EFF: 2, CHC: 1, HP: 1 }))), cfEternal), cfEternal, A('helmet', 'Speed', { SPD: 3, EFF: 2, CHC: 2, 'ATK%': 1 }))],
    ['в примерке Def', () => same(pool([...['helmet', 'armor', 'gloves', 'shoes'].map((sl, i) => rec('s' + i, A(sl as Piece['slot'], 'Speed', { CHC: 2, CHD: 2, 'DEF%': 1, HP: 1 }))), rec('d1', A('helmet', 'Defense', { HP: 1, RES: 1 }))]), CAREN, A('helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }), buildKey(CAREN, 'Def'))],
  ])('planFor — то же, что сделает putOn: %s', (_, run) => {
    const [plan, put] = run();
    expect(plan).toEqual(put);
  });
});

describe('«Надеть»: вариант, где она встала, с ней перестаёт собираться сам', () => {
  // Gnosis Domine: Def-шлем и Def-ботинки на T4, Immunity- и Patience-перчатки — собраны Def ×2 в Pen Def и Pen Immu.
  // Pen-ботинки в Pen Def — «сет 3 из 4» вместо Def-ботинок, но Def ×2 там распадается, и ближе всех — Pen Immu
  const GNOSIS = '2000112';
  const A = (slot: Piece['slot'], s: string): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs: { CHC: 1 } });
  const ps = [rec('p1', A('helmet', 'Defense'), 4), rec('p2', A('gloves', 'Immunity'), 4), rec('p3', A('gloves', 'Patience')), rec('p4', A('shoes', 'Defense'), 4)];
  const st = v2(ps, { [GNOSIS]: ps.map((p) => p.id) });
  const PEN = { ...A('shoes', 'Penetration'), subs: { HP: 1, CHC: 1, RES: 4, EFF: 3 } };

  // было: отметки нет, Pen Def выпадал из «собираешь», и новые ботинки сразу «больше не нужна»
  it('Pen Def — «Собираю»', () => {
    expect(putOn(ctx, st, GNOSIS, PEN).marks).toEqual([buildKey(GNOSIS, 'Pen Def')]);
  });

  it('новые ботинки не «ненужные»', () => {
    const r = putOn(ctx, st, GNOSIS, PEN);
    expect(poolView(ctx, r.st).of(GNOSIS)!.unused.map((p) => p.id)).not.toContain(r.id);
  });
});

describe('«Надеть» в примерке', () => {
  // у Caren собран Speed ×4; старый Defense-шлем ни в одном билде. Примерка Def — в ней он стоит; новый Defense-шлем лучше
  const A = (slot: Piece['slot'], s: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId: set(s), itemKey: null, main: null, subs });
  const mid = { CHC: 2, CHD: 2, 'DEF%': 1, HP: 1 };
  const pcs = [...(['helmet', 'armor', 'gloves', 'shoes'] as const).map((sl, i) => rec('p' + (i + 1), A(sl, 'Speed', mid))), rec('p5', A('helmet', 'Defense', { HP: 1, RES: 1 }))];
  const st = v2(pcs, { [CAREN]: pcs.map((p) => p.id) });
  const DEF = A('helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
  const K3 = buildKey(CAREN, 'Def');

  // было: вещь встала только в цель примерки — «Собираю» не ставилось, и после примерки новый шлем «больше не нужна»
  it('встала только в цель примерки — цель становится «Собираю»', () => {
    const r = putOn(ctx, st, CAREN, DEF, { tryOn: K3 });
    expect(r.marks).toEqual([K3]);
  });

  it('после конца примерки новый шлем не «ненужный»: Def собирается по отметке', () => {
    const r = putOn(ctx, st, CAREN, DEF, { tryOn: K3 });
    expect(poolView(ctx, r.st).of(CAREN)!.unused).toEqual([]);
  });

  // было: «Вернуть» снимало отметку совсем — «Не собираю» пропадало
  it('у цели «Не собираю»: «Надеть» ставит «Собираю», «Вернуть» — хранилище как до «Надеть», отметки байт в байт', () => {
    const skip: GearStore = { ...st, marks: { [K3]: 'skip' } };
    const r = putOn(ctx, skip, CAREN, DEF, { tryOn: K3 });
    const back = undoPut(r.st, CAREN, r);
    // seq не откатывается (как всегда у «Вернуть»): номер вещи не переиспользуется
    expect({ put: r.st.marks, back: JSON.stringify(back.marks), st: { ...back, seq: 0 } }).toEqual({ put: { [K3]: 'want' }, back: JSON.stringify(skip.marks), st: { ...skip, seq: 0 } });
  });

  it('встала и в собираемый без примерки вариант — отметки нет', () => {
    // Immunity-шлем в примерке Def/Immu встаёт и в Speed/Immu, который собирается сам (Speed ×2 из четырёх Speed)
    const r = putOn(ctx, st, CAREN, A('helmet', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }), { tryOn: buildKey(CAREN, 'Def/Immu') });
    expect(r.marks).toEqual([]);
  });
});

describe('сегменты и Reforge', () => {
  const base = newPiece(EMPTY_GEAR, helmet({ 'DEF%': 2, CHC: 1 })).piece;

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
    const epic = newPiece(EMPTY_GEAR, helmet({ ATK: 1, SPD: 3, 'DMG RED%': 3 }, 'rare')).piece;
    const reforged = { ...epic, ...addFourth(epic, 'DEF%') };
    expect(reforgesDone(reforged)).toBe(1);
    expect(reforgesDone({ ...reforged, lit: { ATK: 3, SPD: 4, 'DMG RED%': 3, 'DEF%': 3 } })).toBe(6);
  });

  it('Transistone сменил стат — сегменты переезжают к новому', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(replaceStat(p1, 'CHC', 'CHD')).toEqual({ yellow: { 'DEF%': 2, CHD: 1 }, lit: { 'DEF%': 4, CHD: 1 } });
  });

  it('жёлтые можно поднять (опечатка при вводе) — оранжевые остаются; горящих не больше 6', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(setYellow(p1, 'DEF%', 3)).toMatchObject({ yellow: { 'DEF%': 3 }, lit: { 'DEF%': 5 } });
    expect(setYellow(p1, 'CHC', 3)).toMatchObject({ yellow: { CHC: 3 }, lit: { CHC: 3 } });
    expect(reforgesDone({ ...p1, ...setYellow(p1, 'CHC', 3) })).toBe(2);
  });

  it('оранжевых не больше, чем Reforge бывает: Legendary — 9 (Singularity), Epic с 4-м — 5, Epic без 4-го — 0', () => {
    const tapAll = (p: Piece) => ['DEF%', 'CHC', 'CHD', 'SPD'].filter((k) => k in p.yellow).reduce((q, k) => ({ ...q, ...tapSegment(q, k, 6) }), p);
    const leg = tapAll(newPiece(EMPTY_GEAR, helmet({ 'DEF%': 1, CHC: 1, CHD: 1, SPD: 1 })).piece);
    expect(leg.lit).toEqual({ 'DEF%': 6, CHC: 5, CHD: 1, SPD: 1 });
    expect(reforgeScale(leg)).toEqual({ done: 9, of: 9 });
    const epic4 = tapAll(newPiece(EMPTY_GEAR, helmet({ 'DEF%': 1, CHC: 1, CHD: 1, SPD: 1 }, 'rare')).piece);
    expect(reforgeScale(epic4)).toEqual({ done: 6, of: 6 });
    const epic3 = newPiece(EMPTY_GEAR, helmet({ 'DEF%': 1, CHC: 1, CHD: 1 }, 'rare')).piece;
    expect(tapSegment(epic3, 'DEF%', 3).lit['DEF%']).toBe(1);
    expect(tapSegment(leg, 'CHC', 5).lit.CHC).toBe(4);
  });

  it('Transistone: новый стат со своими жёлтыми, оранжевые старого — с ним; на стат, который уже есть, — ничего', () => {
    const p1 = { ...base, lit: { 'DEF%': 4, CHC: 1 } };
    expect(setYellow(replaceStat(p1, 'DEF%', 'CHD'), 'CHD', 1)).toEqual({ yellow: { CHD: 1, CHC: 1 }, lit: { CHD: 3, CHC: 1 } });
    expect(replaceStat(p1, 'DEF%', 'CHC')).toEqual({ yellow: p1.yellow, lit: p1.lit });
  });
});

describe('та же вещь', () => {
  it('по слоту, грейду, сету, main и жёлтым сегментам', () => {
    const p = newPiece(EMPTY_GEAR, helmet({ CHC: 2, CHD: 1 })).piece;
    expect(samePiece(helmet({ CHC: 2, CHD: 1 }), p)).toBe(true);
    expect(samePiece(helmet({ CHC: 2, CHD: 2 }), p)).toBe(false);
    expect(samePiece(helmet({ CHC: 2, CHD: 1 }, 'rare'), p)).toBe(false);
    expect(samePiece({ ...helmet({ CHC: 2, CHD: 1 }), setId: set('Attack') }, p)).toBe(false);
  });
});
