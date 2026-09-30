// Штамп по вещам персонажей (logic/worn, пул GEARPOOL): «Оставить» → «Разобрать», когда всем, кому вещь подходит, она
// ничего не даёт; такая же вещь у персонажа — «Оставить». Персонаж без вещей — как раздетый. Случаи — прежние (B3),
// ожидания те же, кроме помеченных «иначе»: вещи теперь у персонажа, а не у билда.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { TEXTS } from '../src/i18n';
import { makeCtx, type Ctx } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { buildKey, EMPTY_GEAR, updatePiece, type GearStore } from '../src/logic/gear';
import { betterThanWorn, materialFor, withMaterial } from '../src/logic/material';
import { outcomeFor, poolView, putOn } from '../src/logic/pool';
import type { ItemInput } from '../src/logic/verdict';
import { withWorn } from '../src/logic/worn';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ru = TEXTS.ru;
const W = ru.worn;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const caren = D.chars.find((c) => c.name === 'Caren')!; // DEF › CHC › CHD › SPD › DMG UP%; Speed, Pen, Def, …/Immu
const rin = D.chars.find((c) => c.name === 'Rin')!;     // ATK › CHC › CHD › SPD › DMG UP%; Speed, CritDmg, Pen
const ctxOf = (chars: { id: string }[], fodder = true): Ctx =>
  makeCtx(idx, { rosterOnly: true, fodder, stage: 'grow', lv120: false, quirks: true }, new Set(chars.map((c) => c.id)), ru);
const piece = (slot: ItemInput['slot'], s: string, subs: Record<string, number>, grade: ItemInput['grade'] = 'unique'): ItemInput =>
  ({ slot, grade, setId: set(s), itemKey: null, main: null, subs });
const helmet = (subs: Record<string, number>, grade: ItemInput['grade'] = 'unique', s = 'Speed') => piece('helmet', s, subs, grade);
// Legendary-оружие по ключу предмета (19 Snow-white Embrace и 14 Violent Sledgehammer — оба в списке Caren, DEF%)
const weapon = (key: string, subs: Record<string, number>, main = 'DEF%'): ItemInput =>
  ({ slot: 'weapon', grade: 'unique', setId: null, itemKey: key, main, subs });
// вещь — в пул персонажа (как «Надеть»); вещь того же слота, что уже есть, может вытеснить ту
const on = (st: GearStore, c: { id: string }, item: ItemInput) => putOn(ctxOf([]), st, c.id, item).st;
const all = (c: { id: string }, items: ItemInput[]) => items.reduce((s, x) => on(s, c, x), EMPTY_GEAR);
const judge = (ctx: Ctx, item: ItemInput, st: GearStore, tryOn?: string) => withWorn(ctx, poolView(ctx, st, tryOn), item, evaluate(ctx, item, { gamble: false }));
const rowOf = (ctx: Ctx, st: GearStore, c: { id: string }, item: ItemInput, v: string) =>
  outcomeFor(ctx, poolView(ctx, st), c.id, item)!.rows.find((r) => r.v.name === v);

const STRONG = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }); // у Caren
const EPIC = helmet({ 'DEF%': 2, CHC: 2, CHD: 2 }, 'rare');  // сама по себе «Оставить» для Caren
const onCaren = on(EMPTY_GEAR, caren, STRONG);

