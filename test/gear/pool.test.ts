// Пул экипировки (features/gear/pool): вид пула и ненужные вещи, «Примерить замену» (replace), оружие не для класса героя,
// «Дальше: {слот}». Что держит пул и почему — test/gear/layout.test.ts, verdict.test.ts; старый движок («собираешь», сборка вариантов)
// удалён на этапе 7 .x/0085.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { EMPTY_GEAR, type GearStore, type Piece } from '@/features/gear/model/gear';
import type { Bt } from '@/game/item/item';
import { poolView, putOn, undoPut, type PoolStore } from '@/features/gear/pool';
import { charVs, nextToWear } from '@/features/gear/model/poolVs';
import type { PoolView } from '@/features/gear/pool';
import { slotMains } from '@/game/build/builds';
import type { Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';
import { fit } from '@/features/gear/model/vs';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const caren = char('Caren'); // DEF › CHC › CHD › SPD › DMG UP%

let seq = 0;
// вещь брони: lit — уровень сабстатов (сколько горит), yellow — тот же
const P = (slot: SlotId, short: string | null, lit: Subs, bt: Bt | null = null, grade: Piece['grade'] = 'unique'): Piece =>
  ({ id: 'p' + ++seq, slot, grade, setId: short ? set(short) : null, itemKey: null, main: null, yellow: lit, lit, bt, at: '' });
const JUNK = { RES: 1, EFF: 1, HP: 1 };
const GOOD = { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 };

describe('вид пула и ненужные вещи', () => {
  it('ненужная — та, что не стоит ни в одной собираемой сборке; вид считает персонажа один раз', () => {
    const weak = P('helmet', 'Speed', JUNK), strong = P('helmet', 'Speed', GOOD), gloves = P('gloves', 'Speed', JUNK);
    const st: PoolStore = { pieces: Object.fromEntries([weak, strong, gloves].map((p) => [p.id, p])), pools: { [caren.id]: [weak.id, strong.id, gloves.id, 'нет-такой'] } };
    const view = poolView(ctx, st);
    const cp = view.of(caren.id)!;
    expect(cp.pieces).toHaveLength(3);
    expect(cp.unused.map((p) => p.id)).toEqual([weak.id]);
    expect(view.of(caren.id)).toBe(cp);
    expect(view.of('нет-такого')).toBeNull();
  });
});

// Шаг 6 «Оценка — единственный ввод»: «Примерить замену» → режим героя с TryOn.replace (решение владельца «заменить
// в любом случае» — (а)): кнопка «Заменить» всегда, «Надеть» убирает эту запись, лучше новая или хуже
describe('режим героя с replace: «Надеть» заменяет эту запись', () => {
  const store = (pieces: Piece[]): GearStore =>
    ({ ...EMPTY_GEAR, seq: pieces.length + 100, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [caren.id]: pieces.map((p) => p.id) } });
  // Transistone: у Caren Speed-шлем A (EFF) на T4; в игре EFF перебросили в CHC — A′ введён заново, слабее A
  const pieces = () => [
    P('helmet', 'Speed', { 'DEF%': 4, CHD: 3, SPD: 2, EFF: 2 }, 4), P('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
    P('gloves', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }, 4),
  ];
  const A2: ItemInput = { slot: 'helmet', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, subs: { 'DEF%': 2, CHD: 2, SPD: 1, CHC: 1 }, bt: 0 };
  const vsOf = (st: GearStore, replace?: string) => charVs(ctx, poolView(ctx, st), caren.id, A2, { replace })!;

  it('без replace A′ хуже A: кнопки нет', () => {
    expect(vsOf(store(pieces())).useful).toBe(false);
  });

  it('с replace = A — кнопка «Заменить» есть (Р4 не действует)', () => {
    const ps = pieces();
    const cv = vsOf(store(ps), ps[0].id);
    expect({ useful: cv.useful, replaces: cv.replaces }).toEqual({ useful: true, replaces: true });
  });

  it('«Надеть» с replace — A убран, A′ в пуле', () => {
    const ps = pieces();
    const r = putOn(ctx, store(ps), caren.id, A2, { replace: ps[0].id });
    expect({ removed: r.removed.map((p) => p.id), pool: r.st.pools[caren.id] }).toEqual({ removed: [ps[0].id], pool: [ps[1].id, ps[2].id, r.id] });
  });

  it('«Вернуть» — хранилище как до «Надеть»: A на прежнем месте, запись та же', () => {
    const st = store(pieces());
    const r = putOn(ctx, st, caren.id, A2, { replace: st.pools[caren.id][0] });
    const back = undoPut(r.st, caren.id, r);
    expect({ pools: back.pools, pieces: back.pieces }).toEqual({ pools: st.pools, pieces: st.pieces });
  });

  it.each([
    ['чужой id (запись другого героя)', (_ps: Piece[], st: GearStore) => {
      const rin = char('Rin');
      const other = P('helmet', 'Speed', GOOD);
      return { st: { ...st, pieces: { ...st.pieces, [other.id]: other }, pools: { ...st.pools, [rin.id]: [other.id] } }, id: other.id };
    }],
    ['уже убранный id', (ps: Piece[], st: GearStore) => ({ st: { ...st, pools: { [caren.id]: st.pools[caren.id].filter((x) => x !== ps[0].id) } }, id: ps[0].id })],
    ['запись другого слота', (ps: Piece[], st: GearStore) => ({ st, id: ps[1].id })],
  ])('replace — %s: как без replace', (_, make) => {
    const ps = pieces();
    const { st, id } = make(ps, store(ps));
    const plain = vsOf(st), rep = vsOf(st, id);
    expect({ useful: rep.useful, replaces: rep.replaces }).toEqual({ useful: plain.useful, replaces: plain.replaces });
    expect(putOn(ctx, st, caren.id, A2, { replace: id }).removed).toEqual(putOn(ctx, st, caren.id, A2).removed);
  });

  it('A′ лучше A: с replace убирается A и вытесненное по В1, как без replace', () => {
    const ps = pieces();
    const better: ItemInput = { ...A2, subs: { 'DEF%': 5, CHD: 4, SPD: 3, CHC: 4 }, bt: 4 };
    const st = store(ps);
    const plain = putOn(ctx, st, caren.id, better), rep = putOn(ctx, st, caren.id, better, { replace: ps[0].id });
    expect(plain.removed.map((p) => p.id)).toEqual([ps[0].id]);
    expect(rep.removed.map((p) => p.id)).toEqual([ps[0].id]);
  });
});

