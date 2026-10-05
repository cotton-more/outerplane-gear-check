// Core Fusion (features/roster/fusion, правила владельца 2026-09-30): нормализация {ростер, хранилище} — есть X и Core Fusion X,
// остаётся CF; вещи X переходят к CF, если у CF пусто, иначе убраны (общие записи остаются у других); окно перехода
// в обе стороны и его «Вернуть»; загрузка v1 и v2 и код копии — через ту же нормализацию.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { buildKey, dropChar, undoDrop, updateIn, type GearStore, type Piece } from '@/features/gear/model/gear';
import { removeFrom } from '@/features/gear/pool';
import { normalizeFusion, normalizeStored, replacedX, switchFusion } from '@/features/roster/fusion';
import { makeCtx } from '@/game/context';
import { evaluate } from '@/features/eval/verdict/evaluate';
import { encodeGear, loadGear, readsWhole, unfuseChar } from '@/features/gear/store/gearStore';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const id = (name: string) => D.chars.find((c) => c.name === name)!.id;
const [X, CF, CAREN, KAPPA] = [id('Eternal'), id('Core Fusion Eternal'), id('Caren'), id('Kappa')];
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const P = (pid: string, slot: Piece['slot'] = 'helmet'): Piece =>
  ({ id: pid, slot, grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { SPD: 1 }, lit: { SPD: 1 }, bt: null, at: '' });
const v2 = (pools: Record<string, string[]>, extra: Partial<GearStore> = {}): GearStore => {
  const ids = [...new Set(Object.values(pools).flat())];
  return { v: 2, seq: ids.length, pieces: Object.fromEntries(ids.map((pid) => [pid, P(pid)])), pools, ...extra };
};
const v1 = (builds: Record<string, Record<string, string>>) => {
  const slots = new Map(Object.values(builds).flatMap((b) => Object.entries(b).map(([slot, pid]) => [pid, slot as Piece['slot']] as const)));
  return {
    v: 1, seq: slots.size, pieces: Object.fromEntries([...slots].map(([pid, slot]) => [pid, P(pid, slot)])),
    builds: Object.fromEntries(Object.entries(builds).map(([k, b]) => [k, { slots: b, at: '' }])),
  };
};

describe('нормализация: есть X и Core Fusion X — остаётся Core Fusion', () => {
  it('оба в ростере, вещей нет — в ростере Core Fusion на месте X', () => {
    const r = normalizeFusion(idx, [CAREN, X, KAPPA, CF], v2({}));
    expect(r.roster).toEqual([CAREN, KAPPA, CF]);
    expect(r.fixes).toEqual([{ base: X, fusion: CF, kind: 'none', ids: [] }]);
  });

  it('X в ростере, у Core Fusion вещи, его в ростере нет — Core Fusion встаёт на место X', () => {
    const r = normalizeFusion(idx, [CAREN, X], v2({ [CF]: ['p1'] }));
    expect(r.roster).toEqual([CAREN, CF]);
  });

  it('вещи у обоих — у Core Fusion свои как были, вещи X убраны из его пула и стёрты', () => {
    const r = normalizeFusion(idx, [CF], v2({ [X]: ['p1', 'p2'], [CF]: ['p3'] }));
    expect(r.st.pools).toEqual({ [CF]: ['p3'] });
    expect(Object.keys(r.st.pieces)).toEqual(['p3']);
    expect(r.fixes).toEqual([{ base: X, fusion: CF, kind: 'removed', ids: ['p1', 'p2'] }]);
  });

  it('вещи только у X, Core Fusion в ростере — вещи переходят к Core Fusion, записи те же', () => {
    const st = v2({ [X]: ['p1', 'p2'] });
    const r = normalizeFusion(idx, [X, CF], st);
    expect(r.st.pools).toEqual({ [CF]: ['p1', 'p2'] });
    expect(r.st.pieces).toEqual(st.pieces);
    expect(r.roster).toEqual([CF]);
    expect(r.fixes[0].kind).toBe('moved');
  });

  it('общая запись: вещь X, которая есть и у Core Fusion или у другого, остаётся у них; только своя X — стёрта', () => {
    const r = normalizeFusion(idx, [CF], v2({ [X]: ['p1', 'p2', 'p3'], [CF]: ['p1'], [KAPPA]: ['p2'] }));
    expect(r.st.pools).toEqual({ [CF]: ['p1'], [KAPPA]: ['p2'] });
    expect(Object.keys(r.st.pieces).sort()).toEqual(['p1', 'p2']);
  });

  // сам normalizeFusion ростер не трогает; Core Fusion в ростер добавит normalizeStored (Р16, ниже)
  it('оба только с вещами, в ростере никого из них — ростер не трогаем', () => {
    const r = normalizeFusion(idx, [CAREN], v2({ [X]: ['p1'], [CF]: ['p2'] }));
    expect(r.roster).toEqual([CAREN]);
  });

  it('отметки «Собираю» X не переносятся к Core Fusion, подсказка autoNew X убрана', () => {
    const st = v2({ [X]: ['p1'] }, { marks: { [buildKey(X, 'Speed')]: 'want' }, autoNew: [buildKey(X, 'Speed'), buildKey(CAREN, 'Speed')] });
    const r = normalizeFusion(idx, [CF], st);
    expect(Object.keys(r.st.marks ?? {}).filter((k) => k.startsWith(CF + '/'))).toEqual([]);
    expect(r.st.autoNew).toEqual([buildKey(CAREN, 'Speed')]);
  });

  it('конфликта нет — то же хранилище (без записи), тот же ростер', () => {
    const st = v2({ [CF]: ['p1'], [CAREN]: ['p2'] });
    const r = normalizeFusion(idx, [CF, CAREN], st);
    expect(r.st).toBe(st);
    expect(r.roster).toEqual([CF, CAREN]);
    expect(r.fixes).toEqual([]);
  });

  it('повторная нормализация ничего не меняет', () => {
    const once = normalizeFusion(idx, [X, CF], v2({ [X]: ['p1'], [CF]: ['p2'] }));
    const twice = normalizeFusion(idx, once.roster, once.st);
    expect(twice.fixes).toEqual([]);
    expect(twice.st).toBe(once.st);
  });
});