describe('всем, кому подходит, она ничего не даёт — штамп понижается', () => {
  it('Epic, у Caren лучше, — «Разобрать»: у кого лучше, почему, и без кубика, ролла и значка', () => {
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, EPIC, { gamble: false }).v).toBe('keep');
    const r = judge(ctx, EPIC, onCaren);
    // иначе: Speed-шлем Caren стоит и в Speed, и в Speed/Immu — оба варианта «хуже»
    expect(r).toMatchObject({ v: 'junk', worn: 'lower', wornBy: [buildKey(caren.id, 'Speed'), buildKey(caren.id, 'Speed/Immu')], title: 'Разбирай — уже лучше у Caren', badge: '', gamble: null, roll: undefined });
    expect(r.lines.slice(0, 2)).toEqual([W.line, W.stale]);
    // нужна и тем, кого нет в ростере (Kappa), — строка, кому (разбор не молча); ниже — кому и чем она хороша
    expect(r.lines[2]).toMatch(/^Для персонажей не из ростера это «Оставить»: .*Kappa/);
    expect(r.lines[3]).toBe(evaluate(ctx, EPIC, { gamble: false }).lines[0]);
    expect(r.lines).toHaveLength(4);
  });

  it('Legendary-оружие «на замену» (предмета нет в билдах) — «Разобрать», а не «Фоддер»', () => {
    const ctx = ctxOf([caren]);
    const st = on(EMPTY_GEAR, caren, weapon('19', { CHC: 2, CHD: 2, SPD: 1, HP: 1 }));
    const winter = weapon('641', { CHC: 3, CHD: 2, SPD: 2, HP: 1 }); // Winter of Hubris — ни в одном билде
    expect(evaluate(ctx, winter, { gamble: false }).v).toBe('temp');
    const r = judge(ctx, winter, st);
    expect(r).toMatchObject({ v: 'junk', worn: 'lower', title: 'Разбирай — уже лучше у Caren', plan: [] });
    expect(r.lines).toHaveLength(3);
  });

  it('Legendary — «Фоддер»; не копишь фоддер — броня «Разобрать»', () => {
    const mid = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 });
    expect(judge(ctxOf([caren]), mid, onCaren)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже лучше у Caren' });
    expect(judge(ctxOf([caren], false), mid, onCaren)).toMatchObject({ v: 'junk', title: 'Разбирай — уже лучше у Caren' });
  });

  it('«на уровне» — тоже не улучшит: «уже не хуже»', () => {
    const worn = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 });
    const same = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, RES: 1 }); // полезные те же, лишний — другой
    const st = on(EMPTY_GEAR, caren, worn);
    expect(rowOf(ctxOf([caren]), st, caren, same, 'Speed')?.kind).toBe('eq');
    expect(judge(ctxOf([caren]), same, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже не хуже у Caren' });
  });

  it('два кандидата, у обоих лучше, — называет обоих', () => {
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    const st = on(onCaren, rin, helmet({ 'ATK%': 3, CHC: 3, CHD: 3, SPD: 2 }));
    expect(judge(ctxOf([caren, rin]), both, st).title).toBe('Фоддер — уже лучше у Caren и Rin');
  });

  it('понижает и «Разобрать» у материала: такая же вещь не на T4 — «Фоддер» со строкой, для чего', () => {
    const ctx = ctxOf([caren]);
    const r0 = putOn(ctx, EMPTY_GEAR, caren.id, helmet({ 'DEF%': 3, CHC: 3, CHD: 3 }, 'rare'));
    const st = updatePiece(r0.st, r0.id, { bt: 2 });
    const r = withMaterial(idx, ru, judge(ctx, EPIC, st), materialFor(poolView(ctx, st), EPIC));
    expect(r.v).toBe('fodder');
    expect(r.lines[0]).toMatch(/^\*\*Материал\*\*/);
    expect(r.lines).toContain(W.line);
  });
});

