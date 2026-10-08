// Пул героя по «статам + сетам» (.x/0085 FORMULA §5): что держим и почему, что «больше не нужна». Порог «годная» вещи
// для героя (§4 «Порог») — здесь же: его читают пул, вердикт новой вещи и лучшая раскладка.
import { CFG } from '@/game/config';
import { isArmor } from '@/game/data';
import type { ArmorSlot } from '@/game/data/types';
import type { Profile } from '@/game/build/profile';
import { scoreBuild } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import { sameForBt } from '@/game/item/item';
import { armorBar } from '@/features/eval/verdict/bar';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { milli, THRESHOLD } from '@/features/gear/model/vs';
import { bestLayout, gearRank, piecePoints, type Layout, type LayoutValue } from '@/features/gear/layout';
import { numOf } from './base';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];

// a не меньше b + 1 очко (в тысячных, как better)
export const geq1 = (a: number, b: number): boolean => milli(a) - milli(b) >= THRESHOLD;

// Порог для героя: броня — прежние правила «Оставить / Временно» по его цепочке ИЛИ очки ≥ 6 (armorBar, этап 2);
// оружие и аксессуар — ранг по любому его билду: рекомендованная или временная с хорошими сабстатами (gearRank).
// keep — прошла как «Оставить», temp — только как временная (штамп «Временно», PLAN Д2). Закреплённому (§6) броня других
// сетов не годится; очки — по цепочке профиля (у закреплённого — его билда)
export interface Bar { pass: boolean; keep: boolean; temp: boolean }
const barMemo = new WeakMap<Profile, WeakMap<Piece, Bar>>();
export function pieceBar(P: Profile, p: Piece): Bar {
  let m = barMemo.get(P);
  if (!m) barMemo.set(P, (m = new WeakMap()));
  const hit = m.get(p);
  if (hit) return hit;
  let r: Bar;
  if (isArmor(p.slot) && P.pin && !(p.setId && P.menuSets.has(p.setId))) r = { pass: false, keep: false, temp: false };
  else if (isArmor(p.slot)) {
    const input = pieceInput(p);
    const sc = { ...scoreBuild(P.ctx, p.grade, P.c, P.chain, p.lit, itemMains(P.ctx.idx, input)), c: P.c, b: P.chain, i: 0 };
    const bar = armorBar(P.ctx, input);
    const keep = bar.passesOld(sc) || piecePoints(P, p) >= CFG.goodPoints, temp = !keep && bar.tempOk(sc);
    r = { pass: keep || temp, keep, temp };
  } else {
    const f = gearRank(P, p);
    r = { pass: f !== 'no', keep: f === 'rec', temp: f === 'stopgap' };
  }
  m.set(p, r);
  return r;
}

// кто может встать в раскладку (вопросы 10 и 11): надетое и прошедшее порог, в любом слоте
export const eligibleIn = (P: Profile, wornIds: ReadonlySet<string>) => (p: Piece): boolean => wornIds.has(p.id) || pieceBar(P, p).pass;

// части меню, которым нужен T4 (A11): Speed / Penetration / Bursting ×2 (строки 2P на T0–T3 нет), Immunity ×4
const needsT4Part = (short: string, n: number): boolean =>
  (n === 2 && (short === 'Speed' || short === 'Penetration' || short === 'Bursting')) || (n === 4 && short === 'Immunity');
// «сделай Breakthrough до T4» — только если T4 нужен ВСЕМ частям этого сета в меню героя (A11, D10)
export function needsT4(P: Profile, setId: string): boolean {
  const short = P.ctx.idx.SET[setId]?.short ?? '';
  const parts = [...P.parts].filter((k) => k.startsWith(setId + ':')).map((k) => Number(k.slice(setId.length + 1)));
  return parts.length > 0 && parts.every((n) => needsT4Part(short, n));
}

// Оружие или аксессуар впрок (§4 п. 3в, вопрос 14): Legendary-предмет, который билды героя рекомендуют, но эта копия
// не годная (main не тот), — держится одна копия, пока у героя нет годной этого предмета
export const listedFor = (P: Profile, p: Pick<Piece, 'slot' | 'grade' | 'itemKey'>): boolean =>
  !isArmor(p.slot) && p.grade === 'unique' && !!p.itemKey
  && P.c.builds.some((b) => (p.slot === 'weapon' ? b.weapons : b.amulets).some((g) => g.key === p.itemKey));

// почему пул держит вещь (§5): надета · в лучшей раскладке · лучшая своего сета в слоте · лучшая на T4 · сильная чужого
// сета · запас
export type Why = 'worn' | 'layout' | 'menu-best' | 'menu-t4' | 'offmenu' | 'reserve';
export interface PoolInfo {
  worn: Layout;                    // что надето
  layout: Layout;                  // нынешняя раскладка (D3): лучшая раскладка из надетого и годных, не хранится
  value: LayoutValue;
  why: Map<string, Why[]>;         // держится → почему
  reserve: Map<string, string[]>;  // reserveKey → ids of the reserves (up to CFG.reservePerHero), strongest first
  strong: Set<string>;             // держится не как запас
  unneeded: Piece[];               // §5 п. 6: «больше не нужна»
}

// Reserve key: armor — 'set:slot:grade' (Legendary armor takes only Legendary material, so each grade keeps its own
// reserve); weapon and accessory — 'item:key'
export const reserveKey = (p: Pick<Piece, 'slot' | 'setId' | 'itemKey' | 'grade'>): string =>
  (isArmor(p.slot) ? `${p.setId}:${p.slot}:${p.grade}` : `item:${p.itemKey}`);

