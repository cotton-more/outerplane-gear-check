import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SLOTS, createIndex, isArmor } from '../src/data';
import type { Dataset, GearKind } from '../src/data/types';
import { epicMains, legendMains } from '../src/logic/builds';
import { decodeItem, encodeItem } from '../src/logic/itemCode';
import type { ItemInput } from '../src/logic/verdict';
import { fitsData, fromPersisted, reducer } from '../src/state/appState';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const SUBS = D.substats.map((s) => s.key);
const legendPool = (kind: GearKind) => idx.ITEMS[kind].filter((i) => i.star === 6 && i.grade === 'unique');

// детерминированный «случайный» набор сабстатов: разные статы, жёлтые 1–4
function subsFor(seed: number, count: number, main: string | null) {
  const subs: Record<string, number> = {};
  for (let i = 0; Object.keys(subs).length < count; i++) {
    const k = SUBS[(seed * 7 + i * 5) % SUBS.length];
    if (k !== main && !(k in subs)) subs[k] = ((seed + i) % 4) + 1;
  }
  return subs;
}

const item = (patch: Partial<ItemInput>): ItemInput =>
  ({ slot: 'gloves', grade: 'unique', setId: null, itemKey: null, main: null, unlisted: false, subs: {}, ...patch });

// все осмысленные предметы из данных: каждый сет в каждом слоте брони, каждый Legendary с каждым main, Epic и «нет в списке»
function everyItem(): ItemInput[] {
  const out: ItemInput[] = [];
  let seed = 0;
  for (const sl of SLOTS) {
    const kind = sl.id as GearKind;
    if (isArmor(sl.id)) {
      for (const set of D.sets) for (const grade of ['unique', 'rare'] as const) {
        out.push(item({ slot: sl.id, grade, setId: set.id, subs: subsFor(seed++, grade === 'unique' ? 4 : 3, null) }));
      }
      continue;
    }
    for (const it of legendPool(kind)) for (const main of [...it.mains, ...it.extraMains]) {
      out.push(item({ slot: sl.id, itemKey: it.key, main, subs: subsFor(seed++, 4, main) }));
    }
    for (const main of legendMains(idx, kind)) out.push(item({ slot: sl.id, unlisted: true, main, subs: subsFor(seed++, 4, main) }));
    for (const main of epicMains(idx, kind)) out.push(item({ slot: sl.id, grade: 'rare', main, subs: subsFor(seed++, 3, main) }));
  }
  return out;
}

describe('код предмета', () => {
  const all = everyItem();

  it('таблицы формата покрывают все сабстаты и main stat из данных', () => {
    expect(all.length).toBeGreaterThan(300);
    expect(all.filter((x) => encodeItem(x) === null)).toEqual([]);
  });

  it('любой предмет из данных читается обратно без потерь', () => {
    for (const x of all) expect(decodeItem(encodeItem(x)!)).toEqual({ ok: true, item: x });
  });

  it('порядок сабстатов и жёлтые сегменты сохраняются', () => {
    const x = item({ subs: { SPD: 2, CHC: 1, CHD: 4, 'ATK%': 3 }, setId: '13' });
    const back = decodeItem(encodeItem(x)!);
    expect(back.ok && Object.entries(back.item.subs)).toEqual([['SPD', 2], ['CHC', 1], ['CHD', 4], ['ATK%', 3]]);
  });

  it('влезает в игровой чат: броня — 8 символов, Legendary оружие и аксессуар — не больше 10', () => {
    const len = (x: ItemInput) => encodeItem(x)!.replace(/-/g, '').length;
    expect(Math.max(...all.filter((x) => isArmor(x.slot)).map(len))).toBe(8);
    expect(Math.max(...all.map(len))).toBeLessThanOrEqual(10);
  });

  it('регистр, пробелы, дефисы, приставка OGC и похожие буквы (I, L → 1, O → 0) не мешают', () => {
    const x = item({ slot: 'weapon', itemKey: legendPool('weapon')[0].key, main: legendPool('weapon')[0].mains[0], subs: { SPD: 1 } });
    const code = encodeItem(x)!;
    const typed = [code.toLowerCase(), code.replace(/-/g, ' '), `OGC ${code}`, `ogc: ${code}`, code.replace(/1/g, 'l').replace(/0/g, 'O'), `ОGС ${code}`];
    for (const t of typed) expect(decodeItem(t)).toEqual({ ok: true, item: x });
  });

  it('кириллические двойники латинских букв читаются как латиница', () => {
    const x = item({ setId: '21', subs: { SPD: 2, CHC: 1 } });
    const code = encodeItem(x)!;
    const cyr = code.replace(/[ABEKMHPCTXY3]/g, (ch) => ({ A: 'А', B: 'В', E: 'Е', K: 'к', M: 'М', H: 'Н', P: 'Р', C: 'с', T: 'Т', X: 'Х', Y: 'У', 3: 'З' })[ch]!);
    expect(decodeItem(cyr)).toEqual({ ok: true, item: x });
  });

  it('опечатка в любом одном символе ловится', () => {
    const code = encodeItem(item({ setId: '13', subs: { SPD: 2, CHC: 1, CHD: 3, 'ATK%': 1 } }))!.replace(/-/g, '');
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    for (let i = 0; i < code.length; i++) {
      for (const ch of ALPHABET) {
        if (ch === code[i]) continue;
        expect(decodeItem(code.slice(0, i) + ch + code.slice(i + 1))).toEqual({ ok: false, error: 'check' });
      }
    }
  });

  it('перестановка двух соседних символов ловится', () => {
    for (const x of all.slice(0, 200)) {
      const code = encodeItem(x)!.replace(/-/g, '');
      for (let i = 0; i + 1 < code.length; i++) {
        const a = code[i], b = code[i + 1];
        if (a === b || (a === '0' && b === 'Z') || (a === 'Z' && b === '0')) continue; // единственная пара, которую Luhn mod 32 не различает
        expect(decodeItem(code.slice(0, i) + b + a + code.slice(i + 2)).ok).toBe(false);
      }
    }
  });

  it('пустой ввод и чужие символы — отдельные ошибки', () => {
    expect(decodeItem('  ')).toEqual({ ok: false, error: 'empty' });
    expect(decodeItem('K3QX-7U2A')).toEqual({ ok: false, error: 'chars' });
  });
});

describe('код предмета и текущие данные', () => {
  const s = fromPersisted(null, idx);

  it('предмет из данных подходит', () => {
    expect(fitsData(s, item({ setId: '13', subs: { SPD: 2 } }), idx)).toBe(true);
  });

  it('сет или предмет из более новых данных — не подходит', () => {
    expect(fitsData(s, item({ setId: '999' }), idx)).toBe(false);
    expect(fitsData(s, item({ slot: 'weapon', itemKey: '999999', main: 'ATK%' }), idx)).toBe(false);
  });

  it('открытый код заменяет предмет целиком и переключает на оценку', () => {
    const x = item({ slot: 'shoes', grade: 'rare', setId: '13', subs: { SPD: 2 } });
    const next = reducer({ ...s, tab: 'chars', slot: 'weapon', itemKey: 'x', expand: { a: true } }, { type: 'load', item: x });
    expect([next.tab, next.slot, next.grade, next.setId, next.itemKey, next.subs, next.expand]).toEqual(['eval', 'shoes', 'rare', '13', null, { SPD: 2 }, {}]);
  });
});