describe('что удерживает штамп', () => {
  it('персонаж без вещей — как раздетый: вещь ему пригодится', () => {
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    expect(evaluate(ctxOf([caren, rin]), both, { gamble: false }).v).toBe('keep');
    const r = judge(ctxOf([caren, rin]), both, onCaren);
    expect(r.v).toBe('keep');
    expect(r.worn).toBeUndefined();
  });

  it('пустой слот в собираемом варианте держит вещь', () => {
    const st = on(EMPTY_GEAR, caren, piece('shoes', 'Speed', { CHC: 3, CHD: 3, SPD: 2, 'DEF%': 2 }));
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  it('вещь не из связки (Pen-шлем) — не мешает: Speed-шлем Speed только начнёт, исходов нет — не понижаем', () => {
    const st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, 'unique', 'Penetration'));
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  it('новая лучше той, что в сборке, — «Оставить»', () => {
    const st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 1, HP: 1, RES: 1 }, 'rare'));
    expect(judge(ctxOf([caren]), EPIC, st).v).toBe('keep');
  });

  describe('вещь кому-то из кандидатов начинает билд — не понижаем (П1)', () => {
    const both = helmet({ CHC: 2, CHD: 2, SPD: 2, HP: 1 });
    const atRin = helmet({ 'ATK%': 3, CHC: 3, CHD: 3, SPD: 2 });
    const starts = (ctx: Ctx, st: GearStore, c: { id: string }) => outcomeFor(ctx, poolView(ctx, st), c.id, both)!.starts.map((v) => v.name);

    // иначе (было — design-final D.4): «начнёт» держало, лишь если сразу соберёт, — «Фоддер — уже лучше у Rin», а у
    // Caren тут же «Надеть — начнёт Speed»
    it('Caren собрана в Pen — Speed-шлем начнёт ей Speed: «Оставить», хотя у Rin лучше', () => {
      const ctx = ctxOf([caren, rin]);
      const inPen = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, 'unique', 'Penetration'));
      const st = on(inPen, rin, atRin);
      expect(starts(ctx, st, caren)).toContain('Speed');
      const r = judge(ctx, both, st);
      expect(r.v).toBe('keep');
      expect(r.worn).toBeUndefined();
    });

    it('сторож: никому не начинает — понижаем, как раньше', () => {
      const ctx = ctxOf([caren, rin]);
      const st = on(onCaren, rin, atRin);
      expect([starts(ctx, st, caren), starts(ctx, st, rin)]).toEqual([[], []]);
      expect(judge(ctx, both, st)).toMatchObject({ v: 'fodder', worn: 'lower', title: 'Фоддер — уже лучше у Caren и Rin' });
    });

    // случай повторного ревью (a3-lower seed 11): у Kappa собираются Swift-связки, Speed-вещей нет. Speed-ботинки там
    // «на уровне» (Defense ×2 на T4 распадается), а Speed начинают — было «Фоддер — уже не хуже у Kappa» рядом с
    // «Надеть — начнёт Speed»
    it('Kappa: первая Speed-вещь — «Оставить», не «Фоддер — уже не хуже»', () => {
      const kappa = D.chars.find((c) => c.name === 'Kappa')!;
      const ctx = ctxOf([kappa]);
      const k = (id: string, slot: ItemInput['slot'], s: string, subs: Record<string, number>, bt: 0 | 4 | null = null) =>
        ({ id, slot, grade: 'unique' as const, setId: set(s), itemKey: null, main: null, yellow: subs, lit: subs, bt, at: '' });
      const pcs = [
        k('k1', 'helmet', 'Counterattack', { 'ATK%': 4, SPD: 1, 'DEF%': 2 }), k('k2', 'armor', 'Counterattack', { SPD: 4, HP: 2, CHC: 1 }, 0),
        k('k3', 'helmet', 'Effectiveness', { SPD: 1, CHC: 1 }), k('k4', 'armor', 'Mitigation', { CHD: 4, RES: 2, SPD: 3 }),
        k('k5', 'gloves', 'Defense', { HP: 3, 'HP%': 2, CHC: 3, 'DEF%': 3 }, 4), k('k6', 'shoes', 'Defense', { CHD: 2, RES: 2 }, 4),
      ];
      const st: GearStore = {
        v: 2, seq: pcs.length, pieces: Object.fromEntries(pcs.map((p) => [p.id, p])), pools: { [kappa.id]: pcs.map((p) => p.id) },
        marks: { [buildKey(kappa.id, 'Swift Defense')]: 'want', [buildKey(kappa.id, 'Swift Counter')]: 'want' },
      };
      const boots = piece('shoes', 'Speed', { 'DMG UP%': 1, 'DEF%': 3, CHD: 1, DEF: 3 });
      const o = outcomeFor(ctx, poolView(ctx, st), kappa.id, boots)!;
      expect(o.starts.map((v) => v.name)).toEqual(['Speed']);
      expect(o.rows.filter((r) => !r.entering).map((r) => r.kind)).toEqual(['eq', 'eq']);
      const r = judge(ctx, boots, st);
      expect(r.v).toBe('keep');
      expect(r.worn).toBeUndefined();
    });
  });

  it('«на уровне» только из-за T4 (Speed ×2 на T4 у обеих Speed-вещей) — держит; настоящее «на уровне» — нет', () => {
    // иначе: у партнёрской вещи тоже T4 — бонус ×2 есть, и новая не с T4 отключила бы его
    let st = all(caren, [
      helmet({ 'DEF%': 2, CHC: 2, CHD: 1, HP: 1 }), piece('armor', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
      piece('gloves', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }), piece('shoes', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
    ]);
    for (const id of st.pools[caren.id].slice(0, 2)) st = updatePiece(st, id, { bt: 4 });
    // лучше на ~13% — меньше, чем стоит бонус Speed ×2 на T4 (сильно лучше — честное «лучше»: итог выгоднее)
    const better = helmet({ 'DEF%': 3, CHC: 2, CHD: 1, HP: 1 });
    const r = rowOf(ctxOf([caren]), st, caren, better, 'Speed/Immu')!;
    expect(r.kind).toBe('capped');
    expect(r.pair!.delta!).toBeGreaterThanOrEqual(0.1);
    expect(judge(ctxOf([caren]), better, st).v).toBe('keep');
    expect(judge(ctxOf([caren], false), better, st).v).toBe('keep');
    const same = helmet({ 'DEF%': 2, CHC: 2, CHD: 1, RES: 1 });
    expect(judge(ctxOf([caren]), same, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже не хуже у Caren' });
  });

  it('оружие с другой рекомендованной пассивкой — держит; тот же предмет — понижаем', () => {
    const snow = weapon('19', { CHC: 2, CHD: 2, SPD: 1, HP: 1 });
    const other = on(EMPTY_GEAR, caren, weapon('14', { CHC: 3, CHD: 3, SPD: 2, HP: 1 }));
    expect(rowOf(ctxOf([caren]), other, caren, snow, 'Speed')).toMatchObject({ kind: 'down', pair: { passive: true, why: null } });
    expect(judge(ctxOf([caren]), snow, other).v).toBe('keep');
    const same = on(EMPTY_GEAR, caren, weapon('19', { CHC: 3, CHD: 3, SPD: 2, HP: 1 }));
    expect(judge(ctxOf([caren]), snow, same)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже лучше у Caren' });
  });

  describe('«только статы» — не повод понижать (находка 7)', () => {
    // Caren собрана Speed ×4; Defense-шлемы — не из связок Speed и Speed/Immu. Сильный — «только статы», слабый — без
    // исходов; Def и Def/Immu оба начинают (Р14) — строки «начнёт» штамп не держат и не понижают
    const mid = { CHC: 2, CHD: 2, 'DEF%': 2, SPD: 1 };
    const st = all(caren, (['helmet', 'armor', 'gloves', 'shoes'] as const).map((slot) => piece(slot, 'Speed', mid)));
    const strong = helmet({ CHC: 3, CHD: 3, 'DEF%': 2, SPD: 1 }, 'unique', 'Defense');
    const weak = helmet({ CHC: 3, CHD: 2, 'DEF%': 2, SPD: 1 }, 'unique', 'Defense');

    it('сильный шлем в собираемых даёт только «только статы»', () => {
      const kinds = outcomeFor(ctxOf([caren]), poolView(ctxOf([caren]), st), caren.id, strong)!.rows.filter((r) => !r.entering).map((r) => r.kind);
      expect(kinds.length).toBeGreaterThan(0);
      expect(kinds.every((k) => k === 'stats')).toBe(true);
    });

    it('лучше по статам и слабее — один штамп, без понижения', () => {
      const ctx = ctxOf([caren]);
      const s = judge(ctx, strong, st), w = judge(ctx, weak, st);
      expect([s.v, s.worn]).toEqual([w.v, w.worn]);
      expect(s.v).toBe('keep');
      expect(s.worn).toBeUndefined();
    });
  });

  it('«Спорно» не понижаем: вещь хороша для тех, кого нет в ростере', () => {
    const atk = helmet({ 'ATK%': 3, ATK: 2, 'HP%': 2, EFF: 1 });
    const res = evaluate(ctxOf([caren]), atk, { gamble: false });
    expect(res.v).toBe('maybe');
    expect(withWorn(ctxOf([caren]), poolView(ctxOf([caren]), onCaren), atk, res)).toBe(res);
  });

  describe('2+2 ломается', () => {
    // Caren · Speed/Immu: шлем и броня — Speed, перчатки и ботинки — Immunity; новый шлем Immunity — вместо Speed
    const st = all(caren, [
      piece('helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }), piece('armor', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
      piece('gloves', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }), piece('shoes', 'Immunity', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
    ]);

    it('и по сегментам новая не лучше — понижаем (иначе: не «ломает», а просто «хуже» — «уже лучше»)', () => {
      const weak = helmet({ 'DEF%': 2, CHC: 2, CHD: 2, HP: 1 }, 'unique', 'Immunity');
      expect(rowOf(ctxOf([caren]), st, caren, weak, 'Speed/Immu')?.kind).toBe('down');
      expect(judge(ctxOf([caren]), weak, st)).toMatchObject({ v: 'fodder', title: 'Фоддер — уже лучше у Caren' });
    });

    it('а по сегментам новая лучше — не понижаем: Speed ×2 на T0 без бонуса, распадётся — в итоге выгоднее', () => {
      const strong = helmet({ 'DEF%': 4, CHC: 4, CHD: 3, SPD: 3 }, 'unique', 'Immunity');
      expect(rowOf(ctxOf([caren]), st, caren, strong, 'Speed/Immu')).toMatchObject({ kind: 'up', broken: set('Speed') });
      expect(judge(ctxOf([caren]), strong, st).v).toBe('keep');
    });
  });
});

describe('примерка и материал держат штамп', () => {
  const ctx = ctxOf([caren]);
  const res = evaluate(ctx, EPIC, { gamble: false });
  const judgeTry = (tryOn: string | null) => withWorn(ctx, poolView(ctx, onCaren, tryOn), EPIC, res);

  it('примерка: вариант примерки собирается, даже пустой', () => {
    // иначе: Speed/Immu уже собирается — Speed-шлем Caren стоит и в нём, и там он лучше: «Разобрать»
    expect(judgeTry(buildKey(caren.id, 'Speed/Immu')).v).toBe('junk');
    expect(judgeTry(buildKey(caren.id, 'Speed')).v).toBe('junk');
    // Pen: вещь не из его связки, шлем Caren там «прочий» и лучше — не держит
    expect(judgeTry(buildKey(caren.id, 'Pen')).v).toBe('junk');
    // пустой слот в варианте примерки держит: у Caren только Immunity-ботинки, в сборке Def/Immu шлема нет
    const shoes = on(EMPTY_GEAR, caren, piece('shoes', 'Immunity', { CHC: 1 }));
    expect(withWorn(ctx, poolView(ctx, shoes, buildKey(caren.id, 'Def/Immu')), EPIC, res).v).toBe('keep');
  });

  it('вещь — материал и лучше такой же у Rin (не кандидат): не «Никого не улучшит», а «надень» (hold)', () => {
    const both = ctxOf([caren, rin]);
    const item = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, HP: 1 });
    let st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }));
    const r = putOn(both, st, rin.id, helmet({ CHC: 1, HP: 1, RES: 1, EFF: 1 }));
    st = updatePiece(r.st, r.id, { bt: 2 });
    const raw = evaluate(both, item, { gamble: false });
    const view = poolView(both, st);
    expect(withWorn(both, view, item, raw).worn).toBe('lower'); // без hold — понизили бы
    const hold = betterThanWorn(both, view, item, materialFor(view, item)).length > 0;
    expect(hold).toBe(true);
    expect(withWorn(both, view, item, raw, { hold })).toBe(raw);
  });
});