describe('оружие не для класса героя (classLimits)', () => {
  const aer = char('Aer');   // Striker; билды просят ATK% в оружии — Mage-оружие с ATK% было бы «временным»
  const ame = char('Ame');   // Mage; Thumping Odyssey — в списке её билдов
  const mageOnly = D.weapons.find((w) => w.name === 'Thumping Odyssey')!;
  const X: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: mageOnly.key, main: 'ATK%', unlisted: false, subs: { ATK: 2, CHC: 2, CHD: 1, SPD: 1 } };

  it('данные: Thumping Odyssey — только Mage, Aer — Striker, Ame — Mage', () => {
    expect([mageOnly.classLimits, aer.class, ame.class]).toEqual([['mage'], 'striker', 'mage']);
  });

  it('fit — «нет» у каждого билда Aer, хотя main ATK% его билдам нужен', () => {
    expect(aer.builds.map((b) => fit(ctx, aer, b, X))).toEqual(aer.builds.map(() => 'no'));
    expect(aer.builds.every((b) => slotMains(b, 'weapon').has('ATK%'))).toBe(true);
  });
});

// «Дальше: {слот}» (шаг 5 «Надето»): первый ненадетый слот после слота формы, по кругу; слот формы надет — нет
describe('nextToWear', () => {
  const viewOf = (on: SlotId[]) => ({
    of: () => ({ pieces: on.map((slot, i) => ({ id: 'w' + i, slot })), worn: new Set(on.map((_, i) => 'w' + i)) }),
  }) as unknown as PoolView;

  it('после ботинок — по кругу к первому ненадетому: оружие надето — аксессуар', () => {
    expect(nextToWear(viewOf(['weapon']), 'c', 'shoes')).toBe('accessory');
  });

  it('слот формы надет — null', () => {
    expect(nextToWear(viewOf(['helmet']), 'c', 'helmet')).toBeNull();
  });

  it('все прочие надеты — null', () => {
    expect(nextToWear(viewOf(['weapon', 'accessory', 'armor', 'gloves', 'shoes']), 'c', 'helmet')).toBeNull();
  });

  it('героя нет в виде — следующий по порядку', () => {
    expect(nextToWear({ of: () => null } as unknown as PoolView, 'c', 'weapon')).toBe('accessory');
  });
});
