// Вердикт новой вещи и пул героя по «статам + сетам» (.x/0085-stat-set-model, TESTS T5, T6; FORMULA §4, §5) и
// свойство C1 прототипа: вердикт и пул согласны.
import { describe, expect, it } from 'vitest';
import type { Char } from '@/game/data/types';
import { makeCtx, type Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { pieceInput, type Piece, type Worn } from '@/features/gear/model/gear';
import { poolView, type PoolView } from '@/features/gear/pool';
import { poolInfo, pieceBar } from '@/features/gear/pool/info';
import { piecePoints } from '@/features/gear/layout';
import { verdictOf, type HeroRes, type Result } from '@/features/gear/verdict';
import { ARMOR, char, gen, idx, mk, prof, randArmor, randPool, twenty, type Gen } from './statSets';

const inputOf = (p: Piece): ItemInput => ({ ...pieceInput(p), bt: p.bt === 4 ? 4 : p.bt === null ? null : 0 });

// мир: ростер (имена), пулы по именам и надетое (по умолчанию — все вещи пула надеты)
interface World { ctx: Ctx; view: PoolView; v: (x: Piece) => Result | null; hero: (name: string, r: Result) => HeroRes }
function world(roster: string[], pools: Record<string, Piece[]> = {}, worn?: Record<string, string[]>): World {
  const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set(roster.map((n) => char(n).id)));
  const st = { pieces: {} as Record<string, Piece>, pools: {} as Record<string, string[]>, worn: {} as Record<string, Worn> };
  for (const [name, list] of Object.entries(pools)) {
    const id = char(name).id;
    for (const p of list) st.pieces[p.id] = p;
    st.pools[id] = list.map((p) => p.id);
    const on = worn?.[name] ?? list.map((p) => p.id);
    st.worn[id] = Object.fromEntries(list.filter((p) => on.includes(p.id)).map((p) => [p.slot, p.id]));
  }
  const view = poolView(ctx, st);
  return {
    ctx, view, v: (x) => verdictOf(ctx, view.hero, inputOf(x)),
    hero: (name, r) => r.heroes.find((h) => h.c.name === name)!,
  };
}
const kindOf = (r: Result | null) => (r ? r.kind + (r.sub ? ' ' + r.sub : '') : 'null');
const names = (cs: { c: Char }[] | Char[]) => cs.map((x) => ('c' in x ? x.c : x).name);

// Caren в примерах: Defense ×4, V 44,15
const cDefs = () => [
  mk('cH', 'helmet', 'Defense', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }),
  mk('cA', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
  mk('cG', 'gloves', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
  mk('cS', 'shoes', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 1, SPD: 1 }),
];
const rinGood = () => mk('rg', 'helmet', 'Attack', { CHC: 1, CHD: 1, SPD: 1, 'ATK%': 1 });