// Р16 (владелец 2026-09-30): вещи есть только у героев ростера — каждый с вещами попадает в ростер, потом правило Core Fusion
describe('normalizeStored: все с вещами — в ростере, затем Core Fusion', () => {
  it('персонаж с вещами вне ростера — в конец ростера, added', () => {
    const r = normalizeStored(idx, [CAREN], v2({ [KAPPA]: ['p1'] }));
    expect({ roster: r.roster, added: r.added }).toEqual({ roster: [CAREN, KAPPA], added: [KAPPA] });
  });

  it('X и Core Fusion оба с вещами, никого в ростере — в ростере Core Fusion, вещи X убраны', () => {
    const r = normalizeStored(idx, [CAREN], v2({ [X]: ['p1'], [CF]: ['p2'] }));
    expect({ roster: r.roster, pools: r.st.pools, pieces: Object.keys(r.st.pieces) }).toEqual({ roster: [CAREN, CF], pools: { [CF]: ['p2'] }, pieces: ['p2'] });
  });

  it('только X с вещами вне ростера, Core Fusion в ростере без вещей — вещи X к Core Fusion, X в ростер не попадает', () => {
    const r = normalizeStored(idx, [CF], v2({ [X]: ['p1'] }));
    expect({ roster: r.roster, pools: r.st.pools, added: r.added }).toEqual({ roster: [CF], pools: { [CF]: ['p1'] }, added: [] });
  });

  it('незнакомый id с вещами (герой пропал из данных) в ростер не добавляется, его пул на месте', () => {
    const r = normalizeStored(idx, [CAREN], v2({ gone: ['p1'] }));
    expect({ roster: r.roster, pools: r.st.pools }).toEqual({ roster: [CAREN], pools: { gone: ['p1'] } });
  });

  it('все с вещами уже в ростере — ничего не поменялось', () => {
    const st = v2({ [CAREN]: ['p1'] });
    const r = normalizeStored(idx, [CAREN, KAPPA], st);
    expect({ st: r.st === st, roster: r.roster, fixes: r.fixes, added: r.added }).toEqual({ st: true, roster: [CAREN, KAPPA], fixes: [], added: [] });
  });
});