// A held piece q of the same set and slot makes reserve p pointless. For an Epic reserve any piece does (an Epic won't
// replace a good Legendary); for a Legendary one only a Legendary: a good Epic is worn until a good Legendary drops,
// and that one will need Legendary material (owner, 2026-10-07: Rin's Epic helmet)
export const coversSlot = (q: Pick<Piece, 'slot' | 'setId' | 'grade'>, p: Pick<Piece, 'slot' | 'setId' | 'grade'>): boolean =>
  q.slot === p.slot && q.setId === p.setId && (p.grade !== 'unique' || q.grade === 'unique');

const byPoints = (P: Profile) => (a: Piece, z: Piece) => piecePoints(P, z) - piecePoints(P, a) || numOf(a.id) - numOf(z.id);

export function poolInfo(P: Profile, pool: readonly Piece[], wornIds: ReadonlySet<string>): PoolInfo {
  const why = new Map<string, Why[]>();
  const add = (p: Piece, w: Why) => { const l = why.get(p.id) ?? []; if (!l.includes(w)) l.push(w); why.set(p.id, l); };
  const pass = (p: Piece) => pieceBar(P, p).pass;
  const best = bestLayout(P, pool, { eligible: eligibleIn(P, wornIds) });
  const worn: Layout = {};
  for (const p of pool) if (wornIds.has(p.id)) { worn[p.slot] = p; add(p, 'worn'); }                     // 1
  for (const p of Object.values(best.layout)) add(p, 'layout');                                         // 2
  const sorted = [...pool].sort(byPoints(P));
  // 3: в слоте брони для каждого сета меню — лучшая годная и лучшая годная на T4, если лучшая не на T4
  for (const slot of ARMOR) {
    for (const s of P.menuSets) {
      const top = sorted.find((p) => p.slot === slot && p.setId === s && pass(p));
      if (!top) continue;
      add(top, 'menu-best');
      if (top.bt !== 4) { const t4 = sorted.find((p) => p.slot === slot && p.setId === s && p.bt === 4 && pass(p)); if (t4) add(t4, 'menu-t4'); }
    }
  }
  // 4 (A12): лучшая годная чужого сета — если хотя бы на 1 очко выше каждой держащейся вещи слота (вещам сетов меню +U/2)
  for (const slot of ARMOR) {
    const held = pool.filter((p) => p.slot === slot && why.has(p.id));
    const off = sorted.find((p) => p.slot === slot && !!p.setId && !P.menuSets.has(p.setId) && !why.has(p.id) && pass(p));
    if (off && (!held.length || geq1(piecePoints(P, off), offBar(P, held)))) add(off, 'offmenu');
  }
  const strong = new Set(why.keys());
  // 5: впрок — слабые на «сет + слот», когда сет начат держащейся вещью, а в этом слоте его держащейся нет; на T4
  // материалом не бывает (D6). Оружие и аксессуар (п. 3в) — копии рекомендованного предмета, пока годной нет.
  // Armor: reserves per grade; a held Epic doesn't cancel a Legendary reserve (coversSlot). Up to CFG.reservePerHero of
  // one kind (owner, 2026-10-08: a full T0 → T4); the ceiling over all heroes is the verdict's (verdictOf)
  const reserve = new Map<string, string[]>();
  for (const p of sorted) {
    if (strong.has(p.id) || p.bt === 4 || pass(p) || (reserve.get(reserveKey(p))?.length ?? 0) >= CFG.reservePerHero) continue;
    if (isArmor(p.slot)) {
      if (!p.setId || (P.pin && !P.menuSets.has(p.setId))) continue; // закреплённому — запас только сетов набора
      const started = pool.some((q) => q.setId === p.setId && strong.has(q.id));
      const slotHas = pool.some((q) => strong.has(q.id) && coversSlot(q, p));
      if (!started || slotHas) continue;
    } else if (!listedFor(P, p) || pool.some((q) => q !== p && strong.has(q.id) && sameForBt(q, p))) continue;
    reserve.set(reserveKey(p), [...(reserve.get(reserveKey(p)) ?? []), p.id]);
    add(p, 'reserve');
  }
  return { worn, layout: best.layout, value: best.value, why, reserve, strong, unneeded: pool.filter((p) => !why.has(p.id)) };
}

// планка для чужого сета (A12): очки лучшей держащейся вещи слота, вещам сетов меню — с надбавкой U/2
export const offBar = (P: Profile, held: readonly Piece[]): number =>
  Math.max(...held.map((q) => piecePoints(P, q) + (q.setId && P.menuSets.has(q.setId) ? P.U / 2 : 0)));

// причина в списке вещей (TEXTS 28): одна, по старшинству — надета › лучшая на T4 › лучшая своего сета › по статам ›
// в запасе; в раскладке, но ни то ни другое — «по статам». Не держится — null («больше не нужна»)
export type Reason = { kind: 'worn' | 'stats' | 'reserve' } | { kind: 'best' | 'bestT4'; set: string };
export function reasonOf(info: Pick<PoolInfo, 'why'>, p: Piece): Reason | null {
  const why: Why[] = info.why.get(p.id) ?? [];
  if (!why.length) return null;
  if (why.includes('worn')) return { kind: 'worn' };
  if (why.includes('menu-t4') && p.setId) return { kind: 'bestT4', set: p.setId };
  if (why.includes('menu-best') && p.setId) return { kind: 'best', set: p.setId };
  if (why.includes('offmenu') || why.includes('layout')) return { kind: 'stats' };
  return { kind: 'reserve' };
}