describe('T5 вердикт новой вещи', () => {
  it('T5.1 (вопросы 10, 11): голый Rin — 1,00 очка без порога «Разобрать», 2,95 с порогом «Надень» (ΔV 2,95)', () => {
    const w = world(['Rin']);
    const weak = mk('x10', 'helmet', 'Attack', { 'ATK%': 1, RES: 1, EFF: 1, 'DEF%': 1 });
    expect(piecePoints(prof('Rin'), weak)).toBeCloseTo(1, 9);
    expect(kindOf(w.v(weak))).toBe('junk');
    const r = w.v(rinGood())!;
    expect(r.kind).toBe('wear');
    expect(r.named[0].dV).toBeCloseTo(2.95, 9);
    expect(r.named[0].slotEmpty).toBe(true);
  });

  it('T5.1а (вопрос 11): слабая вещь лучше надетой — не «Надень»; тихая строка называет героя и прирост', () => {
    const old = mk('old', 'helmet', 'Attack', { CHC: 3, CHD: 2, RES: 1, EFF: 1 });
    const w = world(['Rin'], { Rin: [old] });
    const weak = mk('wk', 'helmet', 'Attack', { 'ATK%': 4, CHC: 2, RES: 1, EFF: 1 });
    const P = prof('Rin');
    expect(pieceBar(P, weak).pass).toBe(false);
    expect(piecePoints(P, weak) - piecePoints(P, old)).toBeGreaterThanOrEqual(1);
    const r = w.v(weak)!;
    expect(r.kind).not.toBe('wear');
    expect(r.kind).not.toBe('keep');
    expect(r.quiet?.c.name).toBe('Rin');
    expect(r.quiet?.slotEmpty).toBe(false);
    expect(r.quiet!.dV).toBeCloseTo(piecePoints(P, weak) - piecePoints(P, old), 9);
    expect(r.quiet?.stats).toEqual(['ATK%', 'CHC']);
  });

  it('T5.1б: в лучшей раскладке только надетые вещи и прошедшие порог', () => {
    const g = gen(51);
    for (const c of twenty().slice(0, 8)) {
      const P = prof(c);
      for (let i = 0; i < 25; i++) {
        const pool = randPool(g, P, 3, true);
        const worn = new Set(pool.filter(() => g.rnd() < 0.3).map((p) => p.id));
        const info = poolInfo(P, pool, worn);
        for (const p of Object.values(info.layout)) expect(worn.has(p.id) || pieceBar(P, p).pass).toBe(true);
      }
    }
  });

  it('T5.1в (вопрос 13): шлем Rin 11,20 очка прошёл порог «или 6+» → «Надень», ΔV 8,25', () => {
    const w = world(['Rin'], { Rin: [mk('r295', 'helmet', 'Attack', { CHC: 1, CHD: 1, SPD: 1, 'ATK%': 1 })] });
    const x = mk('r1120', 'helmet', 'Attack', { CHC: 5, 'ATK%': 5, ATK: 2, 'DMG UP%': 3 });
    expect(piecePoints(prof('Rin'), x)).toBeCloseTo(11.2, 9);
    const r = w.v(x)!;
    expect(r.kind).toBe('wear');
    expect(r.named[0].dV).toBeCloseTo(8.25, 9);
    expect(r.named[0].replaced?.id).toBe('r295');
  });

  it('T5.2: порог «Надень» — прирост на 0,90 нет, на 1,00 да', () => {
    const w = world(['Rin'], { Rin: [mk('old', 'helmet', 'Attack', { CHC: 3, CHD: 2, RES: 1, EFF: 1 })] });
    const g09 = mk('g09', 'helmet', 'Attack', { CHC: 3, CHD: 2, SPD: 1, 'DMG UP%': 1 });
    const g10 = mk('g10', 'helmet', 'Attack', { CHC: 3, CHD: 2, 'ATK%': 1, EFF: 1 });
    const r09 = w.v(g09)!, r10 = w.v(g10)!;
    expect(w.hero('Rin', r09).dV).toBeCloseTo(0.9, 9);
    expect(r09.kind).not.toBe('wear');
    expect(w.hero('Rin', r10).dV).toBeCloseTo(1, 9);
    expect(r10.kind).toBe('wear');
  });

  it('T5.3: Pen-шлем 4,95 у Caren в Def ×4 → «Оставь (а)»', () => {
    const w = world(['Caren'], { Caren: cDefs() });
    const x = mk('penH', 'helmet', 'Penetration', { 'DEF%': 3, CHC: 1, CHD: 1, SPD: 1 });
    expect(piecePoints(prof('Caren'), x)).toBeCloseTo(4.95, 9);
    const r = w.v(x)!;
    expect(kindOf(r)).toBe('keep a');
    expect(r.named[0].c.name).toBe('Caren');
  });

  it('T5.4: Pen-шлем Anarky на T0 → «Оставь (а)» + «сделай Breakthrough до T4»; на T4 — без строки', () => {
    const pool = [
      mk('hD', 'helmet', 'Defense', { 'DEF%': 2, CHC: 3, CHD: 2, SPD: 1 }),
      mk('aD', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
      mk('pG', 'gloves', 'Penetration', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 2 }),
      mk('pB', 'shoes', 'Penetration', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }),
    ];
    const w = world(['Anarky'], { Anarky: pool });
    const r0 = w.v(mk('pH0', 'helmet', 'Penetration', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }, 0))!;
    expect(kindOf(r0)).toBe('keep a');
    expect(r0.named[0].needBt).toBe(true);
    const r4 = w.v(mk('pH4', 'helmet', 'Penetration', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }, 4))!;
    expect(kindOf(r4)).toBe('keep a');
    expect(r4.named[0].needBt).toBe(false);
  });

  it('T5.5: чужой сет — планка 4,75 + U/2 3,75 + 1 = 9,50: шлем Critical Hit на 9,50 «Оставь (б)», на 9,40 «Разобрать»', () => {
    const pool = [mk('cH5', 'helmet', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }), ...cDefs().slice(1)];
    const w = world(['Caren'], { Caren: pool });
    const P = prof('Caren');
    expect(piecePoints(P, pool[0]) + P.U / 2 + 1).toBeCloseTo(9.5, 9);
    const at = mk('fx', 'helmet', 'Critical Hit', { 'DEF%': 4, CHC: 3, CHD: 4, SPD: 1 });
    const below = mk('fy', 'helmet', 'Critical Hit', { 'DEF%': 4, CHC: 3, CHD: 4, 'DMG UP%': 1 });
    expect(piecePoints(P, at)).toBeCloseTo(9.5, 9);
    expect(piecePoints(P, below)).toBeCloseTo(9.4, 9);
    expect(kindOf(w.v(at))).toBe('keep b');
    expect(kindOf(w.v(below))).toBe('junk');
  });

  // Caren носит Speed-шлем T0 (7,70, порог прошёл), Speed-перчатки и ботинки на T4
  const speedCaren = () => [
    mk('sH0', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 0),
    mk('sG', 'gloves', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
    mk('sB', 'shoes', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
  ];
  const weakSpd = (id: string, bt: 0 | 4 = 0) => mk(id, 'helmet', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, bt);

  it('T5.6 (A1): годная копия на +0,50 и слабая копия → «сделай Breakthrough сейчас» для шлема Caren', () => {
    const w = world(['Caren'], { Caren: speedCaren() });
    for (const x of [mk('good8', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 }, 0), weakSpd('weak1')]) {
      const r = w.v(x)!;
      expect(kindOf(r)).toBe('material now');
      expect(r.now.map((n) => n.piece.id)).toEqual(['sH0']);
    }
  });

  it('T5.6а (D6): вещь на T4 материалом не бывает', () => {
    const w = world(['Caren'], { Caren: speedCaren() });
    expect(kindOf(w.v(weakSpd('w4', 4)))).toBe('junk');
  });

  it('T5.7 (A2): слабый Speed-шлем у Caren без Speed-шлема → запас; второй такой же → «Разобрать» (и при пустом слоте)', () => {
    const [, sG, sB] = speedCaren();
    const dHelm = mk('dHelm', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    for (const base of [[sG, sB], [sG, sB, dHelm]]) {
      const w1 = weakSpd('weakA');
      const r1 = world(['Caren'], { Caren: base }).v(w1)!;
      expect(kindOf(r1)).toBe('material reserve');
      expect(names(r1.reserve)).toEqual(['Caren']);
      const w2 = world(['Caren'], { Caren: [...base, w1] }, { Caren: base.map((p) => p.id) });
      expect(kindOf(w2.v(weakSpd('weakB')))).toBe('junk');
    }
  });

  it('T5.7b: годный Speed-шлем при запасе в пуле → «Оставь (а)» и запасная — ему в Breakthrough; потом она «больше не нужна»', () => {
    const [, sG, sB] = speedCaren();
    const dHelm = mk('dHelm', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const weakA = weakSpd('weakA');
    const w = world(['Caren'], { Caren: [sG, sB, dHelm, weakA] }, { Caren: ['sG', 'sB', 'dHelm'] });
    const good = mk('sH0b', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }, 0);
    const r = w.v(good)!;
    expect(kindOf(r)).toBe('keep a');
    expect(r.named[0].reserveBt?.id).toBe('weakA');
    const after = poolInfo(prof('Caren'), [sG, sB, dHelm, weakA, good], new Set(['sG', 'sB', 'dHelm']));
    expect(after.unneeded.map((p) => p.id)).toContain('weakA');
  });

  it('T5.7а (вопрос 14): аксессуар Fran не с тем main → запас; второй → «Разобрать»; годный → «Надень» и запасной ему в Breakthrough', () => {
    const acc = (id: string, main: string, bt: 0 | 4 = 0) => mk(id, 'accessory', null, { CHD: 2, 'ATK%': 2, RES: 2, 'HP%': 2 }, bt, { itemKey: '1017', main });
    const bad = acc('xBad', 'CHC');
    expect(pieceBar(prof('Fran'), bad).pass).toBe(false);
    const r1 = world(['Fran']).v(bad)!;
    expect(kindOf(r1)).toBe('material reserve');
    expect(names(r1.reserve)).toEqual(['Fran']);
    const w2 = world(['Fran'], { Fran: [bad] }, { Fran: [] });
    expect(kindOf(w2.v(acc('xBad2', 'CHC')))).toBe('junk');
    const r3 = w2.v(acc('xGood', 'SPD'))!;
    expect(r3.kind).toBe('wear');
    expect(r3.named[0].reserveBt?.id).toBe('xBad');
    // X уже есть у Fran ниже T4 (годный) → материал сейчас, не запас
    const w4 = world(['Fran'], { Fran: [acc('xHeld', 'SPD')] });
    const r4 = w4.v(acc('xBad3', 'CHC'))!;
    expect(kindOf(r4)).toBe('material now');
    expect(r4.now.map((n) => n.piece.id)).toEqual(['xHeld']);
  });

  it('T5.8: Life-броня, ростер {Caren} → «Спорно» для Delta и Gnosis Viella', () => {
    const r = world(['Caren'], { Caren: cDefs() }).v(mk('lifeX', 'armor', 'Life', { 'HP%': 3, CHC: 2, CHD: 2, 'ATK%': 1 }))!;
    expect(r.kind).toBe('maybe');
    expect(names(r.maybe)).toEqual(expect.arrayContaining(['Delta', 'Gnosis Viella']));
  });

  it('T5.9: мусор → «Разобрать»', () => {
    expect(kindOf(world(['Caren'], { Caren: cDefs() }).v(mk('trash', 'helmet', 'Attack', { RES: 2, EFF: 1, HP: 1, 'DMG RED%': 1 })))).toBe('junk');
  });

  it('T5.10 (A15): «Надень» сильнее «Оставь» — Pen-шлем: Caren «Оставь», голый Rin «Надень» → «Надень» на Rin', () => {
    const w = world(['Caren', 'Rin'], { Caren: cDefs() });
    const r = w.v(mk('penG', 'helmet', 'Penetration', { CHC: 1, CHD: 1, SPD: 1, 'ATK%': 1 }))!;
    expect(w.hero('Caren', r).kind).toBe('keep');
    expect(w.hero('Rin', r).kind).toBe('wear');
    expect(r.kind).toBe('wear');
    expect(names(r.named)).toEqual(['Rin']);
  });

  it('T5.11: чужой сет — Rin в ростере рассматривается («Надень»); не в ростере — нет', () => {
    const life = mk('lifeR', 'helmet', 'Life', { 'ATK%': 3, CHC: 3, CHD: 2, SPD: 1 });
    expect(world(['Rin']).v(life)!.kind).toBe('wear');
    const r = world(['Caren'], { Caren: cDefs() }).v(life)!;
    expect(r.kind).toBe('maybe');
    expect(names(r.maybe)).not.toContain('Rin');
  });

  it('T5.12 (A10): называет героя с наибольшей пользой и ещё до двух', () => {
    const w = world(['Rin', 'Valentine', 'Delta', 'Caren']);
    const r = w.v(rinGood())!;
    expect(r.named.map((h) => [h.c.name, +h.dV.toFixed(2)])).toEqual([['Rin', 2.95], ['Valentine', 2.95], ['Delta', 2.45]]);
    expect(w.hero('Caren', r).kind).toBe('wear');
  });

  it('T5.13 (A20, A21): пустой ростер и 3 из 4 сабстатов — вердикт не считается', () => {
    expect(world([]).v(rinGood())).toBeNull();
    expect(world(['Rin']).v(mk('part', 'helmet', 'Attack', { CHC: 3, CHD: 2, SPD: 1 }))).toBeNull();
  });
});

