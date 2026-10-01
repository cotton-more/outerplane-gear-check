// Примерка (logic/tryon, пул GEARPOOL): что хранится, какой вариант, что подставляется на форму и заголовок вердикта —
// штамп общий, а строка после « — » говорит и про других, и про того, для кого примеряем.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx, type Ctx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { EMPTY_GEAR, updatePiece, type GearStore } from '../src/logic/gear';
import { isStats, poolView, putOn, STATS } from '../src/logic/pool';
import { charVs } from '../src/logic/poolVs';
import { heroNote, heroOutcome, heroTarget, heroTitle, restoreTryOn, targetName, tryOnPreset, tryOnTarget, tryOnTitle, tryRowOf, type Target } from '../src/logic/tryon';
import type { ItemInput, Verdict } from '../src/logic/verdict';
import { withWorn } from '../src/logic/worn';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set(), ru);
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const armor = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
const NEW = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
const OLD = armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 });
const all = (items: ItemInput[], c: Ctx = ctx) => items.reduce<GearStore>((s, x) => putOn(c, s, caren.id, x).st, EMPTY_GEAR);
const target = (build: string, st: GearStore = EMPTY_GEAR, combo?: string) => tryOnTarget(idx, { charId: caren.id, build, ...(combo ? { combo } : {}) }, poolView(ctx, st))!;
// заголовок в примерке: исход для варианта цели
const titleOf = (res: Verdict, st: GearStore, tg: Target, item: ItemInput, c: Ctx = ctx) => {
  const x = charVs(c, poolView(c, st, tg.v.key), caren.id, item, tg.v.key);
  return tryOnTitle(ru, res, tg, tryRowOf(idx, x?.best ?? null));
};

describe('примерка: что хранится', () => {
  it('персонаж и билд из данных — примерка есть; связка варианта — тоже', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Pen' }, idx)).toEqual({ charId: caren.id, build: 'Pen' });
    expect(restoreTryOn({ charId: caren.id, build: 'Pen', combo: '11x4' }, idx)).toEqual({ charId: caren.id, build: 'Pen', combo: '11x4' });
  });

  // шаг 6 (В10): билда больше нет — режим героя без предустановки, а не «примерки нет»
  it('билда больше нет — режим героя без предустановки: build и combo отброшены', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Old', combo: '11x4' }, idx)).toEqual({ charId: caren.id });
  });

  it.each([
    ['персонажа больше нет', { charId: '999', build: 'Speed' }],
    ['charId не строка', { charId: 5 }],
    ['не объект', 'Caren'],
    ['пусто', null],
  ])('%s — режима героя нет', (_, raw) => {
    expect(restoreTryOn(raw, idx)).toBeNull();
  });

  it('цель — персонаж, билд и вариант', () => {
    expect(target('Pen')).toMatchObject({ c: { name: 'Caren' }, b: { name: 'Pen' }, v: { key: `${caren.id}/Pen` } });
    expect(tryOnTarget(idx, null)).toBeNull();
  });

  it('билд с несколькими связками: combo — тот вариант; нет или устарел — самый собранный, при равенстве первый', () => {
    const anarky = D.chars.find((c) => c.name === 'Anarky')!;
    const tg = (combo?: string, st: GearStore = EMPTY_GEAR) => tryOnTarget(idx, { charId: anarky.id, build: 'Defense mix', ...(combo ? { combo } : {}) }, poolView(ctx, st))!.v.name;
    expect(tg()).toBe('Defense mix · Penetration');
    expect(tg('2x2+19x2')).toBe('Defense mix · Swiftness');
    expect(tg('9x9')).toBe('Defense mix · Penetration');
    const immu = putOn(ctx, EMPTY_GEAR, anarky.id, armor('helmet', 'Immunity', { CHC: 1 })).st;
    expect(tg(undefined, immu)).toBe('Defense mix · Immunity');
  });
});

