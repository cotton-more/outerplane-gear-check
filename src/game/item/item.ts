// Вещь, как её вбили на форме оценки: то, что вердикт, пул и код предмета читают о ней.
import { isArmor } from '@/game/data';
import type { Grade, SlotId } from '@/game/data/types';
import type { Subs } from './subs';

export interface ItemInput {
  slot: SlotId;
  grade: Grade;
  setId: string | null;
  itemKey: string | null;
  main: string | null;
  unlisted?: boolean; // Legendary оружие/аксессуар, которого нет в данных outerpedia
  subs: Subs;
  // Breakthrough с формы (у любой вещи): 4 — «T4», 0 — ниже T4 (T0–T3). Поля нет или null — не указан (старые входы,
  // эталон, Epic оружие и аксессуар до 0060), считается ниже T4. Вердикт evaluate его не читает — только пул
  // (сборка и исходы — у брони, материал — у всех)
  bt?: 0 | 4 | null;
}

export type Bt = 0 | 1 | 2 | 3 | 4;

// Breakthrough ведём у любой вещи («T4» на форме и в шторке, метка в строках): у брони — бонус сета и материал такой же
// вещи, у оружия и аксессуара — материал такого же предмета (вопрос 7 (б) ревью eval-only; у Epic — .x/0060 SPEC 4).
// Такая же вещь — ступень Breakthrough: броня — тот же слот, сет и грейд; Legendary оружие и аксессуар — тот же
// предмет; Epic — любая того же слота (в игре это всегда Steel Sword и Steel Necklace, материал — с любым main,
// проверено в игре)
type Same = { slot: SlotId; grade: Grade; setId: string | null; itemKey: string | null };
export const sameForBt = (a: Same, b: Same): boolean =>
  a.slot === b.slot && a.grade === b.grade
  && (isArmor(a.slot) ? !!a.setId && a.setId === b.setId : a.grade === 'rare' || (!!a.itemKey && a.itemKey === b.itemKey));