describe('T6 пул героя', () => {
  it('T6.1: после истории Anarky держатся 6 вещей', () => {
    const pool = [
      mk('hD', 'helmet', 'Defense', { 'DEF%': 2, CHC: 3, CHD: 2, SPD: 1 }),
      mk('aD', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
      mk('pG', 'gloves', 'Penetration', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 2 }),
      mk('pB', 'shoes', 'Penetration', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }),
      mk('pH', 'helmet', 'Penetration', { 'DEF%': 4, CHC: 3, CHD: 2, SPD: 1 }),
      mk('dB', 'shoes', 'Defense', { 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 }),
    ];
    const info = poolInfo(prof('Anarky'), pool, new Set(['pH', 'aD', 'pG', 'dB']));
    expect(info.why.size).toBe(6);
    expect(info.unneeded).toEqual([]);
    expect(info.why.get('hD')).toEqual(['menu-best']);
    expect(info.why.get('pB')).toEqual(['menu-best']);
  });

  const sT0 = () => mk('sT0', 'helmet', 'Speed', { 'DEF%': 4, CHC: 4, CHD: 2, SPD: 2 }, 0);
  const sT4 = () => mk('sT4', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }, 4);

  it('T6.2: Speed-шлемы Caren — держатся лучший (T0) и лучший на T4, остальные «больше не нужна»', () => {
    const pool = [sT0(), sT4(), mk('sT4b', 'helmet', 'Speed', { 'DEF%': 2, CHC: 3, CHD: 1, SPD: 1 }, 4),
      mk('sT0b', 'helmet', 'Speed', { 'DEF%': 3, CHC: 3, CHD: 1, SPD: 1 }, 0), mk('dA', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 })];
    const P = prof('Caren');
    expect(pool.slice(0, 4).map((p) => +piecePoints(P, p).toFixed(2))).toEqual([9.5, 7.2, 5.55, 6.55]);
    const info = poolInfo(P, pool, new Set());
    expect(info.why.get('sT0')).toContain('menu-best');
    expect(info.why.get('sT4')).toEqual(['menu-t4']);
    expect(info.unneeded.map((p) => p.id).sort()).toEqual(['sT0b', 'sT4b']);
  });

  it('T6.3: смешанный пул — помечены вторая слабая впрок, слабая несобранного сета и чужой сет ниже планки', () => {
    const pool = [sT0(), sT4(), mk('dA', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 }),
      mk('dG', 'gloves', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 }),
      mk('wGl', 'gloves', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0), mk('wGl2', 'gloves', 'Speed', { SPD: 1, RES: 1, EFF: 1, HP: 1 }, 0),
      mk('wOff', 'shoes', 'Attack', { SPD: 1, RES: 1, EFF: 1, HP: 1 }), mk('gOff', 'shoes', 'Life', { 'DEF%': 2, CHC: 2, CHD: 2, SPD: 1 }),
      mk('dS', 'shoes', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 })];
    const info = poolInfo(prof('Caren'), pool, new Set(['dA']));
    expect(info.unneeded.map((p) => p.id).sort()).toEqual(['gOff', 'wGl2', 'wOff']);
    expect(info.why.get('wGl')).toEqual(['reserve']);
    expect([...info.reserve.values()]).toEqual(['wGl']);
  });

  it('T6.4: запись в пулах двух героев держится, если нужна хотя бы одному', () => {
    const boot = mk('dS', 'shoes', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });
    const shared = mk('shr', 'shoes', 'Speed', { 'ATK%': 4, CHC: 4, CHD: 2, SPD: 2 });
    const w = world(['Caren', 'Rin'], { Caren: [boot, shared], Rin: [shared] }, { Caren: [], Rin: [] });
    expect(w.view.hero(char('Rin').id)!.info.why.has('shr')).toBe(true);
  });

  it('T6.5 (A9, D3): вещь на +0,4 не «Надень» и не «Оставь»; добавленная всё же — в раскладке и держится; +1,0 — «Надень»', () => {
    const cH = mk('cH', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 2 });
    const cArm = mk('cArm', 'armor', 'Defense', { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 1 });
    const w = world(['Caren'], { Caren: [cH, cArm] });
    const P = prof('Caren');
    const up04 = mk('u04', 'helmet', 'Defense', { 'DEF%': 3, CHC: 3, SPD: 3, 'DMG UP%': 3 });
    const up10 = mk('u10', 'helmet', 'Defense', { 'DEF%': 4, CHC: 2, CHD: 4, SPD: 1 });
    expect(piecePoints(P, up04) - piecePoints(P, cH)).toBeCloseTo(0.4, 9);
    expect(piecePoints(P, up10) - piecePoints(P, cH)).toBeCloseTo(1, 9);
    const r04 = w.v(up04)!;
    expect(['wear', 'keep']).not.toContain(r04.kind);
    const info = poolInfo(P, [cH, cArm, up04], new Set(['cH', 'cArm']));
    expect(info.layout.helmet?.id).toBe('u04');
    expect(info.why.get('u04')).toContain('layout');
    expect(w.v(up10)!.kind).toBe('wear');
  });
});

