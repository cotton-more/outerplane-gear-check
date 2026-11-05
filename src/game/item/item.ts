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
  // Breakthrough с формы (у любой вещи): T0–T4 exactly (HISTORY.md 0270; before it 0 meant «below T4»). Поля нет или
  // null — не указан (старые входы, эталон, Epic оружие и аксессуар до 0060), считается ниже T4. Вердикт evaluate его не читает — только пул
  // (сборка и исходы — у брони, материал — у всех)
  bt?: Bt | null;
}

export type Bt = 0 | 1 | 2 | 3 | 4;
// one piece — one Breakthrough step, T0 → T4
export const FEEDS = 4;
// how many feeds a piece still takes to T4: 4 − T (exact T0–T4, HISTORY.md 0270); «T?» (null) counts from T0 — four
export const feedsLeft = (x: { bt?: Bt | null }): number => Math.max(0, FEEDS - (x.bt ?? 0));
export const isBt = (v: unknown): v is Bt => v === 0 || v === 1 || v === 2 || v === 3 || v === 4;
// A stored bt → Bt | null (HISTORY.md 0270). exact — the record was written with a «bt is exact» marker: a valid 0–4 is kept,
// anything else is unknown (null). Not exact — written by the «T4» toggle era: 4 stays T4, 1–3 stay (old edits wrote them),
// 0 meant «below T4» and anything else is unknown: null
export const legacyBt = (raw: unknown, exact: boolean): Bt | null =>
  exact ? (isBt(raw) ? raw : null) : raw === 4 || raw === 1 || raw === 2 || raw === 3 ? raw : null;

// Breakthrough ведём у любой вещи («T4» на форме и в шторке, метка в строках): у брони — бонус сета и материал такой же
// вещи, у оружия и аксессуара — материал такого же предмета (MODEL.md §4; у Epic — там же).
// Такая же вещь — ступень Breakthrough: броня — тот же слот, сет и грейд; Legendary оружие и аксессуар — тот же
// предмет; Epic — любая того же слота (в игре это всегда Steel Sword и Steel Necklace, материал — с любым main,
// проверено в игре)
type Same = { slot: SlotId; grade: Grade; setId: string | null; itemKey: string | null };
export const sameForBt = (a: Same, b: Same): boolean =>
  a.slot === b.slot && a.grade === b.grade
  && (isArmor(a.slot) ? !!a.setId && a.setId === b.setId : a.grade === 'rare' || (!!a.itemKey && a.itemKey === b.itemKey));