describe('кубик: удачный 4-й, после которого вещь понизило бы, — не удача', () => {
  const ctx = ctxOf([caren]);
  const junk = helmet({ 'DEF%': 1, CHC: 1, HP: 2 }, 'rare'); // «Разобрать», кубик → «Оставить» для Caren

  it('у Caren лучше любой удачной — кубика нет, и «Прокачка» не зовёт делать Reforge', () => {
    const res = evaluate(ctx, junk);
    expect(res.gamble?.target).toBe('keep');
    const st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 4, CHC: 3, CHD: 3, SPD: 3 }));
    const r = withWorn(ctx, poolView(ctx, st), junk, res);
    expect(r.v).toBe('junk');
    expect(r.gamble).toBeNull();
    expect(r.plan).not.toContain(ru.plan.gamble('junk'));
  });

  it('у Caren шлема нет — кубик тот же', () => {
    const res = evaluate(ctx, junk);
    const st = on(EMPTY_GEAR, caren, piece('shoes', 'Speed', { CHC: 3, CHD: 3, SPD: 2, 'DEF%': 2 }));
    expect(withWorn(ctx, poolView(ctx, st), junk, res)).toBe(res);
  });
});

describe('вещь введена не вся — не понижаем', () => {
  const ctx = ctxOf([caren]);
  const epicOn = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }, 'rare'));

  it('Epic 2 из 3 — «Оставить» по двум главным статам, у Caren чуть лучше: штамп тот же', () => {
    const two = helmet({ 'DEF%': 3, CHC: 3 }, 'rare');
    expect(evaluate(ctx, two, { gamble: false }).v).toBe('keep');
    expect(rowOf(ctx, epicOn, caren, two, 'Speed')?.kind).toBe('down');
    const r = judge(ctx, two, epicOn);
    expect(r.v).toBe('keep');
    expect(r.worn).toBeUndefined();
    expect(rowOf(ctx, epicOn, caren, helmet({ 'DEF%': 3, CHC: 3, CHD: 3 }, 'rare'), 'Speed')?.kind).toBe('up');
  });

  it('Epic 2 из 3 по правилу SPD — тоже', () => {
    const spd = helmet({ SPD: 2, CHC: 1 }, 'rare');
    expect(evaluate(ctx, spd, { gamble: false }).v).toBe('keep');
    expect(judge(ctx, spd, epicOn).worn).toBeUndefined();
  });

  it('Legendary 3 из 4 — не «Фоддер» и (без «коплю фоддер») не «Разобрать»', () => {
    const three = helmet({ 'DEF%': 3, CHC: 3, CHD: 2 });
    const st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 3, CHC: 2, CHD: 2, HP: 1 }));
    expect(judge(ctx, three, st).v).toBe('keep');
    expect(judge(ctxOf([caren], false), three, st).v).toBe('keep');
  });

  it('Legendary-оружие без сабстатов — «Оставить» (пассивка и main), а не «Фоддер — уже лучше»', () => {
    const st = on(EMPTY_GEAR, caren, weapon('19', { CHC: 2, CHD: 2, SPD: 1, HP: 1 }));
    expect(judge(ctx, weapon('19', {}), st).v).toBe('keep');
  });
});

