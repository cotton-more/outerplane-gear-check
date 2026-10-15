// The hero list under the verdict stamp (features/gear/model/heroList, 0230 B): groups «Вместо надетого» / «В пустой слот» /
// «Отложить», the stamp's hero (★) and their group first, 3 rows + the rest in `more`, gain ≥ 1 point, the main-fit rule
// for a weapon or accessory into an empty slot, set parts turned on / off, and the row for name search.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { pieceInput, type Piece, type Worn } from '@/features/gear/model/gear';
import { poolView } from '@/features/gear/pool';
import { piecePoints } from '@/features/gear/layout';
import { heroList, heroRow, LIST_CAP, type HeroGroup } from '@/features/gear/model/heroList';
import { verdictOf } from '@/features/gear/verdict';
import { char, idx, mk, prof, setId } from './statSets';

const inputOf = (p: Piece): ItemInput => ({ ...pieceInput(p), bt: p.bt === 4 ? 4 : p.bt === null ? null : 0 });

// a roster (names) and pools by name; worn — what is worn by name (default: the whole pool)
function world(roster: string[], pools: Record<string, Piece[]> = {}, worn: Record<string, string[]> = {}) {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st = { pieces: {} as Record<string, Piece>, pools: {} as Record<string, string[]>, worn: {} as Record<string, Worn> };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    const on = worn[name] ?? list.map((p) => p.id);
    st.worn[id] = Object.fromEntries(list.filter((p) => on.includes(p.id)).map((p) => [p.slot, p.id]));
  }
  const view = poolView(ctx, st);
  const res = (x: Piece) => verdictOf(ctx, view.hero, inputOf(x));
  return {
    res,
    list: (x: Piece) => heroList(ctx, () => view, inputOf(x), res(x)),
    row: (name: string, x: Piece, any = false) => heroRow(ctx, view, char(name).id, inputOf(x), { any }),
  };
}
const kinds = (gs: HeroGroup[]) => gs.map((g) => g.kind);
const names = (g: HeroGroup | undefined, more = false) => (g ? (more ? g.more : g.rows).map((r) => r.vs.c.name) : []);
const group = (gs: HeroGroup[], kind: HeroGroup['kind']) => gs.find((g) => g.kind === kind);

const NINE = ['Rin', 'Caren', 'Aer', 'Fran', 'Charlotte', 'Delta', 'Kanon', 'Maxie', 'Sigma'];
// an Attack helmet good for most of NINE (naked): Rin, Aer +6,85, Charlotte, Delta +6,05, …
const atkHelmet = () => mk('x1', 'helmet', 'Attack', { CHC: 3, CHD: 3, SPD: 1, 'ATK%': 2 }, 0);

describe('heroList: groups, order, cap', () => {
  it('every naked hero it lifts by ≥ 1 point is in «В пустой слот»: 3 rows by gain, the rest in more; the stamp\'s hero ★ first', () => {
    const gs = world(NINE).list(atkHelmet());
    expect(kinds(gs)).toEqual(['empty']);
    const [g] = gs;
    expect(g.rows).toHaveLength(LIST_CAP);
    expect(names(g)).toEqual(['Rin', 'Aer', 'Charlotte']);
    expect(g.rows[0].star).toBe(true);
    expect(g.rows.slice(1).some((r) => r.star)).toBe(false);
    // Maxie and Sigma fail the bar (the stamp would not wear it on them), but it still lifts them ≥ 1 point if worn
    expect(names(g, true)).toEqual(['Delta', 'Fran', 'Sigma', 'Caren', 'Kanon', 'Maxie']);
    const all = [...g.rows, ...g.more];
    expect(all.every((r, i) => i < 1 || r.gain <= all[i - 1].gain + 1e-9)).toBe(true);
    expect(all.every((r) => r.action === 'wear' && r.was === null && r.stash === null)).toBe(true);
    // the detail: the piece's substats marked for that hero (scoreBuild, as the SubToken chips)
    expect(g.rows[0].vs.chain.parts.map((p) => p.key).sort()).toEqual(['ATK%', 'CHC', 'CHD', 'SPD']);
  });

  it('a worn piece in the slot — «Вместо надетого» with «Заменить», what it replaces and its points; the ★ group goes first', () => {
    const old = mk('old', 'helmet', 'Attack', { CHC: 1, CHD: 1, RES: 1, EFF: 1 });
    const gs = world(NINE, { Rin: [old] }).list(atkHelmet());
    // the stamp names Aer (empty slot), so «В пустой слот» comes before «Вместо надетого»
    expect(kinds(gs)).toEqual(['empty', 'replace']);
    expect(gs[0].rows[0].star).toBe(true);
    expect(gs[0].rows[0].vs.c.name).toBe('Aer');
    const [rin] = gs[1].rows;
    expect(rin).toMatchObject({ action: 'replace', star: false });
    expect(rin.vs.c.name).toBe('Rin');
    expect(rin.gain).toBeCloseTo(5.4, 9);
    expect(rin.was).toMatchObject({ worn: true, pts: piecePoints(prof('Rin'), old) });
    expect(rin.was!.piece.id).toBe('old');
    expect(rin.was!.marks.map((p) => p.key).sort()).toEqual(['CHC', 'CHD', 'EFF', 'RES']);
    expect(rin.was!.marks.filter((p) => p.ok).map((p) => p.key).sort()).toEqual(['CHC', 'CHD']);
  });

  it('a hero it lifts by less than 1 point is left out; exactly 1 point is in; no stamp hero — no ★', () => {
    const w = world(NINE);
    const weak = mk('w', 'helmet', 'Attack', { 'ATK%': 1, RES: 1, EFF: 1, 'DEF%': 1 }, 0);
    expect(w.res(weak)!.kind).toBe('junk');
    const gs = w.list(weak);
    expect(kinds(gs)).toEqual(['empty']);
    expect([...names(gs[0]), ...names(gs[0], true)]).toEqual(['Maxie', 'Sigma', 'Aer', 'Caren', 'Kanon', 'Rin']);
    expect(w.row('Aer', weak)!.gain).toBeCloseTo(1, 9);
    for (const n of ['Fran', 'Charlotte', 'Delta']) expect(w.row(n, weak)!.gain).toBeLessThan(1);
    expect([...gs[0].rows, ...gs[0].more].some((r) => r.star)).toBe(false);
  });
});