// Р16: «Да, убрать» в окне снятия звезды и его «Вернуть»
describe('dropChar / undoDrop', () => {
  const st = () => v2({ [KAPPA]: ['p2'], [CAREN]: ['p1', 'p2'] }, { marks: { [buildKey(CAREN, 'Speed')]: 'want', [buildKey(KAPPA, 'Speed')]: 'skip' }, autoNew: [buildKey(CAREN, 'Speed')] });

  it('пул, отметки и autoNew героя уходят; общая запись остаётся у другого', () => {
    const r = dropChar(st(), CAREN);
    expect({ pools: r.st.pools, pieces: Object.keys(r.st.pieces), marks: r.st.marks, autoNew: r.st.autoNew })
      .toEqual({ pools: { [KAPPA]: ['p2'] }, pieces: ['p2'], marks: { [buildKey(KAPPA, 'Speed')]: 'skip' }, autoNew: undefined });
  });

  it('«Вернуть» — как было, и пул на прежнем месте', () => {
    const before = st();
    const r = dropChar(before, CAREN);
    const back = undoDrop(r.st, r.dropped);
    expect({ back, order: Object.keys(back.pools) }).toEqual({ back: before, order: [KAPPA, CAREN] });
  });

  it('«Вернуть», когда герою за эти секунды дали новую вещь — прежние на месте, новая после них', () => {
    const r = dropChar(st(), CAREN);
    const later = { ...r.st, seq: 3, pieces: { ...r.st.pieces, p3: P('p3') }, pools: { ...r.st.pools, [CAREN]: ['p3'] } };
    expect(undoDrop(later, r.dropped).pools[CAREN]).toEqual(['p1', 'p2', 'p3']);
  });
});

// Р17: запись при загрузке — только если чтение ничего не отбросило
describe('readsWhole', () => {
  it('чистый v2 — да; счётчик seq ниже номеров вещей и незнакомое поле верхнего уровня — не потеря', () => {
    expect([readsWhole(v2({ [CAREN]: ['p1'] }), idx), readsWhole({ ...v2({ [CAREN]: ['p1'] }), seq: 0, extra: { a: 1 } }, idx)]).toEqual([true, true]);
  });

  it('саб не из данных, отметка «maybe», пул с чужим id — отброшено', () => {
    const st = v2({ [CAREN]: ['p1'] });
    expect([
      readsWhole({ ...st, pieces: { p1: { ...P('p1'), yellow: { SPD: 1, NEWSUB: 2 } } } }, idx),
      readsWhole({ ...st, marks: { [buildKey(CAREN, 'Speed')]: 'maybe' } }, idx),
      readsWhole({ ...st, pools: { [CAREN]: ['p1', 'p9'] } }, idx),
    ]).toEqual([false, false, false]);
  });

  it('нет данных — нечего терять; мусор и v1 с вещью не в билде — отброшено; чистый v1 — да', () => {
    const clean = v1({ [buildKey(CAREN, 'Speed')]: { helmet: 'p1' } });
    expect([readsWhole(null, idx), readsWhole({ foo: 1 }, idx), readsWhole({ ...clean, pieces: { ...clean.pieces, p7: P('p7') } }, idx), readsWhole(clean, idx)])
      .toEqual([true, false, false, true]);
  });
});

describe('кто неактивен', () => {
  it('Core Fusion в ростере или с вещами — X неактивен; X в ростере или с вещами — Core Fusion неактивен; нет обоих — все активны', () => {
    expect([...replacedX(idx, [CF], {})]).toEqual([[X, CF]]);
    expect([...replacedX(idx, [], { [CF]: ['p1'] })]).toEqual([[X, CF]]);
    expect([...replacedX(idx, [X], { [X]: ['p1'] })]).toEqual([[CF, X]]);
    expect([...replacedX(idx, [X], {})]).toEqual([[CF, X]]);
    expect([...replacedX(idx, [], {})]).toEqual([]);
  });
});

describe('неактивный X — не кандидат вердикта', () => {
  const settings = { rosterOnly: false, fodder: true, stage: 'grow' as const, lv120: false, quirks: true };
  const item = { slot: 'helmet' as const, grade: 'unique' as const, setId: speed, itemKey: null, main: null, subs: { SPD: 2, CHC: 2, CHD: 2 } };
  const rowsOf = (off: Map<string, string>, roster: string[], rosterOnly: boolean) =>
    evaluate(makeCtx(idx, { ...settings, rosterOnly }, new Set(roster), undefined, off), item).sections.flatMap((x) => x.rows.map((r) => r.c.id));

  it('без «только мои»: X нет ни в одном разделе, Core Fusion — есть', () => {
    const ids = rowsOf(new Map([[X, CF]]), [CF], false);
    expect({ x: ids.includes(X), cf: ids.includes(CF) }).toEqual({ x: false, cf: true });
  });

  it('с «только мои»: X нет и среди «не в ростере»', () => {
    expect(rowsOf(new Map([[X, CF]]), [CF, CAREN], true)).not.toContain(X);
  });

  it('нет Core Fusion — X кандидат, как раньше', () => {
    expect(rowsOf(new Map(), [], false)).toContain(X);
  });
});

