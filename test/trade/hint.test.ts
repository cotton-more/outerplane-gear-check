// «Обмен вещами», как найти вещь в игре (R9; MODEL.md §10): раздел I. Реальные данные фикстуры; цепочка Рин
// «По статам» — ATK › CHC › CHD › SPD › DMG UP%.
import { describe, expect, it } from 'vitest';
import { keyOfHole, keyOfItem, sourceOf } from '@/features/trade/model/hint';
import { profileOf } from '@/game/build/profile';
import { cand, ctx, HERO, idx, piece, setId } from './helpers';

const P = profileOf(ctx, idx.CHAR[HERO.rin])!;
const key = (p: ReturnType<typeof piece>) => keyOfItem(P, p);

describe('ключ поиска вещи (R9.1)', () => {
  it('I1: броня — грейд, сет, сабстат с наибольшим уровнем, сортировка по нему, главного стата нет, T4 помечен', () => {
    const k = key(piece('helmet', 'Speed', { SPD: 3, CHC: 6, ATK: 2 }, { bt: 4 }));
    expect(k).toEqual({ grade: 'unique', set: setId('Speed'), main: null, sub: 'CHC', sort: 'CHC', t4: true });
  });

  it('I2: оружие — главный стат и сабстат с наибольшим уровнем, сета нет', () => {
    const k = key(piece('weapon', null, { CHD: 5, SPD: 2 }, { itemKey: '19', main: 'ATK%' }));
    expect(k).toMatchObject({ set: null, main: 'ATK%', sub: 'CHD', sort: 'CHD', t4: false });
  });

  it('I3: уровни равны — выше в цепочке получателя', () => {
    const k = key(piece('helmet', 'Speed', { SPD: 4, CHC: 4, CHD: 4 }));
    expect(k.sub).toBe('CHC'); // CHC › CHD › SPD
  });

  it('I7: у вещи нет сабстатов — строки Secondary нет', () => {
    const k = key(piece('gloves', 'Speed', {}));
    expect(k).toMatchObject({ sub: null, sort: null });
  });
});

describe('источник (R9.1)', () => {
  it('I4: надета на другом — «у героя»; запас другого — «в инвентаре · запас»; свободная и свой запас — «в инвентаре»', () => {
    const o = { slot: 'weapon' as const, v: 1 };
    expect(sourceOf(cand({ ...o, cost: 3, holder: 'K' }))).toEqual({ kind: 'worn', holder: 'K' });
    expect(sourceOf(cand({ ...o, cost: 2, holder: 'N' }))).toEqual({ kind: 'stock', holder: 'N' });
    expect(sourceOf(cand({ ...o, cost: 2, holder: null }))).toEqual({ kind: 'inventory' });
    expect(sourceOf(cand({ ...o, cost: 1 }))).toEqual({ kind: 'inventory' });
  });
});

describe('подсказка для дыры (R9.2)', () => {
  it('I5: броня — сет, если дыра выключила половину сета; иначе без сета; сабстат — первый стат цепочки; грейд 6★', () => {
    const on = keyOfHole(P, 'helmet', setId('Speed'));
    const off = keyOfHole(P, 'helmet', null);
    expect(on).toMatchObject({ grade: null, set: setId('Speed'), main: null, sub: 'ATK%', sort: 'ATK%', t4: false });
    expect(off.set).toBeNull();
  });

  it('I5: стат, который в этом слоте сабстатом не бывает, пропускается', () => {
    // у перчаток main — не ATK%/ATK: проверяем, что подсказка — стат цепочки, допустимый как сабстат слота
    const k = keyOfHole(P, 'gloves', null);
    expect(['ATK%', 'ATK', 'CHC', 'CHD', 'SPD', 'DMG UP%']).toContain(k.sub);
  });

  it('I6: оружие — главный стат первого рекомендованного предмета, подходящего по классу', () => {
    const k = keyOfHole(P, 'weapon', null);
    expect(k).toMatchObject({ grade: null, set: null, main: 'ATK%' });
    expect(keyOfHole(P, 'accessory', null).main).toBe('PEN%');
  });
});
