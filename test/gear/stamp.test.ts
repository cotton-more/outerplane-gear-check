// Штамп по вещам персонажей (features/gear/model/stamp, пул GEARPOOL): «Оставить» → «Разобрать», когда всем, кому вещь подходит, она
// ничего не даёт; такая же вещь у персонажа — «Оставить». Персонаж без вещей — как раздетый. Случаи — прежние (B3),
// ожидания те же, кроме помеченных «иначе»: вещи теперь у персонажа, а не у билда.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { TEXTS } from '@/i18n';
import { makeCtx, type Ctx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { buildKey, EMPTY_GEAR, updatePiece, type GearStore } from '@/features/gear/model/gear';
import { betterThanWorn, materialFor, withMaterial } from '@/features/gear/model/material';
import { outcomeFor, poolView, putOn } from '@/features/gear/pool';
import type { ItemInput } from '@/features/eval/verdict/verdict';
import { withWorn } from '@/features/gear/model/stamp';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
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
const judge = (ctx: Ctx, item: ItemInput, st: GearStore) => withWorn(ctx, poolView(ctx, st), item, evaluate(ctx, item));
const rowOf = (ctx: Ctx, st: GearStore, c: { id: string }, item: ItemInput, v: string) =>
  outcomeFor(ctx, poolView(ctx, st), c.id, item)!.rows.find((r) => r.v.name === v);

const STRONG = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }); // у Caren
const EPIC = helmet({ 'DEF%': 2, CHC: 2, CHD: 2 }, 'rare');  // сама по себе «Оставить» для Caren
const onCaren = on(EMPTY_GEAR, caren, STRONG);