describe('окно перехода', () => {
  it('«Да, Core Fusion X»: Core Fusion на месте X, вещи X — у него; «Вернуть» — как было', () => {
    const st = v2({ [X]: ['p1'], [CAREN]: ['p2'] });
    const sw = switchFusion(idx, [CAREN, X], st, CF)!;
    expect(sw.roster).toEqual([CAREN, CF]);
    expect(sw.st.pools).toEqual({ [CAREN]: ['p2'], [CF]: ['p1'] });
    expect(unfuseChar(sw.st, sw.from, sw.to, sw).pools).toEqual(st.pools);
  });

  it('«Да, X»: X в ростере, Core Fusion нет, вещи Core Fusion — у X; «Вернуть» — как было', () => {
    const st = v2({ [CF]: ['p1', 'p2'] });
    const sw = switchFusion(idx, [CF, KAPPA], st, X)!;
    expect(sw.roster).toEqual([X, KAPPA]);
    expect(sw.st.pools).toEqual({ [X]: ['p1', 'p2'] });
    expect(unfuseChar(sw.st, sw.from, sw.to, sw).pools).toEqual(st.pools);
  });

  it('X только с вещами, не в ростере: Core Fusion добавлен в конец ростера', () => {
    const sw = switchFusion(idx, [CAREN], v2({ [X]: ['p1'] }), CF)!;
    expect(sw.roster).toEqual([CAREN, CF]);
  });

});

describe('загрузка и код: та же нормализация', () => {
  it('перенос v1: вещи только у X, в ростере X и Core Fusion — вещи у Core Fusion, в ростере он один', () => {
    const r = loadGear(v1({ [buildKey(X, 'Speed')]: { helmet: 'p1' } }), idx, [X, CF]);
    expect(r.st.pools).toEqual({ [CF]: ['p1'] });
    expect(r.roster).toEqual([CF]);
  });

  it('перенос v1: вещи у обоих — у Core Fusion его вещи, вещи X убраны', () => {
    const r = loadGear(v1({ [buildKey(X, 'Speed')]: { helmet: 'p1' }, [buildKey(CF, 'Speed')]: { helmet: 'p2' } }), idx, []);
    expect(r.st.pools).toEqual({ [CF]: ['p2'] });
    expect(Object.keys(r.st.pieces)).toEqual(['p2']);
  });

  it('перенос v1: autoNew — по итоговым пулам: у X без вещей его нет, у Core Fusion — по перешедшим вещам', () => {
    const [eps, cfEps] = [id('Epsilon'), id('Core Fusion Epsilon')];
    const r = loadGear(v1({ [buildKey(eps, 'Speed')]: { helmet: 'p1', armor: 'p2' } }), idx, [cfEps]);
    const autoNew = r.st.autoNew ?? [];
    expect(autoNew.filter((k) => k.startsWith(eps + '/'))).toEqual([]);
    expect(autoNew.some((k) => k.startsWith(cfEps + '/'))).toBe(true);
  });

  it('перенос v1: одна запись в билдах X и Core Fusion — остаётся у Core Fusion', () => {
    const r = loadGear(v1({ [buildKey(X, 'Speed')]: { helmet: 'p1', armor: 'p2' }, [buildKey(CF, 'Speed')]: { helmet: 'p1' } }), idx, [CF]);
    expect({ pools: r.st.pools, pieces: Object.keys(r.st.pieces) }).toEqual({ pools: { [CF]: ['p1'] }, pieces: ['p1'] });
  });

  it('v2 с обоими — вещи X убраны; тот же код копии — тот же итог', () => {
    const raw = v2({ [X]: ['p1'], [CF]: ['p2'] });
    const r = loadGear(raw, idx, [X]);
    expect({ pools: r.st.pools, roster: r.roster }).toEqual({ pools: { [CF]: ['p2'] }, roster: [CF] });
    expect(loadGear(JSON.parse(JSON.stringify(raw)), idx, [X]).st).toEqual(r.st);
    expect(encodeGear(r.st).startsWith('OGC-GEAR2 ')).toBe(true);
  });
});

