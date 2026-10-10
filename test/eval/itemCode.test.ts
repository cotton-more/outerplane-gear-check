import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SLOTS, createIndex, isArmor } from '@/game/data';
import type { Dataset, GearKind } from '@/game/data/types';
import { epicMains, legendMains } from '@/game/build/builds';
import { decodeItem, encodeItem } from '@/features/eval/code/codec';
import type { ItemInput } from '@/game/item/item';
import { fromPersisted, reducer } from '@/app/appState';
import { fitsData } from '@/features/eval/form/formState';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
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

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// codes one typo (or one swap of neighbours) away from the item's code that still read as a piece from the data —
// what the player would see on the form instead of an error
function slipped(items: ItemInput[], swap: boolean): { n: number; read: number } {
  const S = fromPersisted(null, idx);
  let n = 0, read = 0;
  for (const x of items) {
    const c = encodeItem(x)!.replace(/ /g, '');
    const vs: string[] = [];
    if (swap) { for (let i = 0; i + 1 < c.length; i++) if (c[i] !== c[i + 1]) vs.push(c.slice(0, i) + c[i + 1] + c[i] + c.slice(i + 2)); }
    else for (let i = 0; i < c.length; i++) for (const ch of ALPHABET) if (ch !== c[i]) vs.push(c.slice(0, i) + ch + c.slice(i + 1));
    for (const v of vs) { n++; const d = decodeItem(v); if (d.ok && fitsData(S, d.item, idx)) read++; }
  }
  return { n, read };
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

  it('влезает в игровой чат: броня — 8 букв, Legendary оружие и аксессуар — не больше 11', () => {
    const len = (x: ItemInput) => encodeItem(x)!.replace(/ /g, '').length;
    expect(Math.max(...all.filter((x) => isArmor(x.slot)).map(len))).toBe(8);
    expect(Math.max(...all.map(len))).toBeLessThanOrEqual(11);
  });

  it('только буквы без I и O, группами по 4 через пробел', () => {
    for (const x of all) expect(encodeItem(x)).toMatch(/^[A-HJ-NP-Z]{1,4}( [A-HJ-NP-Z]{1,4})*$/);
    expect(all.every((x) => encodeItem(x)!.split(' ').slice(0, -1).every((g) => g.length === 4))).toBe(true);
  });

  it('регистр, пробелы, дефисы и приставка OGC (в том числе слитно) не мешают', () => {
    const x = item({ slot: 'weapon', itemKey: legendPool('weapon')[0].key, main: legendPool('weapon')[0].mains[0], subs: { SPD: 1 } });
    const code = encodeItem(x)!;
    const typed = [code.toLowerCase(), code.replace(/ /g, ''), code.replace(/ /g, '-'), `OGC ${code}`, `ogc: ${code}`, `OGC${code.replace(/ /g, '')}`, `ОGС ${code}`];
    for (const t of typed) expect(decodeItem(t)).toEqual({ ok: true, item: x });
  });

  it('кириллические двойники латинских букв читаются как латиница', () => {
    const x = item({ setId: '21', subs: { SPD: 2, CHC: 1 } });
    const code = encodeItem(x)!;
    const cyr = code.replace(/[ABEKMHPCTXY]/g, (ch) => ({ A: 'А', B: 'В', E: 'Е', K: 'к', M: 'М', H: 'Н', P: 'Р', C: 'с', T: 'Т', X: 'Х', Y: 'У' })[ch]!);
    expect(decodeItem(cyr)).toEqual({ ok: true, item: x });
  });

  it('опечатка в любом одном символе ловится', () => {
    const code = encodeItem(item({ setId: '13', subs: { SPD: 2, CHC: 1, CHD: 3, 'ATK%': 1 } }))!.replace(/ /g, '');
    for (let i = 0; i < code.length; i++) {
      for (const ch of ALPHABET) {
        if (ch === code[i]) continue;
        expect(decodeItem(code.slice(0, i) + ch + code.slice(i + 1))).toEqual({ ok: false, error: 'check' });
      }
    }
  });

  // Luhn mod 24 alone caught every swap but A/Z; since the second form (levels 5–6) a swap can pass its shifted check —
  // measured on the data: about 1 in 1500 swaps reads as another piece
  it('перестановка двух соседних символов почти всегда ловится', () => {
    const { n, read } = slipped(all, true);
    expect(n).toBeGreaterThan(4000);
    expect(read / n).toBeLessThan(1 / 1000);
  });

  // Levels 5–6 (after Reforge): the second form of the code (owner, 2026-10-07); levels 1–4 keep the old code
  describe('уровни 5–6 — вторая форма кода', () => {
    // every item from the data with one row raised to 5 or 6
    const wide = all.map((x, i) => {
      const keys = Object.keys(x.subs);
      return { ...x, subs: { ...x.subs, [keys[i % keys.length]]: 5 + (i % 2) } };
    });

    it('старые коды не изменились ни на букву', () => {
      expect(encodeItem(item({ slot: 'helmet', grade: 'rare', setId: '1', subs: { SPD: 2, CHC: 2, CHD: 1, 'ATK%': 1 } }))).toBe('PEDJ XTA');
      expect(encodeItem(item({ slot: 'weapon', grade: 'rare', main: 'ATK%', subs: { SPD: 2, CHC: 2, CHD: 1, 'ATK%': 1 } }))).toBe('WMZY APH');
    });

    it('любой предмет с 5–6 читается обратно без потерь', () => {
      for (const x of wide) expect(decodeItem(encodeItem(x)!)).toEqual({ ok: true, item: x });
      const x = item({ setId: '13', subs: { SPD: 6, CHC: 5, CHD: 1, 'ATK%': 4 } });
      expect(decodeItem(encodeItem(x)!)).toEqual({ ok: true, item: x });
    });

    it('длиннее не больше чем на 2 буквы: броня — до 10, всё — до 13', () => {
      const len = (x: ItemInput) => encodeItem(x)!.replace(/ /g, '').length;
      expect(Math.max(...wide.filter((x) => isArmor(x.slot)).map(len))).toBeLessThanOrEqual(10);
      expect(Math.max(...wide.map(len))).toBeLessThanOrEqual(13);
    });

    // measured on the data (2026-10-07): a typo reads as another piece from the data — old codes about 1 in 6500,
    // second-form codes about 1 in 3800 (it can pass as an old code; the data check stops most); swaps — 1 in 2500
    it('опечатка в старом коде почти никогда не читается чужой вещью', () => {
      const { n, read } = slipped(all, false);
      expect(n).toBeGreaterThan(50_000);
      expect(read / n).toBeLessThan(1 / 3000);
    });

    it('опечатка и перестановка во второй форме почти всегда ловятся', () => {
      const typo = slipped(wide, false), swap = slipped(wide, true);
      expect(typo.read / typo.n).toBeLessThan(1 / 2000);
      expect(swap.read / swap.n).toBeLessThan(1 / 1000);
    });
  });

  it('Breakthrough в код не попадает: T4 и ниже T4 — один и тот же код', () => {
    const x = item({ setId: '13', subs: { SPD: 2, CHC: 1 } });
    expect(encodeItem({ ...x, bt: 4 })).toBe(encodeItem({ ...x, bt: 0 }));
  });

  it('пустой ввод и чужие символы (цифры, I, O) — отдельные ошибки', () => {
    expect(decodeItem('  ')).toEqual({ ok: false, error: 'empty' });
    for (const bad of ['KXRM 7PWA', 'KXRM IPWA', 'KXRM OPWA']) expect(decodeItem(bad)).toEqual({ ok: false, error: 'chars' });
  });
});

describe('код предмета и текущие данные', () => {
  const s = fromPersisted(null, idx);

  it('предмет из данных подходит', () => {
    expect(fitsData(s, item({ setId: '13', subs: { SPD: 2 } }), idx)).toBe(true);
  });

  it('Breakthrough входа fitsData не сравнивает', () => {
    expect(fitsData(s, item({ setId: '13', subs: { SPD: 2 }, bt: 4 }), idx)).toBe(true);
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