// C1 (прототип, PROTO2): «Надень» / «Оставь» ⇒ пул держит вещь после неё; пул держит вещь не как запас, а вердикт не
// «Надень» / «Оставь» — только когда она в раскладке с приростом меньше 1 очка или лучшая по очкам своего сета или слота
const randWorn = (g: Gen, pool: readonly Piece[]): string[] =>
  [...new Set(pool.map((p) => p.slot))].flatMap((slot) => (g.rnd() < 0.7 ? [g.pick(pool.filter((p) => p.slot === slot)).id] : []));

describe('C1 вердикт ↔ пул', () => {
  it('C1: 20 героев × 60 случайных пулов и надетого, по новой вещи брони', () => {
    const g = gen(555);
    let wantKept = 0, held = 0;
    const bad: string[] = [];
    for (const c of twenty()) {
      const P = prof(c);
      for (let i = 0; i < 60; i++) {
        const pool = randPool(g, P, 3, false);
        const worn = randWorn(g, pool);
        const x = randArmor(g, P, g.pick(ARMOR));
        const w = world([c.name], { [c.name]: pool }, { [c.name]: worn });
        const r = w.v(x)!;
        const h = r.heroes[0];
        const x2 = { ...x, id: 'new' };
        const after = r.kind === 'wear' ? Object.values(r.named[0].layoutWith).map((p) => p.id) : worn;
        const info = poolInfo(P, [...pool, x2], new Set(after));
        const why = info.why.get('new') ?? [];
        if (r.kind === 'wear' || r.kind === 'keep') {
          wantKept++;
          if (!why.length) bad.push(`${c.name} #${i}: ${kindOf(r)}, а пул её не держит`);
        } else if (why.some((y) => y !== 'reserve')) {
          held++;
          const ok = why.includes('layout') ? h.dV < 1 && h.dV > -1e-9 : why.some((y) => y === 'menu-best' || y === 'menu-t4' || y === 'offmenu');
          if (!ok) bad.push(`${c.name} #${i}: ${kindOf(r)}, держится как ${why.join('+')}, ΔV ${h.dV.toFixed(3)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(wantKept).toBeGreaterThan(200);
    expect(held).toBeGreaterThan(0);
  });
});