describe('всем, кому подходит, она ничего не даёт — штамп понижается', () => {
  it('Epic, у Caren лучше, — «Разобрать»: у кого лучше, почему, и без значка', () => {
    const ctx = ctxOf([caren]);
    expect(evaluate(ctx, EPIC).v).toBe('keep');
    const r = judge(ctx, EPIC, onCaren);
    // иначе: Speed-шлем Caren стоит и в Speed, и в Speed/Immu — оба варианта «хуже»
    expect(r).toMatchObject({ v: 'junk', worn: 'lower', wornBy: [buildKey(caren.id, 'Speed'), buildKey(caren.id, 'Speed/Immu')], title: 'Разбирай — уже лучше у Caren' });
    expect(r.lines.slice(0, 2)).toEqual([W.line, W.stale]);
    // нужна и тем, кого нет в ростере (Kappa), — строка, кому (разбор не молча); ниже — кому и чем она хороша
    expect(r.lines[2]).toMatch(/^Для персонажей не из ростера это «Оставить»: .*Kappa/);
    expect(r.lines[3]).toBe(evaluate(ctx, EPIC).lines[0]);
    expect(r.lines).toHaveLength(4);
  });

  it('Legendary-оружие «на замену» (предмета нет в билдах) — «Разобрать», а не «Фоддер»', () => {
    const ctx = ctxOf([caren]);
    const st = on(EMPTY_GEAR, caren, weapon('19', { CHC: 2, CHD: 2, SPD: 1, HP: 1 }));
    const winter = weapon('641', { CHC: 3, CHD: 2, SPD: 2, HP: 1 }); // Winter of Hubris — ни в одном билде
    expect(evaluate(ctx, winter).v).toBe('temp');
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
    expect(evaluate(ctxOf([caren, rin]), both).v).toBe('keep');
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
      // иначе («как есть», Н3): прежние ботинки DMG UP% 1 / DEF% 3 / CHD 1 / DEF 3 стали «только статы» — их понижение
      // пропускает само; эти дают «на уровне», как прежние до «как есть». Строка «начнёт Speed» («ближе», вещь встаёт)
      // держит штамп и без П1 — так было и на 8108e0c: вещь сета связки, которая начинает вариант, всегда встаёт в его
      // сборку (hard или soft растёт), и её исход держит. Тест сторожит итог, а не одно правило П1
      const boots = piece('shoes', 'Speed', { CHC: 2, CHD: 3, DEF: 3, 'DEF%': 3 });
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
    const res = evaluate(ctxOf([caren]), atk);
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

// Понижение — как есть (Н3, решение владельца 2026-10-01: В-А1 (г) отменён): Reforge впереди не закладываем ни у
// новой, ни у вещей героя — Reforge делают в игре, а сегменты записи правят в приложении
describe('понижение — как есть', () => {
  const ctx = ctxOf([caren]);
  const rec = (yellow: Record<string, number>, lit = yellow): GearStore => {
    const p = { id: 'p1', slot: 'helmet' as const, grade: 'unique' as const, setId: set('Speed'), itemKey: null, main: null, yellow, lit, bt: null, at: '' };
    return { v: 2, seq: 1, pieces: { p1: p }, pools: { [caren.id]: ['p1'] } };
  };

  it('свежая против прокачанной надетой (DEF% 6): та — как есть, новая хуже — «Фоддер — уже лучше у Caren» (было «уже не хуже»: новой 6 Reforge впереди, надетой 1)', () => {
    const st = rec({ 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, { 'DEF%': 6, CHC: 3, CHD: 3, SPD: 2 });
    const x = helmet({ 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 });
    expect(evaluate(ctx, x).v).toBe('keep');

    const r = judge(ctx, x, st);

    const worn = 6 + 3 * 0.8 + 3 * 0.65 + 2 * 0.5, next = 3 + 3 * 0.8 + 3 * 0.65 + 2 * 0.5; // веса цепочки Caren
    expect(rowOf(ctx, st, caren, x, 'Speed')?.pair?.delta).toBeCloseTo(next / worn - 1, 6);
    expect(r).toMatchObject({ v: 'fodder', worn: 'lower', title: 'Фоддер — уже лучше у Caren' });
  });

  it('свежая против свежей: по сегментам как есть — два сильных стата у Caren весят больше четырёх средних', () => {
    // было «Оставить»: Reforge впереди доставался каждому полезному, у новой их четыре, у Caren два — новая «лучше»
    const st = rec({ 'DEF%': 4, CHC: 4, RES: 1, EFF: 1 });
    const x = helmet({ 'DEF%': 3, CHC: 2, CHD: 2, SPD: 2 });
    expect(evaluate(ctx, x).v).toBe('keep');

    expect(rowOf(ctx, st, caren, x, 'Speed')?.kind).toBe('eq');
    expect(judge(ctx, x, st)).toMatchObject({ v: 'fodder', worn: 'lower', title: 'Фоддер — уже не хуже у Caren' });
  });

  it('свежая против свежей, новая лучше как есть — «Оставить»', () => {
    const st = rec({ 'DEF%': 2, CHC: 2, RES: 1, EFF: 1 });
    const x = helmet({ 'DEF%': 3, CHC: 2, CHD: 2, SPD: 2 });

    expect(rowOf(ctx, st, caren, x, 'Speed')?.kind).toBe('up');
    expect(judge(ctx, x, st).v).toBe('keep');
  });
});

// build/strategy/STRATEGY.md §2, пробы G и H (дыра 3): у Caren всё на T4 — Speed-шлем и -ботинки, Defense-шлем и -ботинки,
// Immunity-броня и -перчатки. Новые Speed-ботинки лучше старых T4, свежий дроп — ниже T4 (на форме без «T4», bt 0).
// Фиксируем «как есть»: исход считается на её Breakthrough, потенциал после Breakthrough не считаем — это задача
// .x/bt-potential.md, она эти ожидания поменяет. На 8108e0c было «Фоддер» / «Разобрать»; со сравнения «как есть»
// (шаг 1) штамп держится и так: Legendary — «лучше» с потерей Speed ×2 T4, Epic — «на уровне из-за T4»
describe('свежая Speed-вещь ниже T4 против старой на T4 — как есть (STRATEGY §2 G/H)', () => {
  const ctx = ctxOf([caren]);
  const st = (() => {
    let s: GearStore = EMPTY_GEAR;
    for (const x of [
      helmet({ 'DEF%': 2, CHC: 2, SPD: 1, HP: 1 }), piece('shoes', 'Speed', { 'DEF%': 2, CHC: 1, CHD: 1, SPD: 2 }),
      helmet({ 'DEF%': 2, CHC: 1, CHD: 2, ATK: 1 }, 'unique', 'Defense'), piece('shoes', 'Defense', { 'DEF%': 1, CHC: 2, CHD: 1, SPD: 1 }),
      piece('armor', 'Immunity', { 'DEF%': 3, CHC: 2, CHD: 1, SPD: 1 }), piece('gloves', 'Immunity', { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
    ]) {
      const r = putOn(ctx, s, caren.id, x);
      s = updatePiece(r.st, r.id, { bt: 4 });
    }
    return { ...s, marks: {} };
  })();
  const boots = (grade: ItemInput['grade'], bt: 0 | 4): ItemInput =>
    ({ ...piece('shoes', 'Speed', grade === 'unique' ? { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 } : { 'DEF%': 3, CHC: 3, SPD: 2 }, grade), bt });
  const speedT4Lost = (x: ItemInput) => rowOf(ctx, st, caren, x, 'Speed/Immu')!.lostBonus.some((b) => b.set === set('Speed') && b.tier === 'T4');

  it('G, Legendary на T0–T3: встаёт «лучше», но Speed ×2 T4 теряет — потенциал после Breakthrough не считается', () => {
    const r = rowOf(ctx, st, caren, boots('unique', 0), 'Speed/Immu')!;
    expect(r).toMatchObject({ kind: 'up', used: true });
    expect(speedT4Lost(boots('unique', 0))).toBe(true);
    expect(r.delta!).toBeLessThan(rowOf(ctx, st, caren, boots('unique', 4), 'Speed/Immu')!.delta!);
  });

  it('G, Epic на T0–T3: не встаёт — «на уровне из-за T4»', () => {
    expect(rowOf(ctx, st, caren, boots('rare', 0), 'Speed/Immu')).toMatchObject({ kind: 'capped', used: false });
  });

  it('G: штамп у обеих — «Оставить», не понижен', () => {
    expect([judge(ctx, boots('unique', 0), st), judge(ctx, boots('rare', 0), st)].map((r) => [r.v, r.worn])).toEqual([['keep', undefined], ['keep', undefined]]);
  });

  it('H: те же ботинки с «T4» на форме — встают, Speed ×2 T4 цел', () => {
    for (const grade of ['unique', 'rare'] as const) {
      expect(rowOf(ctx, st, caren, boots(grade, 4), 'Speed/Immu')).toMatchObject({ kind: 'up', used: true });
      expect(speedT4Lost(boots(grade, 4))).toBe(false);
    }
  });
});

// опровержение шага 2 (refute-2, charlotte): та же вещь на T4 встаёт так же, итог тот же, но Speed 4P T0 сменяется на
// 2P T4 + 4P T4 той же ценности. Строка 4P T0 в знаменателе «лучше» давала «на уровне» и «Разбирай — уже не хуже»
it('Charlotte: Speed-шлем с формы на T4 — «Оставляй», как тот же на T0: смена 4P T0 на T4 — не потеря', () => {
  const ch = D.chars.find((c) => c.name === 'Charlotte')!;
  const ctx = ctxOf([ch]);
  const P = (id: string, slot: ItemInput['slot'], grade: ItemInput['grade'], s: string, bt: 0 | 1 | 4, lit: Record<string, number>) =>
    ({ id, slot, grade, setId: set(s), itemKey: null, main: null, yellow: lit, lit, bt, at: '' });
  const pieces = [
    P('p1', 'armor', 'unique', 'Speed', 4, { 'ATK%': 2, DEF: 1, 'DMG UP%': 4, 'DMG RED%': 4 }), P('p2', 'shoes', 'unique', 'Attack', 1, { 'DMG UP%': 1, SPD: 1, HP: 3, CHD: 1 }),
    P('p3', 'shoes', 'unique', 'Speed', 4, { 'DEF%': 1, CHD: 1, CHC: 4, 'ATK%': 3 }), P('p4', 'shoes', 'rare', 'Speed', 0, { 'DMG RED%': 4, 'HP%': 4, HP: 3 }),
    P('p5', 'gloves', 'unique', 'Speed', 4, { CHD: 1, ATK: 4, 'DMG UP%': 2, RES: 1 }), P('p6', 'helmet', 'unique', 'Speed', 0, { CHD: 3, 'DMG RED%': 3, EFF: 2, SPD: 3 }),
  ];
  const st: GearStore = { ...EMPTY_GEAR, seq: 6, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [ch.id]: pieces.map((p) => p.id) } };
  const x = (bt: 0 | 4): ItemInput => ({ ...helmet({ ATK: 2, 'ATK%': 4, RES: 2 }, 'rare'), bt });
  expect([0, 4].map((bt) => judge(ctx, x(bt as 0 | 4), st)).map((r) => [r.v, r.worn])).toEqual([['keep', undefined], ['keep', undefined]]);
  const [r0, r4] = [rowOf(ctx, st, ch, x(0), 'Speed')!, rowOf(ctx, st, ch, x(4), 'Speed')!];
  expect(r4.kind).toBe('up');
  expect(r4.delta!).toBeCloseTo(r0.delta!, 9);
});

describe('материал держит штамп', () => {
  it('вещь — материал и лучше такой же у Rin (не кандидат): не «Никого не улучшит», а «надень» (hold)', () => {
    const both = ctxOf([caren, rin]);
    const item = helmet({ 'DEF%': 3, CHC: 3, CHD: 2, HP: 1 });
    let st = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 }));
    const r = putOn(both, st, rin.id, helmet({ CHC: 1, HP: 1, RES: 1, EFF: 1 }));
    st = updatePiece(r.st, r.id, { bt: 2 });
    const raw = evaluate(both, item);
    const view = poolView(both, st);
    expect(withWorn(both, view, item, raw).worn).toBe('lower'); // без hold — понизили бы
    const hold = betterThanWorn(both, view, item, materialFor(view, item)).length > 0;
    expect(hold).toBe(true);
    expect(withWorn(both, view, item, raw, { hold })).toBe(raw);
  });
});

describe('вещь введена не вся — не понижаем', () => {
  const ctx = ctxOf([caren]);
  const epicOn = on(EMPTY_GEAR, caren, helmet({ 'DEF%': 3, CHC: 2, CHD: 2 }, 'rare'));

  it('Epic 2 из 3 — «Оставить» по двум главным статам, у Caren не хуже: штамп тот же', () => {
    const two = helmet({ 'DEF%': 3, CHC: 3 }, 'rare');
    expect(evaluate(ctx, two).v).toBe('keep');
    // иначе («как есть», Н3): было «хуже» — у Caren три сабстата, и Reforge впереди доставался трём; как есть 3/3
    // против 3/2/2 — «на уровне» (−8%), штамп так же не держит
    expect(rowOf(ctx, epicOn, caren, two, 'Speed')?.kind).toBe('eq');
    const r = judge(ctx, two, epicOn);
    expect(r.v).toBe('keep');
    expect(r.worn).toBeUndefined();
    expect(rowOf(ctx, epicOn, caren, helmet({ 'DEF%': 3, CHC: 3, CHD: 3 }, 'rare'), 'Speed')?.kind).toBe('up');
  });

  it('Epic 2 из 3 по правилу SPD — тоже', () => {
    const spd = helmet({ SPD: 2, CHC: 1 }, 'rare');
    expect(evaluate(ctx, spd).v).toBe('keep');
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

// «Дома» нет (решение владельца 2026-10-01): в Оценку вводят новую вещь из инвентаря, надетое в игре не оценивают.
// Такая же, как запись, — новый дроп или снятая с героя: сравнивается как есть, у записи ниже T4 — материал
describe('такая же вещь у персонажа — сравнивается как есть', () => {
  const ctx = ctxOf([caren]);
  const withBt = (bt: 0 | 4) => { const r0 = putOn(ctx, EMPTY_GEAR, caren.id, EPIC); return updatePiece(r0.st, r0.id, { bt }); };
  const full = (st: GearStore) => withMaterial(idx, ru, judge(ctx, EPIC, st), materialFor(poolView(ctx, st), EPIC));

  it('точная копия Speed-шлема Caren ниже T4 — «Фоддер» материалом для шлема Caren', () => {
    const r = full(withBt(0));

    expect(r).toMatchObject({ v: 'fodder', title: 'Фоддер — материал Breakthrough для шлема Caren · Speed' });
    expect(r.lines[0]).toMatch(/^\*\*Материал\*\*/);
  });

  it('точная копия записи на T4 — не материал: «Разбирай — уже не хуже у Caren»', () => {
    const st = withBt(4);

    const r = full(st);

    expect(materialFor(poolView(ctx, st), EPIC)).toEqual([]);
    expect(r).toMatchObject({ v: 'junk', worn: 'lower', title: 'Разбирай — уже не хуже у Caren' });
  });

  it('«Надеть» точной копии кладёт новую запись', () => {
    const st = withBt(0);

    const r = putOn(ctx, st, caren.id, EPIC);

    expect(r.id).not.toBe(st.pools[caren.id][0]);
    expect(r.st.pieces[r.id]).toMatchObject({ lit: EPIC.subs });
  });
});

it('без вещей у кого-либо вердикт тот же объект', () => {
  const res = evaluate(ctxOf([caren]), EPIC);
  expect(withWorn(ctxOf([caren]), poolView(ctxOf([caren]), EMPTY_GEAR), EPIC, res)).toBe(res);
});