describe('heroList: a weapon or accessory into an empty slot needs a fitting main (the filler test)', () => {
  const acc = (main: string) => mk('a-' + main, 'accessory', null, { CHC: 3, CHD: 3, 'ATK%': 2 }, 0, { grade: 'rare', main });

  it('HP% main: only Delta, whose builds take it; Rin would gain 6+ points from the substats but is left out', () => {
    const w = world(NINE);
    expect(names(group(w.list(acc('HP%')), 'empty'))).toEqual(['Delta']);
    expect(w.row('Rin', acc('HP%'))!.gain).toBeGreaterThan(6);
  });

  it('SPD main: the heroes whose builds ask an SPD accessory', () => {
    const gs = world(NINE).list(acc('SPD'));
    expect([...names(group(gs, 'empty')), ...names(group(gs, 'empty'), true)]).toEqual(['Charlotte', 'Fran', 'Sigma', 'Maxie']);
  });
});

describe('heroList: set parts on / off', () => {
  it('the fourth Speed piece turns on Speed ×4', () => {
    const speed = [mk('sA', 'armor', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 }), mk('sG', 'gloves', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 }), mk('sB', 'shoes', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 })];
    const [g] = world(['Rin'], { Rin: speed }).list(mk('sH', 'helmet', 'Speed', { CHC: 2, CHD: 2, 'ATK%': 2, SPD: 1 }, 0));
    expect(g.rows[0].parts).toEqual({ on: [{ set: setId('Speed'), n: 4 }], off: [] });
  });

  it('a Defense helmet over Caren\'s weak Speed one turns Speed ×2 off and still gains', () => {
    const car = [mk('qH', 'helmet', 'Speed', { RES: 1, EFF: 1, HP: 1 }), mk('qG', 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2 })];
    const gs = world(['Caren'], { Caren: car }).list(mk('dH', 'helmet', 'Defense', { 'DEF%': 6, CHC: 4, CHD: 2, SPD: 2 }, 0));
    expect(kinds(gs)).toEqual(['replace']);
    expect(gs[0].rows[0]).toMatchObject({ action: 'replace', star: true, parts: { on: [], off: [{ set: setId('Speed'), n: 2 }] } });
    expect(gs[0].rows[0].gain).toBeGreaterThanOrEqual(1);
  });

  it('below the bar the gain and the parts are counted as if it stood: a weak 4th Speed piece turns Speed ×4 on', () => {
    const speed = [mk('sA', 'armor', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 }), mk('sG', 'gloves', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 }), mk('sB', 'shoes', 'Speed', { CHC: 3, CHD: 2, 'ATK%': 2 })];
    const w = world(['Rin'], { Rin: speed });
    const weak = mk('wH', 'helmet', 'Speed', { CHC: 1, RES: 1, EFF: 1, HP: 1 }, 0);
    expect(w.res(weak)!.heroes[0]).toMatchObject({ bar: false, dV: 0 });
    const r = w.row('Rin', weak)!;
    expect(r.gain).toBeGreaterThan(10);
    expect(r.parts.on).toEqual([{ set: setId('Speed'), n: 4 }]);
  });
});

