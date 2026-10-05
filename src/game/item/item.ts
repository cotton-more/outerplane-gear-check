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
  // Breakthrough с формы (броня, Legendary оружие и аксессуар — gear hasBt): 4 — «T4», 0 — ниже T4 (T0–T3). Поля нет или
  // null — не указан (старые входы, эталон, Epic оружие и аксессуар). Вердикт evaluate его не читает — только пул
  // (сборка и исходы — у брони, материал — у всех)
  bt?: 0 | 4 | null;
}

export type Bt = 0 | 1 | 2 | 3 | 4;

// Breakthrough вещи ведём («T4» на форме и в шторке, метка в пуле и в слоте): у брони — бонус сета и материал такой же
// вещи, у Legendary оружия и аксессуара — материал такого же предмета (вопрос 7 (б) ревью eval-only, отменяет В4
// «только у брони»). У Epic оружия и аксессуара предмета на форме нет — такую же вещь не найти (features/gear/model/material), и
// Breakthrough ни на что не влияет: кнопки нет, Breakthrough не указан, как раньше
export const hasBt = (slot: SlotId, grade: Grade): boolean => isArmor(slot) || grade === 'unique';
