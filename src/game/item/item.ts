// Вещь, как её вбили на форме оценки: то, что вердикт, пул и код предмета читают о ней.
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
