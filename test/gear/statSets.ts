// Общее для тестов «статов + сетов» (.x/0085, TESTS T4–T6): данные, герои, вещи, которые игра может выдать, и случайные
// пулы с фиксированным сидом.
import { readFileSync } from 'node:fs';
import { createIndex } from '@/game/data';
import type { ArmorSlot, Char, Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { subAllowed } from '@/game/item/mains';
import { levelCap, MAX_SUBS, type Subs } from '@/game/item/subs';
import { profileOf, type Profile } from '@/game/build/profile';

export const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
export const idx = createIndex(D);
export const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
export const EPS = 1e-9;
export const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
export const GEAR: SlotId[] = ['weapon', 'accessory'];

export const char = (name: string): Char => {
  const c = D.chars.find((x) => x.name === name);
  if (!c) throw new Error('нет героя ' + name);
  return c;
};
export const setId = (short: string): string => {
  const s = D.sets.find((x) => x.short === short);
  if (!s) throw new Error('нет сета ' + short);
  return s.id;
};
export const heroes = D.chars.filter((c) => c.builds.length);
export const prof = (c: Char | string): Profile => profileOf(ctx, typeof c === 'string' ? char(c) : c)!;

// mulberry32, как в test/gear/pool.test.ts
export const lcg = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
};
export interface Gen { rnd: () => number; pick: <T>(xs: readonly T[]) => T; int: (n: number) => number }
export const gen = (seed: number): Gen => {
  const rnd = lcg(seed);
  return { rnd, pick: (xs) => xs[Math.floor(rnd() * xs.length)], int: (n) => Math.floor(rnd() * n) };
};

// вещь, которую игра может выдать: ≤ 4 сабстата, уровни 1…6, сумма в пределах, сабстат не запрещён main
export function legal(p: Piece): void {
  const keys = Object.keys(p.lit);
  const sum = Object.values(p.lit).reduce((a, b) => a + b, 0);
  const bad = keys.filter((k) => !idx.SUB[k] || !subAllowed(idx, pieceInput(p), k) || !(p.lit[k] >= 1 && p.lit[k] <= 6));
  if (keys.length > MAX_SUBS || sum > levelCap(p.grade) || bad.length) throw new Error(`нелегальная вещь ${p.id}: ${JSON.stringify(p.lit)} (bad ${bad}, sum ${sum})`);
}
export function mk(id: string, slot: SlotId, set: string | null, lit: Subs, bt: 0 | 4 | null = 4, extra: Partial<Piece> = {}): Piece {
  const p: Piece = { id, slot, grade: 'unique', setId: set ? setId(set) : null, itemKey: null, main: null, yellow: lit, lit, bt, at: '', ...extra };
  legal(p);
  return p;
}

// --- случайные легальные вещи и пулы (сид фиксирован) ---
let counter = 0;
export function randSubs(g: Gen, P: Profile, probe: Piece, n: number): Subs {
  const chain = new Set<string>();
  for (const tier of P.chain.subs) for (const t of tier) { const k = t.trim(); chain.add(k); if (/^(ATK|DEF|HP)$/.test(k)) { chain.add(k + '%'); chain.add(k); } }
  const all = Object.keys(idx.SUB).filter((k) => subAllowed(idx, pieceInput(probe), k));
  const chainOk = all.filter((k) => chain.has(k));
  const cap = levelCap(probe.grade);
  for (;;) {
    const keys: string[] = [];
    while (keys.length < n) {
      const k = g.rnd() < 0.6 && chainOk.length ? g.pick(chainOk) : g.pick(all);
      if (!keys.includes(k)) keys.push(k);
    }
    const lit: Subs = {};
    let sum = 0;
    for (const k of keys) { lit[k] = 1 + g.int(6); sum += lit[k]; }
    if (sum <= cap) return lit;
  }
}
export function randArmor(g: Gen, P: Profile, slot: SlotId, twin?: Piece): Piece {
  const menu = [...P.menuSets];
  const grade = twin ? twin.grade : g.rnd() < 0.8 ? 'unique' : 'rare';
  const set = twin ? twin.setId : g.rnd() < 0.55 && menu.length ? g.pick(menu) : g.pick(D.sets).id;
  const bt = g.pick([null, 0, 0, 4, 4, 4] as const) as 0 | 4 | null;
  const probe: Piece = { id: 'probe', slot, grade, setId: set, itemKey: null, main: null, yellow: {}, lit: {}, bt, at: '' };
  const lit = twin && twin.slot === slot ? { ...twin.lit } : randSubs(g, P, probe, grade === 'unique' ? 4 : 3);
  const p: Piece = { ...probe, id: 'r' + ++counter, yellow: lit, lit };
  legal(p);
  return p;
}
export function randGear(g: Gen, P: Profile, slot: 'weapon' | 'accessory'): Piece {
  const items = slot === 'weapon' ? D.weapons : D.amulets;
  const listed = slot === 'weapon' ? P.chain.weapons : P.chain.amulets;
  const ref = listed.length && g.rnd() < 0.5 ? g.pick(listed) : null;
  const item = ref ? items.find((i) => i.key === ref.key) ?? g.pick(items) : g.pick(items);
  const mains = ref?.mains.length ? ref.mains : item.mains.length ? item.mains : ['ATK%'];
  const main = g.pick(mains);
  const grade = item.grade === 'unique' ? 'unique' : 'rare';
  const probe: Piece = { id: 'probe', slot, grade, setId: null, itemKey: item.key, main, yellow: {}, lit: {}, bt: g.pick([null, 0, 4] as const) as 0 | 4 | null, at: '' };
  const lit = randSubs(g, P, probe, grade === 'unique' ? 4 : 3);
  const p: Piece = { ...probe, id: 'r' + ++counter, yellow: lit, lit };
  legal(p);
  return p;
}
// пул: до maxPerSlot вещей брони на слот (30% близнецы = равные роллы, ничьи), 0…2 оружия и аксессуара
export function randPool(g: Gen, P: Profile, maxPerSlot = 3, withGear = true): Piece[] {
  const out: Piece[] = [];
  for (const slot of ARMOR) {
    const k = g.int(maxPerSlot + 1);
    for (let i = 0; i < k; i++) {
      const twin = out.length && g.rnd() < 0.3 ? g.pick(out.filter((p) => p.slot === slot)) : undefined;
      out.push(randArmor(g, P, slot, twin));
    }
  }
  if (withGear) for (const slot of GEAR) for (let i = g.int(3); i > 0; i--) out.push(randGear(g, P, slot as 'weapon' | 'accessory'));
  return out;
}

// 20 героев: пять из историй и пятнадцать по сиду
export function twenty(): Char[] {
  const fixed = ['Caren', 'Anarky', 'Heatwave Cop Delta', 'Core Fusion Epsilon', 'Valentine'].map(char);
  const g = gen(20261006);
  const rest = heroes.filter((c) => !fixed.includes(c));
  const picked: Char[] = [];
  while (picked.length < 15) { const c = g.pick(rest); if (!picked.includes(c)) picked.push(c); }
  return [...fixed, ...picked];
}