describe('примерка: что встаёт на форму', () => {
  it('пустой слот брони — сет варианта', () => {
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), target('Speed'), 'gloves')).toEqual({ slot: 'gloves', setId: set('Speed') });
  });

  it('2+2: сет, которого не хватает, — в сборке уже два Speed, значит Immunity', () => {
    const st = all([armor('helmet', 'Speed', { CHC: 1 }), armor('armor', 'Speed', { CHC: 1 })]);
    expect(tryOnPreset(poolView(ctx, st), target('Speed/Immu', st), 'gloves').setId).toBe(set('Immunity'));
  });

  it('«Примерить замену» — сет той вещи; оружие — без сета', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('helmet', 'Immunity', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), target('Speed/Immu', r.st), 'helmet', r.piece).setId).toBe(set('Immunity'));
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), target('Speed'), 'weapon')).toEqual({ slot: 'weapon', setId: null });
  });

  it('«Примерить замену» у вещи не из связки (Defense в Speed) — сет варианта, а не её', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('shoes', 'Defense', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), target('Speed', r.st), 'shoes', r.piece).setId).toBe(set('Speed'));
  });
});

describe('примерка: заголовок вердикта', () => {
  const on = (item: ItemInput, wornLit?: Record<string, number>) => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, OLD);
    const st = wornLit ? updatePiece(r.st, r.id, { lit: wornLit, bt: 4 }) : EMPTY_GEAR;
    const res = evaluate(ctx, item);
    return { res, title: titleOf(res, st, target('Speed', st), item) };
  };

  it('«Оставить», ей лучше: слово вердикта то же, дальше — кому ещё нужна и «лучше, чем на Caren»', () => {
    const { res, title } = on(NEW, { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }); // как есть: надетая 4/3/2/3 уже лучше новой
    expect(res.v).toBe('keep');
    expect(title).toMatch(/^Оставляй — нужна .+; лучше, чем на Caren$/);
    expect(title).not.toMatch(/нужна[^;]*Caren/);
  });

  it('у неё лучше — «на Caren уже лучше»', () => {
    expect(on(NEW, { 'DEF%': 6, CHC: 5, SPD: 3, EFF: 2 }).title).toMatch(/; на Caren уже лучше$/);
  });

  it('иначе: пусто — вещь сета её начнёт: «Caren · Speed: сет 1 из 4»', () => {
    expect(on(NEW).title).toMatch(/; Caren · Speed: сет 1 из 4$/);
  });

  it('новые исходы: соберёт, «на уровне: Speed ×2 на T4», сверх собранной части', () => {
    const three = all([armor('armor', 'Speed', { CHC: 1 }), armor('gloves', 'Speed', { CHC: 1 }), armor('shoes', 'Speed', { CHC: 1 })]);
    const res = evaluate(ctx, NEW);
    expect(titleOf(res, three, target('Speed', three), NEW)).toMatch(/; у Caren соберёт Speed$/);
    // Speed/Immu: Speed ×2 уже собран — третья Speed-вещь сверх него
    expect(titleOf(res, three, target('Speed/Immu', three), NEW)).toMatch(/; у Caren — сверх Speed ×2$/);
    let t4 = all([armor('helmet', 'Speed', { 'DEF%': 2, CHC: 2, CHD: 1, HP: 1 }), armor('armor', 'Speed', { CHC: 1 })]);
    for (const id of t4.pools[caren.id]) t4 = updatePiece(t4, id, { bt: 4 });
    expect(titleOf(res, t4, target('Speed/Immu', t4), armor('helmet', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 1, HP: 1 }))).toMatch(/; на Caren — на уровне: Speed ×2 на T4$/);
  });

  // находка 14: «соберёт» — когда полной станет вся связка; полной стала лишь Immunity ×2 — «сет 2 из 4»
  it('собрана лишь половина связки — «Caren · Speed/Immu: сет 2 из 4», а не «соберёт»', () => {
    const immu = all([armor('helmet', 'Immunity', { CHC: 3, CHD: 3, 'DEF%': 2, SPD: 1 })]);
    const gloves = armor('gloves', 'Immunity', { CHC: 3, CHD: 2, 'DEF%': 2, SPD: 1 });
    const res = evaluate(ctx, gloves);
    expect(titleOf(res, immu, target('Speed/Immu', immu), gloves)).toMatch(/Caren · Speed\/Immu: сет 2 из 4$/);
  });

  it('не её сет — «Caren · Speed — не по билду»', () => {
    expect(on(armor('helmet', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 })).title).toMatch(/Caren · Speed — не по билду$/);
  });

  it('«Разобрать», а ей слот пуст — «но у Caren слот пуст: надень, пока нет лучше»', () => {
    const junk = armor('helmet', 'Speed', { HP: 1, 'DMG RED%': 1, RES: 1, EFF: 1 });
    const { res, title } = on(junk);
    expect(res.v === 'junk' || res.v === 'fodder').toBe(true);
    expect(title).toBe(`${res.title.split(' — ')[0]} — но у Caren слот пуст: надень, пока нет лучше`);
  });

  it('«Разобрать», а у неё лучше — причина вердикта остаётся, к ней — про неё', () => {
    const junk = armor('helmet', 'Speed', { HP: 1, 'DMG RED%': 1, RES: 1, EFF: 1 });
    const { res, title } = on(junk, { 'DEF%': 4, CHC: 3, SPD: 2, EFF: 3 });
    expect(title).toBe(`${res.title}; на Caren уже лучше`);
  });

  it('лучшей строки нет («Спорно») — причина вердикта остаётся, к ней — про неё', () => {
    const res = { ...evaluate(ctx, NEW), v: 'maybe' as const, title: 'Спорно — предмета ещё нет в данных outerpedia', sections: [] };
    expect(titleOf(res, EMPTY_GEAR, target('Speed'), armor('helmet', 'Defense', { CHC: 1 }))).toBe('Спорно — предмета ещё нет в данных outerpedia; Caren · Speed — не по билду');
  });

  it('в заголовке не было « — » — второго тире нет', () => {
    const res = { ...evaluate(ctx, NEW), v: 'maybe' as const, title: 'Твоим не подходит, но предмет хороший', sections: [] };
    expect(titleOf(res, EMPTY_GEAR, target('Speed'), NEW)).toBe('Твоим не подходит, но предмет хороший; Caren · Speed: сет 1 из 4');
  });

  it('оружие и аксессуар — «нужен», броня — «нужна»; по-английски одному — «needs»', () => {
    expect(ru.tryon.others(['Titia'], false)).toBe('нужен Titia');
    expect(ru.tryon.others(['Titia', 'Kappa'])).toBe('нужна Titia и Kappa');
    expect(TEXTS.en.tryon.others(['Titia'])).toBe('Titia needs it');
    expect(TEXTS.en.tryon.others(['Titia', 'Kappa'])).toBe('Titia and Kappa need it');
  });

  it('вердикта ещё нет — заголовок как был', () => {
    const res = evaluate(ctx, { ...NEW, subs: {} });
    expect(res.v).toBe('idle');
    expect(titleOf(res, EMPTY_GEAR, target('Speed'), NEW)).toBe(res.title);
  });

  // штамп понизили (logic/worn): всем, кому подходит, она ничего не даёт. Этот вариант среди них — заголовок уже про
  // него; не среди них — к нему его строка
  it('«Разобрать», потому что все уже носят лучше: про этот вариант не повторяем, про другой — добавляем', () => {
    const mine = makeCtx(idx, { rosterOnly: true, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set([caren.id]), ru);
    const st = putOn(mine, EMPTY_GEAR, caren.id, armor('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 })).st;
    const res = withWorn(mine, poolView(mine, st), NEW, evaluate(mine, NEW));
    expect(res.title).toBe('Фоддер — уже лучше у Caren');
    expect(titleOf(res, st, target('Speed', st), NEW, mine)).toBe(res.title);
    expect(titleOf(res, st, target('Pen', st), NEW, mine)).toBe('Фоддер — уже лучше у Caren; Caren · Pen — не по билду');
  });

});

// Находка 28: «По статам» — тоже цель примерки (вкладка «По статам» в карточке: «Собрать билд», «Примерить»)
describe('примерка «По статам»', () => {
  const stats = (st: GearStore = EMPTY_GEAR) => tryOnTarget(idx, { charId: caren.id, build: STATS }, poolView(ctx, st))!;

  it('восстанавливается из хранилища; вариант — «По статам», имя для показа — «По статам»', () => {
    const t = restoreTryOn({ charId: caren.id, build: STATS }, idx);
    expect(t).toEqual({ charId: caren.id, build: STATS });
    expect(isStats(stats().v)).toBe(true);
    expect(targetName(ru, stats())).toBe('По статам');
    expect(targetName(ru, target('Speed'))).toBe('Speed');
  });

  // шаг 6 (В10): у героя без билдов «По статам» нет — режим героя без предустановки
  it('у персонажа без билдов «По статам» нет — режим героя без предустановки', () => {
    const none = D.chars.find((c) => !c.builds.length)!;
    expect(restoreTryOn({ charId: none.id, build: STATS }, idx)).toEqual({ charId: none.id });
  });

  it('на форму: слот; у брони — сет той вещи или никакого (связки нет)', () => {
    const r = putOn(ctx, EMPTY_GEAR, caren.id, armor('helmet', 'Immunity', { CHC: 1 }));
    expect(tryOnPreset(poolView(ctx, r.st), stats(r.st), 'helmet', r.piece)).toEqual({ slot: 'helmet', setId: set('Immunity') });
    expect(tryOnPreset(poolView(ctx, EMPTY_GEAR), stats(), 'gloves')).toEqual({ slot: 'gloves', setId: null });
  });

  it('заголовок: вещь встаёт — «у Caren слот пуст»; полезных статов нет — «Caren · По статам — ничего не даст»', () => {
    const good = armor('helmet', 'Attack', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
    const junk = armor('helmet', 'Attack', { HP: 1, RES: 1, EFF: 1, ATK: 1 });
    const title = (x: ItemInput) => {
      const tg = stats();
      const v = charVs(ctx, poolView(ctx, EMPTY_GEAR, tg.v.key), caren.id, x, tg.v.key, { explicit: true });
      return tryOnTitle(ru, evaluate(ctx, x), tg, tryRowOf(idx, v?.best ?? null));
    };
    expect(title(good)).toMatch(/у Caren слот пуст/);
    expect(title(junk)).toMatch(/Caren · По статам — ничего не даст$/);
  });
});

// Шаг 6 «Оценка — единственный ввод»: режим «для героя» (В7, В10) — цель герой, а не билд; build и combo — только
// предустановка формы; replace — запись из «Примерить замену»
describe('режим «для героя»: что хранится', () => {
  it('без build — режим героя', () => {
    expect(restoreTryOn({ charId: caren.id }, idx)).toEqual({ charId: caren.id });
  });

  it('старый { charId, build, combo } — режим героя с предустановкой', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Pen', combo: '11x4' }, idx)).toEqual({ charId: caren.id, build: 'Pen', combo: '11x4' });
  });

  it('replace — читается строка; не строка или пустая — отброшена, режим героя остаётся', () => {
    expect(restoreTryOn({ charId: caren.id, build: 'Speed', replace: 'p7' }, idx)).toEqual({ charId: caren.id, build: 'Speed', replace: 'p7' });
    expect(restoreTryOn({ charId: caren.id, replace: 7 }, idx)).toEqual({ charId: caren.id });
    expect(restoreTryOn({ charId: caren.id, replace: '' }, idx)).toEqual({ charId: caren.id });
  });

  it('build не строка — режим героя без предустановки', () => {
    expect(restoreTryOn({ charId: caren.id, build: 3, combo: '11x4' }, idx)).toEqual({ charId: caren.id });
  });

  it('heroTarget: с build — герой и вариант предустановки; без build — только герой; нет режима — null', () => {
    expect(heroTarget(idx, { charId: caren.id, build: 'Pen' })).toMatchObject({ c: { name: 'Caren' }, v: { key: `${caren.id}/Pen` } });
    expect(heroTarget(idx, { charId: caren.id })).toEqual({ c: caren });
    expect(heroTarget(idx, { charId: caren.id, build: 'Old' })).toEqual({ c: caren });
    expect(heroTarget(idx, null)).toBeNull();
  });
});

describe('режим «для героя»: заголовок — лучший исход героя по всем билдам', () => {
  // строка героя — как в App: charVs явного выбора без only
  const heroOf = (res: Verdict, st: GearStore, item: ItemInput) => {
    const view = poolView(ctx, st);
    const vs = charVs(ctx, view, caren.id, item, undefined, { explicit: true });
    return heroTitle(ru, idx, res, caren, heroOutcome(ctx, view, item, vs));
  };
  // Speed-броня и Speed-ботинки, Immunity-шлем: Immunity-перчатки собирают Speed/Immu, а в Speed они не по билду
  const pool = () => all([armor('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }), armor('shoes', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 }), armor('helmet', 'Immunity', { 'DEF%': 3, CHC: 2, CHD: 2 })]);
  const GLOVES = armor('gloves', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });

  it('Immunity-перчатки: в предустановке Speed — «не по билду», у героя — «соберёт Speed/Immu»', () => {
    const st = pool();
    const res = evaluate(ctx, GLOVES);
    expect(titleOf(res, st, target('Speed', st), GLOVES)).toMatch(/Caren · Speed — не по билду$/);
    expect(heroOf(res, st, GLOVES)).toMatch(/у Caren соберёт Speed\/Immu$/);
  });

  it('пустой пул: вещь только начнёт билд — «Caren · …: сет 1 из 4»', () => {
    expect(heroOf(evaluate(ctx, NEW), EMPTY_GEAR, NEW)).toMatch(/; Caren · .+: сет 1 из 4$/);
  });

  it('вещь герою ни к чему — про героя ничего, заголовок вердикта как был', () => {
    const junk = armor('helmet', 'Attack', { HP: 1, RES: 1, EFF: 1, ATK: 1 });
    const res = evaluate(ctx, junk);
    expect(heroOf(res, EMPTY_GEAR, junk)).toBe(res.title);
  });

  it('вердикта ещё нет — заголовок как был', () => {
    const res = evaluate(ctx, { ...NEW, subs: {} });
    expect(heroOf(res, EMPTY_GEAR, NEW)).toBe(res.title);
  });
});

describe('режим «для героя»: строка под карточкой (offHero, 11.1)', () => {
  const noteOf = (item: ItemInput, st: GearStore = EMPTY_GEAR, t = ru) =>
    heroNote(t, ctx, caren, item, charVs(ctx, poolView(ctx, st), caren.id, item, undefined, { explicit: true }));
  const JUNK_ATK = armor('helmet', 'Attack', { HP: 1, RES: 1, EFF: 1, ATK: 1 });

  it('сета нет в билдах героя, по статам не подходит — «Caren она не нужна: Attack нет в билдах Caren.»', () => {
    expect(noteOf(JUNK_ATK)).toBe('Caren она не нужна: Attack нет в билдах Caren.');
    expect(noteOf(JUNK_ATK, EMPTY_GEAR, TEXTS.en)).toBe("Caren doesn't need it: Attack isn't in Caren's builds.");
  });

  it('то же при начатом Speed — строка Speed «только статы», всё равно offHero', () => {
    const st = all([armor('armor', 'Speed', { 'DEF%': 3, CHC: 2, CHD: 2 })]);
    expect(noteOf(JUNK_ATK, st)).toBe('Caren она не нужна: Attack нет в билдах Caren.');
  });

  it('сета нет в билдах, а по статам подходит — «По статам» и кнопка «Надеть»', () => {
    const good = armor('helmet', 'Attack', { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 });
    const vs = charVs(ctx, poolView(ctx, EMPTY_GEAR), caren.id, good, undefined, { explicit: true })!;
    expect({ stats: isStats(vs.best!.v), useful: vs.useful }).toEqual({ stats: true, useful: true });
    expect(noteOf(good)).toBe(ru.tryon.offStats('Caren'));
  });

  it('вещь её сета — строки нет: что с ней, говорит заголовок', () => {
    expect(noteOf(NEW)).toBeNull();
  });
});
