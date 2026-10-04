// Как найти вещь в игре (R9, .x/0040-trade/SPEC.md): ключ поиска в Change Gear получателя — данные, не подписи.
// Вещь: грейд; Set Effect — сет (броня); Primary — главный стат (оружие, аксессуар); Secondary — сабстат с наибольшим
// уровнем (при равенстве — выше в цепочке мерила получателя; нет сабстатов — строки нет), сортировка — по нему; T4 — BT.
// Дыра (R9.2): грейд 6★ (grade null), сет — только если дыра выключила значимый бонус, главный стат оружия и аксессуара —
// первого рекомендованного предмета по классу, Secondary — первый стат цепочки, который бывает сабстатом в этом слоте.
import type { Build, Char, GearKind, Grade, SlotId } from '../../data/types';
import { isArmor } from '../../data';
import type { Ctx } from '../context';
import { pieceInput, type Piece } from '../gear';
import { itemMains, subAllowed, subForms } from '../mains';
import { subWeights } from '../score';
import { gearList } from '../builds';
import { wearable } from '../vs';
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

// сабстат с наибольшим уровнем; при равенстве — выше в цепочке мерила, дальше по имени (всегда один и тот же выбор)
function topSub(ctx: Ctx, c: Char, b: Build, p: Piece): string | null {
  const W = subWeights(ctx, b, c, itemMains(ctx.idx, pieceInput(p)));
  const keys = Object.keys(p.lit).filter((k) => p.lit[k] > 0);
  keys.sort((a, z) => p.lit[z] - p.lit[a] || (W.get(z)?.w ?? -1) - (W.get(a)?.w ?? -1) || (a < z ? -1 : 1));
  return keys[0] ?? null;
}

export function keyOfItem(ctx: Ctx, c: Char, b: Build, p: Piece): SearchKey {
  const sub = topSub(ctx, c, b, p);
  return { grade: p.grade, set: isArmor(p.slot) ? p.setId : null, main: isArmor(p.slot) ? null : p.main, sub, sort: sub, t4: p.bt === 4 };
}

// breaksSet — сет, значимый бонус которого дыра выключила (иначе null)
export function keyOfHole(ctx: Ctx, c: Char, b: Build, slot: SlotId, breaksSet: string | null): SearchKey {
  let main: string | null = null, itemKey: string | null = null;
  if (!isArmor(slot)) {
    const kind = slot as GearKind;
    for (const g of gearList(b, kind)) {
      const m = g.mains[0] ?? null;
      if (wearable(ctx, c, { slot, itemKey: g.key })) { main = m; itemKey = g.key; break; }
    }
  }
  const as = { slot, grade: 'unique' as Grade, setId: isArmor(slot) ? breaksSet : null, itemKey, main };
  const chain = b.subs.flat().map((t) => t.trim()).filter(Boolean).flatMap((t) => subForms(t).reverse()); // у ATK/DEF/HP % не ниже flat
  const sub = chain.find((k) => subAllowed(ctx.idx, as, k)) ?? null;
  return { grade: null, set: isArmor(slot) ? breaksSet : null, main, sub, sort: sub, t4: false };
}
