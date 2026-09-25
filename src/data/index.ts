// Индексы и справочники поверх датасета: строятся один раз при загрузке страницы.
import type { ArmorSlot, Dataset, Grade, SlotId } from './types';

export interface SlotInfo {
  id: SlotId;
  name: string;
  game?: string;   // броня — как слот называется в игре
}

export const SLOTS: SlotInfo[] = [
  { id: 'weapon', name: 'Weapon' },
  { id: 'accessory', name: 'Accessory' },
  { id: 'helmet', name: 'Helmet', game: 'Helmet' },
  { id: 'armor', name: 'Armor', game: 'Chest Armor' },
  { id: 'gloves', name: 'Gloves', game: 'Gloves' },
  { id: 'shoes', name: 'Shoes', game: 'Boots' },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, SlotInfo>;
const ARMOR: readonly string[] = ['helmet', 'armor', 'gloves', 'shoes'];
export const isArmor = (slot: SlotId): slot is ArmorSlot => ARMOR.includes(slot);

export const GRADES: Grade[] = ['unique', 'rare'];
export const GRADE_NAME: Record<Grade, string> = { unique: 'Legendary', rare: 'Epic' };
export const GRADE_PREFIX: Record<Grade, string> = { unique: 'Etheric', rare: 'Steel' };

export const STAT_ICON: Record<string, string> = {
  'ATK': 'CM_Stat_Icon_ATK', 'ATK%': 'CM_Stat_Icon_ATK', 'DEF': 'CM_Stat_Icon_DEF', 'DEF%': 'CM_Stat_Icon_DEF',
  'HP': 'CM_Stat_Icon_HP', 'HP%': 'CM_Stat_Icon_HP', 'SPD': 'CM_Stat_Icon_SPEED', 'CHC': 'CM_Stat_Icon_CRITICAL',
  'CHD': 'CM_Stat_Icon_CRITICAL_DMG', 'EFF': 'CM_Stat_Icon_CHANCE', 'RES': 'CM_Stat_Icon_RESIST', 'PEN%': 'CM_Stat_Icon_PIERCE_POWER',
  'DMG UP%': 'CM_Stat_Icon_DMG_INCREASE', 'DMG RED%': 'CM_Stat_Icon_ENEMY_DMG_REDUCE', 'CDMG RED%': 'CM_Stat_Icon_ENEMY_CRITICAL_DMG_REDUCE',
};
const SUB_ORDER = ['SPD', 'ATK%', 'CHC', 'CHD', 'DMG UP%', 'HP%', 'DEF%', 'DMG RED%', 'EFF', 'RES', 'ATK', 'HP', 'DEF'];
export const FLAT = new Set(['ATK', 'DEF', 'HP']);

export function createIndex(D: Dataset) {
  const SUB = Object.fromEntries(D.substats.map((s) => [s.key, s]));
  // цена сегмента flat и %-версии: [flat, %]
  const TICK: Record<string, [number, number]> = {};
  for (const ax of FLAT) if (SUB[ax] && SUB[ax + '%']) TICK[ax] = [SUB[ax].step, SUB[ax + '%'].step];
  return {
    D,
    SET: Object.fromEntries(D.sets.map((s) => [s.id, s])),
    ITEMS: { weapon: D.weapons, accessory: D.amulets },
    ITEM: {
      weapon: Object.fromEntries(D.weapons.map((i) => [i.key, i])),
      accessory: Object.fromEntries(D.amulets.map((i) => [i.key, i])),
    },
    CHAR: Object.fromEntries(D.chars.map((c) => [c.id, c])),
    CHAR_BY_SLUG: Object.fromEntries(D.chars.map((c) => [c.slug, c])),
    SUB,
    SUB_LIST: SUB_ORDER.filter((k) => SUB[k]).concat(D.substats.map((s) => s.key).filter((k) => !SUB_ORDER.includes(k))),
    TICK,
    NEW: new Set(D.meta.newIds || []),
    LOW_STAR_USED: [...D.weapons, ...D.amulets].filter((i) => i.star < 6 && i.users > 0),
  };
}

export type Index = ReturnType<typeof createIndex>;
