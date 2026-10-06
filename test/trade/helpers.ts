// Хелперы тестов «Обмен вещами» (.x/0040-trade/DESIGN.md): синтетика — модель прямо из чисел; реальные данные —
// фикстура, роли героев, фабрики вещей и хранилища; снимок вещей владельца (.x/00-equip.md).
import { existsSync, readFileSync } from 'node:fs';
import { createIndex } from '@/game/data';
import type { Dataset, Grade, SlotId } from '@/game/data/types';
import { makeCtx, type Ctx } from '@/game/context';
import { replacedX } from '@/features/gear/model/fusion';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { loadGear, readGearCode } from '@/features/gear/store/gearStore';
import type { Subs } from '@/game/item/subs';
import { cmpKit, SLOT_ORDER, type Cand, type Cands, type Fit, type Gauge, type Item, type Kit, type Part, type SetGain, type World } from '@/features/trade/model/model';
import { milli } from '@/features/gear/model/vs';
import { keyOf } from '@/features/trade/model/kit';
import { worldOf } from '@/features/trade/model/world';

// ----------------------------------------------------------------------------------------------- синтетика

// Мерило из чисел. bonus — ценность сета по числу вещей: { Speed: { 2: 3, 4: 8 } } — при 2–3 вещах 3 (одна половина),
// при 4 — 3 + 8 (две); effect — сеты-эффекты (их половины — eff). value — очки вещей (для кандидатов из мира; ok по
// умолчанию — годная); у кандидатов из cand() не нужен
export function synthGauge(o: {
  key?: string; parts?: Part[]; bonus?: Record<string, { 2?: number; 4?: number }>; effect?: readonly string[];
  value?: Record<string, number | { v: number; fit: Fit; ok?: boolean } | null>; bonusFn?: (set: string, n: number, n4: number) => SetGain;
} = {}): Gauge {
  return {
    key: o.key ?? 'synth',
    parts: o.parts ?? [],
    value(id) {
      const x = o.value?.[id];
      if (x === undefined || x === null) return null;
      return typeof x === 'number' ? { v: milli(x), fit: 'no', ok: true } : { v: milli(x.v), fit: x.fit, ok: x.ok ?? true };
    },
    bonus(set, n, n4) {
      if (o.bonusFn) return o.bonusFn(set, n, n4);
      const t = o.bonus?.[set];
      if (!t) return { v: 0, halves: 0, eff: 0 };
      let v = 0, halves = 0;
      if (n >= 2 && t[2] !== undefined) { v += t[2]; halves = 1; }
      if (n >= 4 && t[4] !== undefined) { v += t[4]; halves = 2; }
      return { v: milli(v), halves, eff: o.effect?.includes(set) ? halves : 0 };
    },
  };
}

// кандидат из чисел: v — очки (не тысячные); по умолчанию свой запас (cost 1) героя «R» с рангом 0
let ordSeq = 0;
export function cand(o: {
  id?: string; slot: SlotId; v: number; set?: string | null; t4?: boolean; fit?: Fit; cost?: 0 | 1 | 2 | 3;
  loss?: number; holder?: string | null; rank?: number; ord?: number; code?: string; bt?: number | null;
}): Cand {
  const ord = o.ord ?? ++ordSeq;
  const id = o.id ?? `s${ord}`;
  return {
    item: { id, slot: o.slot, code: o.code ?? id, bt: o.bt ?? (o.t4 ? 4 : 0), set: o.set ?? null, t4: !!o.t4, ord },
    v: milli(o.v), fit: o.fit ?? 'no', cost: o.cost ?? 1, loss: milli(o.loss ?? 0),
    holder: o.holder === undefined ? 'R' : o.holder, rank: o.rank ?? 0,
  };
}

export function candsOf(list: readonly Cand[]): Cands {
  const out: Partial<Record<SlotId, Cand[]>> = {};
  for (const c of list) (out[c.item.slot] ??= []).push(c);
  return out;
}

// полный перебор: каждый слот — любая вещь или пусто (без отсечения), лучший по cmpKit
export function bruteKit(g: Gauge, cands: Cands): Kit {
  let best: Kit | null = null;
  const cur: Partial<Record<SlotId, Cand>> = {};
  const walk = (i: number) => {
    if (i === SLOT_ORDER.length) {
      const k: Kit = { slots: { ...cur }, key: keyOf(g, cur) };
      if (!best || cmpKit(k.key, best.key) > 0) best = k;
      return;
    }
    const slot = SLOT_ORDER[i];
    delete cur[slot];
    walk(i + 1);
    for (const c of cands[slot] ?? []) { cur[slot] = c; walk(i + 1); delete cur[slot]; }
  };
  walk(0);
  return best!;
}

// псевдослучайные [0, 1) с сидом (mulberry32, как в test/gear/pool.test.ts)
export const lcg = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};

// ----------------------------------------------------------------------------------------------- реальные данные