// «Надето», шаг 1: надетое X идёт за его вещами к Core Fusion X; выбранный билд (aim) не переходит
describe('Core Fusion: надетое идёт за вещами', () => {
  const xAim = buildKey(X, 'Speed');
  const dressedX = (extra: Partial<GearStore> = {}) =>
    v2({ [X]: ['p1', 'p2'], ...extra.pools }, { worn: { [X]: { helmet: 'p1' }, ...extra.worn }, aim: { [X]: xAim, ...extra.aim } });

  it('moved: у Core Fusion пусто — надетое X на нём, билда у него нет, у X — ни того, ни другого', () => {
    const n = normalizeFusion(idx, [X, CF], dressedX());
    expect({ kind: n.fixes[0].kind, worn: n.st.worn, aim: n.st.aim }).toEqual({ kind: 'moved', worn: { [CF]: { helmet: 'p1' } }, aim: undefined });
  });

  it('removed: у Core Fusion свои вещи — надетое X убрано, своё надетое Core Fusion — как было', () => {
    const st = dressedX({ pools: { [CF]: ['p3'] }, worn: { [CF]: { helmet: 'p3' } }, aim: { [CF]: buildKey(CF, 'Speed') } });
    const n = normalizeFusion(idx, [X, CF], st);
    expect({ kind: n.fixes[0].kind, worn: n.st.worn, aim: n.st.aim })
      .toEqual({ kind: 'removed', worn: { [CF]: { helmet: 'p3' } }, aim: { [CF]: buildKey(CF, 'Speed') } });
  });

  it('«Да, Core Fusion X»: надетое X — на Core Fusion, билда у Core Fusion нет; «Вернуть» — надетое снова на X', () => {
    const st = dressedX();
    const sw = switchFusion(idx, [X], st, CF)!;
    const back = unfuseChar(sw.st, sw.from, sw.to, sw);
    expect({ worn: sw.st.worn, aim: sw.st.aim, back: back.worn, backAim: back.aim })
      .toEqual({ worn: { [CF]: { helmet: 'p1' } }, aim: undefined, back: st.worn, backAim: undefined });
  });

  it('переход, когда у Core Fusion свой надетый шлем: он остаётся; «Вернуть» — у X снова его шлем', () => {
    const st = dressedX({ pools: { [CF]: ['p3'] }, worn: { [CF]: { helmet: 'p3' } } });
    const sw = switchFusion(idx, [X, CF], st, CF)!;
    const back = unfuseChar(sw.st, sw.from, sw.to, sw);
    expect({ worn: sw.st.worn, back: back.worn }).toEqual({ worn: { [CF]: { helmet: 'p3' } }, back: { [X]: { helmet: 'p1' }, [CF]: { helmet: 'p3' } } });
  });

  it('«Вернуть» правила Core Fusion из App (moved, без снимка): надетое перешедших — снова на X', () => {
    const n = normalizeFusion(idx, [X, CF], dressedX());
    const f = n.fixes[0];
    expect(unfuseChar(n.st, f.base, f.fusion, { moved: f.ids, had: [] }).worn).toEqual({ [X]: { helmet: 'p1' } });
  });

  it('после перехода Core Fusion убрал свой надетый шлем: «Вернуть» — у X снова надет его шлем', () => {
    const st = dressedX({ pools: { [CF]: ['p3'] }, worn: { [CF]: { helmet: 'p3' } } });
    const sw = switchFusion(idx, [X, CF], st, CF)!;
    const gone = removeFrom(sw.st, CF, 'p3');
    expect(unfuseChar(gone, sw.from, sw.to, sw).worn).toEqual({ [X]: { helmet: 'p1' } });
  });

  // правка общей записи у Core Fusion — ему копия (новая вещь Core Fusion, остаётся у него и надета на нём); X
  // возвращается его прежняя запись — и надетой
  it('после перехода Core Fusion поправил общую надетую запись (копия): «Вернуть» — у X надета прежняя, у CF — копия', () => {
    const st = v2({ [X]: ['p1'], [CAREN]: ['p1'] }, { worn: { [X]: { helmet: 'p1' } } });
    const sw = switchFusion(idx, [X, CAREN], st, CF)!;
    const edited = updateIn(idx, sw.st, CF, 'p1', { lit: { SPD: 2 } });
    const back = unfuseChar(edited.st, sw.from, sw.to, sw);
    expect({ pools: back.pools, worn: back.worn })
      .toEqual({ pools: { [X]: ['p1'], [CAREN]: ['p1'], [CF]: [edited.id] }, worn: { [X]: { helmet: 'p1' }, [CF]: { helmet: edited.id } } });
  });
});
