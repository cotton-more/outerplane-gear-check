// Как найти вещь в игре (R9 — MODEL.md §10): ключ поиска в Change Gear получателя — данные, не подписи.
// Вещь: грейд; Set Effect — сет (броня); Primary — главный стат (оружие, аксессуар); Secondary — сабстат с наибольшим
// уровнем (при равенстве — выше в цепочке получателя; нет сабстатов — строки нет), сортировка — по нему; T4 — BT.
// Дыра (R9.2): грейд 6★ (grade null), сет — только если дыра выключила половину сета, главный стат оружия и аксессуара —
// первого рекомендованного предмета по классу из билдов героя по порядку, Secondary — первый стат цепочки, который
// бывает сабстатом в этом слоте. Цепочка — «По статам» (MODEL.md §0): заказ её не меняет.
import type { GearKind, Grade, SlotId } from '@/game/data/types';
import { isArmor } from '@/game/data';
import type { Profile } from '@/game/build/profile';
import { pieceInput, type Piece } from '@/features/gear/model/gear';
import { itemMains, subAllowed, subForms } from '@/game/item/mains';
import { subWeights } from '@/game/build/score';
import { gearList, slotMains } from '@/game/build/builds';
import { piecePoints } from '@/features/gear/layout';
import { wearable } from '@/features/gear/model/vs';
import type { Cand } from './model';

export interface SearchKey {
  grade: Grade | null;      // null — 6★ любого грейда (подсказка дыры)
  set: string | null;       // Set Effect
  main: string | null;      // Primary Stat
  sub: string | null;       // Secondary Stat; null — строки нет
  sort: string | null;      // сортировка — по Secondary
  t4: boolean;              // BT 4
}

export type Source =
  | { kind: 'worn'; holder: string }      // «у Карен»
  | { kind: 'stock'; holder: string }     // «в инвентаре · запас Ноа»
  | { kind: 'inventory' };                // «в инвентаре»

export const sourceOf = (c: Pick<Cand, 'cost' | 'holder'>): Source =>
  c.cost === 3 && c.holder ? { kind: 'worn', holder: c.holder }
    : c.cost === 2 && c.holder ? { kind: 'stock', holder: c.holder } : { kind: 'inventory' };

// сабстат с наибольшим уровнем; при равенстве — выше в цепочке, дальше по имени (всегда один и тот же выбор)
function topSub(P: Profile, p: Piece): string | null {
  const W = subWeights(P.ctx, P.chain, P.c, itemMains(P.ctx.idx, pieceInput(p)));
  const keys = Object.keys(p.lit).filter((k) => p.lit[k] > 0);
  keys.sort((a, z) => p.lit[z] - p.lit[a] || (W.get(z)?.w ?? -1) - (W.get(a)?.w ?? -1) || (a < z ? -1 : 1));
  return keys[0] ?? null;
}

export function keyOfItem(P: Profile, p: Piece): SearchKey {
  const sub = topSub(P, p);
  return { grade: p.grade, set: isArmor(p.slot) ? p.setId : null, main: isArmor(p.slot) ? null : p.main, sub, sort: sub, t4: p.bt === 4 };
}

// breaksSet — сет, значимый бонус которого дыра выключила (иначе null)
export function keyOfHole(P: Profile, slot: SlotId, breaksSet: string | null): SearchKey {
  const { ctx, c } = P;
  let main: string | null = null, itemKey: string | null = null;
  if (!isArmor(slot)) {
    const kind = slot as GearKind;
    const g = c.builds.flatMap((b) => gearList(b, kind)).find((x) => wearable(ctx, c, { slot, itemKey: x.key }));
    if (g) { main = g.mains[0] ?? null; itemKey = g.key; }
  }
  const as = { slot, grade: 'unique' as Grade, setId: isArmor(slot) ? breaksSet : null, itemKey, main };
  const chain = P.chain.subs.flat().map((t) => t.trim()).filter(Boolean).flatMap((t) => subForms(t).reverse()); // у ATK/DEF/HP % не ниже flat
  const sub = chain.find((k) => subAllowed(ctx.idx, as, k)) ?? null;
  return { grade: null, set: isArmor(slot) ? breaksSet : null, main, sub, sort: sub, t4: false };
}

// A piece entered for an empty slot in the walk (HISTORY.md 0200-boss E2b Q4): its points for the hero (MODEL.md §1) and what is
// off — the main is none of the mains the hero's builds recommend for this slot (a weapon or accessory), or none of its
// substats counts for the hero (look — the first chain stats a substat of this slot can be)
export interface Advice { pts: number; main: string[] | null; look: string[] | null }
export function adviceOf(P: Profile, p: Piece): Advice {
  const { ctx, c } = P;
  let main: string[] | null = null;
  if (!isArmor(p.slot)) {
    const mains = [...new Set(c.builds.flatMap((b) => [...slotMains(b, p.slot as GearKind)]))];
    if (mains.length && (!p.main || !mains.includes(p.main))) main = mains;
  }
  const W = subWeights(ctx, P.chain, c, itemMains(ctx.idx, pieceInput(p)));
  const counts = Object.keys(p.lit).some((k) => (W.get(k)?.credit ?? 0) > 0);
  const as = { slot: p.slot, grade: p.grade, setId: p.setId, itemKey: p.itemKey, main: p.main };
  const chain = [...new Set(P.chain.subs.flat().map((t) => t.trim()).filter(Boolean).flatMap((t) => subForms(t).reverse()))];
  const look = counts ? null : chain.filter((k) => subAllowed(ctx.idx, as, k)).slice(0, 3);
  return { pts: piecePoints(P, p), main, look: look?.length ? look : null };
}
