// Материал Breakthrough для вещи персонажа (features/gear/model/material, пул): «Разобрать» → «Фоддер», у «Фоддер» — для чего он.
// Пример из хендоффа: Legendary Speed-шлем RES% / EFF% / HP / DMG RED% при надетом на Caren · Speed шлеме на T2.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { EMPTY_GEAR, updatePiece, type GearStore } from '@/features/gear/model/gear';
import type { Bt } from '@/game/item/item';
import { poolView, putOn } from '@/features/gear/pool';
import { betterThanWorn, materialFor, wearLead, withMaterial } from '@/features/gear/model/material';
import { charsVs } from '@/features/gear/model/poolVs';
import { withWorn } from '@/features/gear/model/stamp';
import type { ItemInput } from '@/game/item/item';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot: 'helmet', grade, setId: speed, itemKey: null, main: null, subs });
const WORN = helmet({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
// у Caren (Speed «Собираю») одна вещь — эта, с таким Breakthrough
const wearing = (bt: Bt | null, item = WORN, who = caren.id): GearStore => {
  const r = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, who, item);
  return updatePiece(r.st, r.id, { bt });
};
const mat = (st: GearStore, item: ItemInput) => materialFor(poolView(ctx, st), item);
const judge = (item: ItemInput, st: GearStore) => withMaterial(idx, ru, evaluate(ctx, item), mat(st, item));

describe('материал Breakthrough для надетой', () => {
  // Р1: Speed-перчатки T0 (ценность 0) раскладка Speed отдала Immunity-перчаткам — их держит только достижимая сборка.
  // Они не надеты: новые Speed-перчатки лучше, это не материал для них
  it('вещь, которую держит только достижимая сборка, — не «надета»: материала для неё нет', () => {
    const imm = D.sets.find((x) => x.short === 'Immunity')!.id;
    const A = (slot: ItemInput['slot'], setId: string, subs: Record<string, number>): ItemInput => ({ slot, grade: 'unique', setId, itemKey: null, main: null, subs });
    let st: GearStore = { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } };
    const put = (x: ItemInput, bt: Bt | null = null) => { const r = putOn(ctx, st, caren.id, x); st = bt === null ? r.st : updatePiece(r.st, r.id, { bt }); return r.id; };
    put(A('helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }), 4);
    put(A('armor', speed, { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }), 4);
    const gloves = put(A('gloves', speed, { RES: 1, EFF: 1, HP: 1, ATK: 1 }), 0);
    put(A('shoes', speed, { 'DEF%': 1, SPD: 2, RES: 1, HP: 1 }));
    put(A('helmet', imm, { 'DEF%': 3, CHC: 2, CHD: 2, SPD: 1 }));
    put(A('gloves', imm, { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }));
    const cp = poolView(ctx, st).of(caren.id)!;
    const v = cp.variants.find((x) => x.name === 'Speed')!;
    expect([cp.asm.get(v.key)!.slots.gloves?.id === gloves, cp.reach.get(v.key)!.slots.gloves?.id === gloves]).toEqual([false, true]);

    const item = A('gloves', speed, { 'HP%': 2, CHD: 2, 'DEF%': 3, 'ATK%': 3 });
    expect(mat(st, item)).toEqual([]);
  });

  it('пример из хендоффа: Legendary с мусорными сабстатами — «Фоддер», и сказано, для какого шлема и сколько ещё', () => {
    const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
    const r = judge(junk, wearing(2));
    expect(r.v).toBe('fodder');
    expect(r.lines[0]).toBe('**Материал**: такая же вещь надета не на T4 — шлем Caren · Speed — T2, ещё 2 шт. до T4. Одна вещь — одна ступень Breakthrough, сабстаты не важны.');
  });

  it('Epic «Разобрать» — поднимается до «Фоддер»: заголовок и «Прокачка» про материал', () => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const before = evaluate(ctx, epic);
    expect(before.v).toBe('junk');

    const r = judge(epic, wearing(1, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')));

    expect(r.v).toBe('fodder');
    expect(r.title).toBe('Фоддер — материал Breakthrough для шлема Caren · Speed');
    expect(r.plan).toEqual([ru.material.plan]);
  });

  // eval-only, шаг 2: запись с формы без «T4» — bt 0 (ниже T4, В4), материал Breakthrough по решению 12
  it('запись с формы без «T4» (bt 0) — такая же Epic «Разобрать» поднимается до «Фоддер»', () => {
    const epic: ItemInput = { ...helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare'), bt: 0 };
    const r0 = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'), bt: 0 });
    expect(r0.piece.bt).toBe(0);
    expect(evaluate(ctx, epic).v).toBe('junk');

    const r = judge(epic, r0.st);

    expect(r).toMatchObject({ v: 'fodder', title: 'Фоддер — материал Breakthrough для шлема Caren · Speed' });
    expect(mat(r0.st, epic)).toMatchObject([{ piece: { id: r0.id }, left: 4 }]);
  });

  // шаг 14, находка 5: «надета не на T4 — шлем Caren · Speed — ниже T4» говорило «не на T4» дважды
  it('строка «Материал» у записи bt 0 — только имя, без «— ниже T4»; у bt 1–3 — «T2, ещё 2 шт. до T4»', () => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const worn = (bt: number) => putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'), bt: bt as 0 });

    const line = (bt: number) => withMaterial(idx, ru, evaluate(ctx, epic), mat(worn(bt).st, epic)).lines[0];

    expect(line(0)).toMatch(/^\*\*Материал\*\*: такая же вещь надета не на T4 — шлем Caren · Speed\. Одна вещь/);
    expect(line(2)).toContain('надета не на T4 — шлем Caren · Speed — T2, ещё 2 шт. до T4.');
  });

  it('запись с формы с «T4» (bt 4) — не материал', () => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const r0 = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'), bt: 4 });
    expect(mat(r0.st, epic)).toEqual([]);
  });

  it.each([
    ['Breakthrough не указан', null],
    ['надетая уже на T4', 4],
  ] as const)('%s — не материал, вердикт тот же', (_, bt) => {
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');
    const st = wearing(bt, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare'));
    expect(mat(st, epic)).toEqual([]);
    const res = evaluate(ctx, epic);
    expect(withMaterial(idx, ru, res, mat(st, epic))).toBe(res);
  });

  it('другой грейд или сет — не материал', () => {
    expect(mat(wearing(1), helmet({ HP: 1 }, 'rare'))).toEqual([]);
    expect(mat(wearing(1), { ...helmet({ HP: 1 }), setId: D.sets.find((s) => s.short === 'Defense')!.id })).toEqual([]);
  });

  // в Оценку вводят новую вещь из инвентаря (решение владельца 2026-10-01): точная копия надетой — другая вещь, ей ступень
  it('точная копия надетой ниже T4 — материал для неё', () => {
    expect(mat(wearing(1), WORN)).toMatchObject([{ piece: { id: 'p1' }, left: 3 }]);
  });

  it('«Оставить» не трогаем — там это пометка в «Сейчас на персонажах»', () => {
    const good = helmet({ 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
    const res = evaluate(ctx, good);
    expect(res.v).toBe('keep');
    expect(mat(wearing(1), good)).toHaveLength(1);
    expect(withMaterial(idx, ru, res, mat(wearing(1), good))).toBe(res);
  });

  // решение владельца: вещь лучше той надетой, для которой она материал, — «надень, старую — ей в Breakthrough»
  describe('лучше надеть, чем отдать', () => {
    const judgeAll = (item: ItemInput, st: GearStore, target: string | null = null, c = ctx) => {
      const view = poolView(c, st);
      const needs = materialFor(view, item);
      return withMaterial(idx, ru, evaluate(c, item), needs, { up: betterThanWorn(c, view, item, needs), target });
    };
    const WEAK = helmet({ HP: 1, DEF: 1, ATK: 1 }, 'rare'); // надета на Caren · Speed, T2
    const epic = helmet({ HP: 1, 'DMG RED%': 1, RES: 1 }, 'rare');

    // шаг 3б (решение владельца): вердикт — про оцениваемую вещь; её надо надеть — «Оставляй», а не «Фоддер»
    it('новая лучше надетой — «Оставляй»: «надень её», старая ей в Breakthrough; «отдай надетой» нет', () => {
      const better = helmet({ DEF: 1, CHC: 1, HP: 1 }, 'rare');
      const r = judgeAll(better, wearing(2, WEAK));
      expect(r.v).toBe('keep');
      expect(r.title).toBe('Оставляй — лучше надетого шлема Caren · Speed: надень её, а старую — ей в Breakthrough');
      expect(r.lines[0]).toBe(ru.material.lineWear('шлем Caren · Speed — T2, ещё 2 шт. до T4'));
      expect(r.plan[0]).toBe(ru.material.planReplace('Caren · Speed'));
      expect(r.plan).not.toContain(ru.material.plan);
    });

    // Н3: «надень» — по вещам как есть. Было: у свежей 6 Reforge впереди, у надетой (4 оранжевых) — 2, и новая «лучше»
    it('«Фоддер» сырым вердиктом (Legendary, «Копишь фоддер») и лучше надетой — тоже «Оставляй», строки «Фоддер» нет', () => {
      const r = judgeAll(helmet({ CHC: 1, RES: 1, HP: 1, EFF: 1 }), wearing(2, helmet({ HP: 1, DEF: 1, ATK: 1, RES: 1 })));
      expect(r.v).toBe('keep');
      expect(r.title).toBe(ru.material.titleWear('helmet', 'Caren · Speed'));
      expect(r.lines.join('\n')).not.toContain('Держи не больше 4');
      expect(r.plan[0]).toBe(ru.material.planReplace('Caren · Speed'));
    });

    it('род слота в заголовке: надетого шлема, надетой брони, надетых перчаток, надетого оружия', () => {
      expect(['helmet', 'armor', 'gloves', 'weapon'].map((sl) => ru.material.titleWearT4(sl, 'X'))).toEqual([
        'Оставляй — лучше надетого шлема X: надень её', 'Оставляй — лучше надетой брони X: надень её',
        'Оставляй — лучше надетых перчаток X: надень её', 'Оставляй — лучше надетого оружия X: надень её',
      ]);
    });

    it('как есть: надетая с оранжевыми лучше новой — «надень» нет, только материал', () => {
      const r = putOn(ctx, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, helmet({ 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }));
      const st = updatePiece(r.st, r.id, { bt: 2, lit: { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 1 } });
      const item = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });
      const view = poolView(ctx, st);

      const needs = materialFor(view, item);

      expect(needs).toHaveLength(1);
      expect(betterThanWorn(ctx, view, item, needs)).toEqual([]);
    });

    it('в примерке у цели слот пуст — «надень её на Caren · Speed/Immu», а не «отдай надетой»', () => {
      const r = judgeAll(epic, wearing(2, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')), 'Caren · Speed/Immu');
      expect(r.plan[0]).toBe(ru.material.planWear('Caren · Speed/Immu'));
    });

    it('свежая Epic с тремя сабстатами: «не прокачивай и не разбирай» — без Reforge на удачу', () => {
      const r = judgeAll(epic, wearing(2, helmet({ 'DEF%': 2, CHC: 2, CHD: 1 }, 'rare')));
      expect(r.v).toBe('fodder');
      expect(r.plan).toEqual([ru.material.plan]);
    });

    it('настройка «Фоддер» выключена: «Включи — станут «Фоддер»» у поднятого штампа не остаётся', () => {
      const off = makeCtx(idx, { rosterOnly: false, fodder: false, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
      const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
      expect(evaluate(off, junk).lines).toContain(ru.armor.enableFodder('Speed'));
      const r = judgeAll(junk, wearing(2), null, off);
      expect(r.v).toBe('fodder');
      expect(r.lines).not.toContain(ru.armor.enableFodder('Speed'));
    });

    it('вещь у персонажа, которого нет в данных, — не материал (её нигде не видно)', () => {
      const junk = helmet({ RES: 1, EFF: 1, HP: 1, 'DMG RED%': 1 });
      expect(mat(wearing(2, WORN, '999999'), junk)).toEqual([]);
      expect(mat(wearing(2), junk)).toHaveLength(1);
    });
  });

  // шаг 3б: Pen-броня Epic с мусорными сабстатами у Anarky · Defense mix (Defense-шлем и перчатки, Pen-ботинки на T4,
  // Pen-броня T0) лучше надетой такой же: на T4 — держит Penetration ×2 T4, на T0 — тоже лучше по сабстатам
  describe('Anarky: новая лучше надетой такой же T0', () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const set = (short: string) => D.sets.find((x) => x.short === short)!.id;
    const A = (slot: ItemInput['slot'], short: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'rare'): ItemInput =>
      ({ slot, grade, setId: set(short), itemKey: null, main: null, subs });
    const GOOD = { DEF: 2, CHC: 2, CHD: 2, SPD: 1 };
    let st: GearStore = { ...EMPTY_GEAR, marks: { [`${anarky.id}/Defense mix`]: 'want' } };
    for (const [x, bt] of [[A('helmet', 'Defense', GOOD, 'unique'), 4], [A('gloves', 'Defense', GOOD, 'unique'), 4],
      [A('shoes', 'Penetration', GOOD, 'unique'), 4], [A('armor', 'Penetration', { HP: 1, 'DMG RED%': 1, RES: 1 }), 0]] as const) {
      const r = putOn(ctx, st, anarky.id, x);
      st = updatePiece(r.st, r.id, { bt });
    }
    const NEW = A('armor', 'Penetration', { CHC: 1, CHD: 1, HP: 1 });
    const judgeBt = (bt: 0 | 4) => {
      const item = { ...NEW, bt }, view = poolView(ctx, st), needs = materialFor(view, item);
      return withMaterial(idx, ru, evaluate(ctx, item), needs, { up: betterThanWorn(ctx, view, item, needs), target: null, t4: bt === 4 });
    };

    it('на T4 — «Оставляй — … надень её», старую ей в Breakthrough не отдать', () => {
      expect(evaluate(ctx, { ...NEW, bt: 4 }).v).toBe('junk');

      const r = judgeBt(4);

      expect(r).toMatchObject({ v: 'keep', title: 'Оставляй — лучше надетой брони Anarky · Defense mix: надень её' });
      // шаг 10: надетая bt 0 (форма без «T4») — без счёта ступеней (11.2 material.needBelow); было «T0, ещё 4 шт.»;
      // шаг 14: «ниже T4» в хвосте записи не повторяем — оно уже в «надета не на T4»
      expect(r.lines[0]).toBe('**Лучше надетой**: такая же вещь надета не на T4 и слабее этой — броня Anarky · Defense mix. Надень эту.');
      expect(r.plan).toEqual([ru.material.planWear('Anarky · Defense mix')]);
    });

    it('на T0 — «Оставляй — … надень её, а старую — ей в Breakthrough»', () => {
      const r = judgeBt(0);

      expect(r).toMatchObject({ v: 'keep', title: 'Оставляй — лучше надетой брони Anarky · Defense mix: надень её, а старую — ей в Breakthrough' });
      expect(r.lines[0]).toBe(ru.material.lineWear('броня Anarky · Defense mix'));
      expect(r.plan).toEqual([ru.material.planReplace('Anarky · Defense mix')]);
    });

    it('у «Оставляй» из прежних строк — кому вещь хороша и «Проверь HP: flat», а «Для Epic двух полезных мало» нет', () => {
      const raw = evaluate(ctx, { ...NEW, bt: 4 }).lines;
      expect(raw).toContain(ru.armor.epicTwo);

      expect(judgeBt(4).lines.slice(1)).toEqual([raw[0], ru.verdict.flatHint('HP')]);
    });
  });

  // находка 1 ревью eval-only: сырой «Спорно» у брони — «Разобрать» для ростера, поднятый ради тех, кого в нём нет.
  // Bryn (ростер — только она) носит в Speed Epic-перчатки ниже T4 (с формы без «T4», bt 0)
  describe('«Спорно»: лучше надетой — «Оставляй», материал — строка, штамп тот же', () => {
    const bryn = D.chars.find((c) => c.name === 'Bryn')!;
    const only = makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set([bryn.id]), ru);
    const gloves = (subs: Record<string, number>, bt: 0 | 4 = 0): ItemInput => ({ slot: 'gloves', grade: 'rare', setId: speed, itemKey: null, main: null, subs, bt });
    const OLD = gloves({ 'DMG RED%': 3, 'DEF%': 2, SPD: 1 });
    const st = putOn(only, { ...EMPTY_GEAR, marks: { [`${bryn.id}/Speed`]: 'want' } }, bryn.id, OLD).st;
    const judgeMaybe = (item: ItemInput) => {
      const view = poolView(only, st), needs = materialFor(view, item);
      return withMaterial(idx, ru, evaluate(only, item), needs, { up: betterThanWorn(only, view, item, needs), target: null, t4: item.bt === 4 });
    };
    const BETTER = { 'HP%': 4, 'DMG UP%': 3, CHC: 1 };

    it('новая лучше надетой без «T4» — «Оставляй — лучше надетых перчаток Bryn · Speed: надень её, а старую — ей в Breakthrough»', () => {
      expect(evaluate(only, gloves(BETTER)).v).toBe('maybe');

      const r = judgeMaybe(gloves(BETTER));

      expect(r).toMatchObject({ v: 'keep', title: 'Оставляй — лучше надетых перчаток Bryn · Speed: надень её, а старую — ей в Breakthrough' });
      expect(r.lines[0]).toBe(ru.material.lineWear('перчатки Bryn · Speed'));
      expect(r.plan).toEqual([ru.material.planReplace('Bryn · Speed')]);
    });

    it('новая на T4 — «Оставляй — … надень её» без хвоста про Breakthrough', () => {
      const r = judgeMaybe(gloves(BETTER, 4));

      expect(r).toMatchObject({ v: 'keep', title: 'Оставляй — лучше надетых перчаток Bryn · Speed: надень её' });
      expect(r.lines[0]).toBe(ru.material.lineWearT4('перчатки Bryn · Speed'));
      expect(r.plan).toEqual([ru.material.planWear('Bryn · Speed')]);
    });

    it('первая строка «Спорно» (кому из тех, кого нет в ростере, она «Оставить») — сразу после «Лучше надетой»', () => {
      const raw = evaluate(only, gloves(BETTER));
      expect(raw.lines[0]).toMatch(/^Для персонажей не из ростера это «Оставить»/);

      expect(judgeMaybe(gloves(BETTER)).lines.slice(1)).toEqual([raw.lines[0]]);
    });

    it('копия надетой (не лучше) — штамп и заголовок «Спорно» те же, вторая строка — «Материал»', () => {
      const raw = evaluate(only, OLD);
      expect(raw.v).toBe('maybe');

      const r = judgeMaybe(OLD);

      expect(r).toMatchObject({ v: 'maybe', title: raw.title, plan: raw.plan });
      expect(r.lines).toEqual([raw.lines[0], ru.material.line('перчатки Bryn · Speed'), ...raw.lines.slice(1)]);
    });
  });

  it('RU «Лучше надетой» кончается точкой, как EN и «на T4»', () => {
    expect([ru.material.lineWear('x'), ru.material.lineWearT4('x'), TEXTS.en.material.lineWear('x')].map((l) => l.at(-1))).toEqual(['.', '.', '.']);
  });

  // вопрос 7 (б) ревью eval-only: «T4» у Legendary оружия и аксессуара — записи с формы теперь с Breakthrough 0/4, и
  // материал такого же предмета срабатывает (было: bt null — никогда). Весь путь, как в App: материал, понижение по
  // надетому (worn, hold), материал поверх. Caren · Speed носит такой же предмет
  describe.each([['weapon', 'weapons', 'оружие', 'оружия'], ['accessory', 'amulets', 'аксессуар', 'аксессуара']] as const)('%s', (slot, list, nom, gen) => {
    const ref = caren.builds[0][list][0];
    const X = (subs: Record<string, number>, bt: 0 | 4 = 0): ItemInput => ({ slot, grade: 'unique', setId: null, itemKey: ref.key, main: ref.mains[0], subs, bt });
    const OLD = X({ CHC: 2, CHD: 2, SPD: 2, 'ATK%': 2 });
    const BETTER = { CHC: 4, CHD: 4, SPD: 4, 'ATK%': 4 };
    const app = (roster: string[], wornBt: 0 | 4, item: ItemInput) => {
      const c = makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster), ru);
      const r = putOn(c, { ...EMPTY_GEAR, marks: { [`${caren.id}/Speed`]: 'want' } }, caren.id, { ...OLD, bt: wornBt });
      const view = poolView(c, r.st), needs = materialFor(view, item), up = needs.length ? betterThanWorn(c, view, item, needs) : [];
      const worn = withWorn(c, view, item, evaluate(c, item), { hold: up.length > 0 });
      return withMaterial(idx, ru, worn, needs, { up, target: null, t4: item.bt === 4 });
    };
    const MAT = /^\*\*Материал\*\*/;

    it(`копия надетой ниже T4 — «Фоддер» и строка «Материал: … ${nom} Caren · Speed»`, () => {
      const r = app([caren.id], 0, OLD);

      expect(r.v).toBe('fodder');
      expect(r.lines[0]).toBe(ru.material.line(`${nom} Caren · Speed`));
    });

    // Legendary не разбирают: «Оставить», которое никого не улучшит, — «Фоддер — уже не хуже» (features/gear/model/stamp), а не «Разбирай»
    it('копия надетой на T4 — материала нет: «Фоддер — уже не хуже у Caren» без строки «Материал»', () => {
      const r = app([caren.id], 4, OLD);

      expect(r).toMatchObject({ v: 'fodder', title: ru.worn.title('fodder', ['Caren'], true) });
      expect(r.lines.some((l) => MAT.test(l))).toBe(false);
    });

    // сырой «Спорно» (в ростере — только Bryn, Caren в нём нет): лучше надетой такой же ниже T4 — «Оставляй», вердикт про
    // оцениваемую вещь
    const bryn = D.chars.find((c) => c.name === 'Bryn')!.id;
    it(`новая лучше надетой ниже T4 — «Оставляй — лучше надетого ${gen} Caren · Speed: надень её, а старую — ей в Breakthrough»`, () => {
      const r = app([bryn], 0, X(BETTER));

      expect(r).toMatchObject({ v: 'keep', title: `Оставляй — лучше надетого ${gen} Caren · Speed: надень её, а старую — ей в Breakthrough` });
      expect(r.lines[0]).toBe(ru.material.lineWear(`${nom} Caren · Speed`));
    });

    it('новая с «T4» лучше надетой ниже T4 — «…: надень её», без «старую — ей в Breakthrough»', () => {
      const r = app([bryn], 0, X(BETTER, 4));

      expect(r).toMatchObject({ v: 'keep', title: `Оставляй — лучше надетого ${gen} Caren · Speed: надень её` });
      expect([r.lines[0], r.plan]).toEqual([ru.material.lineWearT4(`${nom} Caren · Speed`), [ru.material.planWear('Caren · Speed')]]);
    });

    // «Оставить» и «Временно» материал не трогает (как у брони): сырой «Оставляй» остаётся, понижения нет (hold)
    it('сырой «Оставляй» и лучше надетой — штамп как есть, не понижен', () => {
      const raw = evaluate(makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set([caren.id]), ru), X(BETTER));

      const r = app([caren.id], 0, X(BETTER));

      expect([raw.v, r.v, r.title, r.worn]).toEqual(['keep', 'keep', raw.title, undefined]);
    });
  });

  it('оружие: тот же предмет — материал; Epic без предмета — никогда', () => {
    const w = caren.builds[0].weapons[0];
    const weapon: ItemInput = { slot: 'weapon', grade: 'unique', setId: null, itemKey: w.key, main: w.mains[0], subs: { HP: 1 } };
    const st = wearing(0, { ...weapon, subs: { CHC: 1 } });
    expect(mat(st, weapon)).toHaveLength(1);
    const epicW: ItemInput = { slot: 'weapon', grade: 'rare', setId: null, itemKey: null, main: 'ATK%', subs: { HP: 1 } };
    expect(mat(wearing(0, { ...epicW, subs: { CHC: 1 } }), epicW)).toEqual([]);
  });
  // ревью eval-only: герой из заголовка «Оставляй — лучше надетой … X» — всегда в «Сейчас на персонажах», с кнопкой, даже
  // если все его строки — «По статам» (Р11 их прячет). Герой без начатых билдов носит вещь сета вне его билдов
  describe('герой из заголовка — в «Сейчас на персонажах»', () => {
    const attack = D.sets.find((x) => x.short === 'Attack')!.id;
    const A = (subs: Record<string, number>): ItemInput => ({ slot: 'helmet', grade: 'rare', setId: attack, itemKey: null, main: null, subs });
    const bryn = D.chars.find((c) => c.name === 'Bryn')!;
    const setup = () => {
      const r = putOn(ctx, EMPTY_GEAR, caren.id, A({ HP: 1, DEF: 1, ATK: 1 }));
      const view = poolView(ctx, updatePiece(r.st, r.id, { bt: 2 }));
      const item = A({ DEF: 1, CHC: 1, HP: 1 });
      const needs = materialFor(view, item), up = betterThanWorn(ctx, view, item, needs);
      const worn = withWorn(ctx, view, item, evaluate(ctx, item), { hold: up.length > 0 });
      return { view, item, lead: wearLead(worn, { up, target: null }) };
    };

    it('строка героя есть и с кнопкой «Заменить» (в слоте надетая)', () => {
      const { view, item, lead } = setup();
      const list = charsVs(ctx, view, item, [caren], {}, lead);

      expect(list.map((x) => [x.c.id, x.useful, x.replaces])).toEqual([[caren.id, true, true]]);
    });

    it('без героя заголовка строка «только По статам» по-прежнему тихая (Р11)', () => {
      const { view, item } = setup();

      expect(charsVs(ctx, view, item, [caren])).toEqual([]);
    });

    it('герой заголовка не открывает чужие строки «только По статам»', () => {
      const { view, item, lead } = setup();
      const list = charsVs(ctx, view, item, [bryn], {}, lead);

      expect(list.some((x) => x.c.id === bryn.id)).toBe(false);
    });
  });
});