describe('такая же вещь у персонажа — «Оставить»', () => {
  it('«Разобрать» у вещи Caren — «Оставить»: у кого она, и без кубика и «Прокачки»', () => {
    const junk = helmet({ HP: 1, RES: 1, EFF: 1 }, 'rare');
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, junk, { gamble: false }).v).toBe('junk');
    const r = judge(ctx, junk, on(EMPTY_GEAR, caren, junk));
    expect(r).toMatchObject({ v: 'keep', worn: 'home', title: 'Оставляй — она уже у Caren', lines: [W.kept('Caren')], plan: [], gamble: null, badge: '' });
  });

  it('«Фоддер» — тоже; у нескольких — первый и «и ещё N»', () => {
    const fod = helmet({ HP: 1, RES: 1, EFF: 1, 'DMG RED%': 1 });
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, fod, { gamble: false }).v).toBe('fodder');
    const st = on(on(EMPTY_GEAR, caren, fod), rin, fod);
    expect(judge(ctx, fod, st).title).toBe('Оставляй — она уже у Rin и ещё 1'); // по id персонажа
  });

  it('«Оставить» у своей вещи не трогаем — и не понижаем', () => {
    const res = evaluate(ctxOf([caren]), STRONG, { gamble: false });
    expect(res.v).toBe('keep');
    expect(withWorn(ctxOf([caren]), poolView(ctxOf([caren]), onCaren), STRONG, res)).toBe(res);
  });
});

it('без вещей у кого-либо вердикт тот же объект', () => {
  const res = evaluate(ctxOf([caren]), EPIC, { gamble: false });
  expect(withWorn(ctxOf([caren]), poolView(ctxOf([caren]), EMPTY_GEAR), EPIC, res)).toBe(res);
});