describe('heroList: «Отложить»', () => {
  const cDefs = () => [
    mk('cH', 'helmet', 'Defense', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }),
    mk('cA', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
    mk('cG', 'gloves', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
    mk('cS', 'shoes', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 1, SPD: 1 }),
  ];
  const speedCaren = () => [mk('sG', 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }), mk('sB', 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 })];
  const weakSpd = (id: string) => mk(id, 'helmet', 'Speed', { SPD: 1, CHC: 2, RES: 1, EFF: 1 }, 0);

  it('«Оставь» for Caren: a «держи» row with «Отложить», the stamp\'s hero; the replaced piece is still described', () => {
    const gs = world(['Caren'], { Caren: cDefs() }).list(mk('ah', 'helmet', 'Attack', { 'DEF%': 6, CHC: 6, CHD: 2, SPD: 2 }));
    expect(kinds(gs)).toEqual(['stash']);
    expect(gs[0].rows[0]).toMatchObject({ stash: 'keep', action: 'stash', star: true });
    expect(gs[0].rows[0].vs.stash).toBe(true);
    expect(gs[0].rows[0].was!.piece.id).toBe('cH');
  });

  it('a reserve for Caren comes first (★), then the naked heroes it lifts ≥ 1 point', () => {
    const w = world(['Caren', 'Rin', 'Aer'], { Caren: speedCaren() });
    expect(w.res(weakSpd('wB'))).toMatchObject({ kind: 'material', sub: 'reserve' });
    const gs = w.list(weakSpd('wB'));
    expect(kinds(gs)).toEqual(['stash', 'empty']);
    expect(gs[0].rows[0]).toMatchObject({ stash: 'reserve', action: 'stash', star: true });
    expect(names(gs[1])).toEqual(['Aer', 'Rin']);
    expect(gs[1].rows.every((r) => r.action === 'wear' && r.gain >= 1)).toBe(true);
  });

  // useVerdictModel's guard: only the hero who has it keeps the button (it wears that very record: charVs says «Заменить»,
  // putting it on drops the set-aside copy)
  it('the same-piece guard: it looks like Caren\'s set-aside one — no «Отложить», only Caren keeps a button', () => {
    const w = world(['Caren', 'Rin', 'Aer'], { Caren: [...speedCaren(), weakSpd('wA')] }, { Caren: ['sG', 'sB'] });
    expect(w.res(weakSpd('wC'))!.same?.c.name).toBe('Caren');
    const gs = w.list(weakSpd('wC'));
    expect(kinds(gs)).not.toContain('stash');
    const rows = gs.flatMap((g) => [...g.rows, ...g.more]);
    expect(rows.map((r) => [r.vs.c.name, r.action])).toEqual([['Caren', 'replace'], ['Aer', null], ['Rin', null]]);
  });

  // the holder of a piece that is «Оставь» for them: the stamp says keep, so no button may swap their worn piece for it
  it('the same-piece guard + «Оставь»: one «держи» row, no button', () => {
    const ah = mk('ah', 'helmet', 'Attack', { 'DEF%': 6, CHC: 6, CHD: 2, SPD: 2 });
    const w = world(['Caren'], { Caren: [...cDefs(), { ...ah, id: 'ah0' }] }, { Caren: ['cH', 'cA', 'cG', 'cS'] });
    expect(w.res(ah)).toMatchObject({ kind: 'keep', same: { c: { name: 'Caren' } } });
    const gs = w.list(ah);
    expect(kinds(gs)).toEqual(['stash']);
    expect(gs[0].rows).toHaveLength(1);
    expect(gs[0].rows[0]).toMatchObject({ stash: 'keep', action: null, star: true });
  });
});

describe('heroRow: name search', () => {
  it('any: a row with «Надеть» whatever the gain', () => {
    const weak = mk('w', 'helmet', 'Attack', { 'ATK%': 1, RES: 1, EFF: 1, 'DEF%': 1 }, 0);
    const r = world(NINE).row('Delta', weak, true)!;
    expect(r.gain).toBeLessThan(1);
    expect(r).toMatchObject({ action: 'wear', star: false, stash: null });
    expect(r.vs.useful).toBe(true);
  });
});