export const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
export const idx = createIndex(D);
export const ctx: Ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());

// роли тестов (TESTS.md) → герои фикстуры. Рин, Карен, Ноа, Лея — striker; Дельта, Майя — ranger; NOBUILD — без билдов
export const HERO = {
  rin: '2000019', karen: '2000089', noa: '2000022', delta: '2000121', maya: '2000012', leah: '2000055', nobuild: '2000021',
} as const;
export const setId = (short: string): string => D.sets.find((s) => s.short === short)!.id;

let seq = 0;
export const GOOD: Subs = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };
// вещь: броня — сет по короткому имени; оружие/аксессуар — extra.itemKey, extra.main
export const piece = (slot: SlotId, short: string | null, lit: Subs = GOOD, extra: Partial<Piece> = {}): Piece =>
  ({ id: 'p' + ++seq, slot, grade: 'unique' as Grade, setId: short ? setId(short) : null, itemKey: null, main: null, yellow: lit, lit, bt: 0, at: '', ...extra });

// хранилище: герой → { pool, worn (вещи из pool, надетые) }
export function store(heroes: Record<string, { pool: Piece[]; worn?: Piece[] }>, extra: Partial<GearStore> = {}): GearStore {
  const pieces: Record<string, Piece> = {}, pools: Record<string, string[]> = {}, worn: Record<string, Partial<Record<SlotId, string>>> = {};
  for (const [id, h] of Object.entries(heroes)) {
    for (const p of h.pool) pieces[p.id] = p;
    pools[id] = h.pool.map((p) => p.id);
    if (h.worn?.length) worn[id] = Object.fromEntries(h.worn.map((p) => [p.slot, p.id]));
  }
  return { v: 3, seq: 999, pieces, pools, worn, ...extra };
}

// мир из хранилища: ростер — порядок героев в хранилище, если не задан; locked — переодетые в этом окне, orders — заказы
export const realWorld = (st: GearStore, roster: readonly string[] = Object.keys(st.pools), locked: readonly string[] = [], orders: Record<string, string> = {}): World =>
  worldOf(ctx, st, roster, { locked: new Set(locked), orders });

// ----------------------------------------------------------------------------------------------- снимок владельца

export interface Owner { st: GearStore; roster: string[]; ctx: Ctx }
export const OWNER_FILE = new URL('../../.x/00-equip.md', import.meta.url);
export const hasOwner = (): boolean => existsSync(OWNER_FILE);
// .x/00-equip.md → readGearCode → loadGear: то, что делает приложение при импорте кода (как .x/0020-custom-build/proto/lib.ts)
export function loadOwner(): Owner {
  const raw = readGearCode(readFileSync(OWNER_FILE, 'utf8').trim());
  if (raw === null || raw === 'newer') throw new Error('.x/00-equip.md: не код OGC-GEAR2');
  const { st, roster } = loadGear(raw, idx, []);
  const settings = { rosterOnly: true, stage: 'grow' as const, lv120: false, quirks: true };
  return { st, roster, ctx: makeCtx(idx, settings, new Set(roster), undefined, replacedX(idx, roster, st.pools)) };
}

// ----------------------------------------------------------------------------------------------- синтетический мир

// Мир из чисел: героям — вещи (слот, код, сет), надетое, запас и очки каждой вещи по его мерилу (null/нет — не носит).
// Порядок героев = ростер. Ключ вещи в value — id; значение — очки или { v, fit }
export interface SynthHero {
  worn?: Partial<Record<SlotId, string>>; pool?: string[]; locked?: boolean;
  value?: Record<string, number | { v: number; fit: Fit; ok?: boolean } | null>; parts?: Part[]; bonus?: Record<string, { 2?: number; 4?: number }>;
  effect?: string[];
}
export function synthWorld(o: { items: Record<string, { slot: SlotId; set?: string; code?: string; bt?: number; t4?: boolean }>; heroes: Record<string, SynthHero> }): World {
  const items: Record<string, Item> = {};
  Object.entries(o.items).forEach(([id, it], i) => {
    items[id] = { id, slot: it.slot, code: it.code ?? id, bt: it.bt ?? (it.t4 ? 4 : 0), set: it.set ?? null, t4: !!it.t4, ord: i + 1 };
  });
  const ids = Object.keys(o.heroes);
  const heroes = ids.map((id, rank) => {
    const h = o.heroes[id];
    const worn = h.worn ?? {};
    return { id, rank, locked: !!h.locked, worn, pool: [...new Set([...(h.pool ?? []), ...Object.values(worn)])] };
  });
  const gauges = new Map(ids.map((id) => [id, synthGauge({ parts: o.heroes[id].parts, bonus: o.heroes[id].bonus, effect: o.heroes[id].effect, value: o.heroes[id].value ?? {} })]));
  return { heroes, items, gauge: (id) => gauges.get(id) ?? null };
}
