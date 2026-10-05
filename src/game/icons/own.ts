// Свои значки вместо картинок из игры: какой контур Tabler (src/game/icons/tabler.ts) у стата, слота, сета, стихии, класса.
// Портреты персонажей пока из игры. Переключатель «Иконки: свои · из игры» в подвале — на время сравнения.
import { subLabel } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import type { IconName } from './tabler';

// Статы. Flat и % одного параметра — один контур, а у %-версии в углу «%»: DEF — щит, DEF% — щит с %.
// Так же EFF и RES: сабстатом бывают только EFF% и RES%, flat EFF и flat RES — только main.
const STAT: Record<string, IconName> = {
  ATK: 'sword', DEF: 'shield', HP: 'heart', EFF: 'eye', RES: 'umbrella', SPD: 'bolt', CHC: 'target', CHD: 'sparkles',
  'DMG UP%': 'trending-up', 'DMG RED%': 'trending-down', 'PEN%': 'arrow-bar-to-right', 'CDMG RED%': 'sparkles',
};
const TWINS = new Set(['ATK', 'DEF', 'HP', 'EFF', 'RES']); // параметры, у которых есть и flat, и %

export interface OwnIcon { name: IconName; badge?: string }

// main — стат как строка main: там EFF и RES — flat. Сабстат с ключом EFF — это EFF% (subLabel).
export function statIcon(stat: string, main = false): OwnIcon | null {
  if (stat === 'CDMG RED%') return { name: 'sparkles', badge: '↓' }; // CHD, только наоборот: крит-урон по тебе меньше
  const label = main ? stat : subLabel(stat);
  const base = label.replace(/%$/, '');
  if (TWINS.has(base)) return { name: STAT[base], badge: label.endsWith('%') ? '%' : undefined };
  const name = STAT[label];
  return name ? { name } : null;
}

export const SLOT_ICON: Record<SlotId, IconName> = {
  weapon: 'swords', accessory: 'diamond', helmet: 'helmet', armor: 'shirt', gloves: 'hand-stop', shoes: 'shoe',
};

// Сеты — по названию (set.short). Сет со статом в имени — значок этого стата; нового сета здесь нет — шестиугольник,
// а отчёт обновления данных напомнит его добавить (scripts/check-data.mjs)
export const SET_ICON: Record<string, IconName> = {
  Attack: 'sword', Defense: 'shield', Life: 'heart', 'Critical Hit': 'target', Effectiveness: 'eye', Resilience: 'umbrella',
  Counterattack: 'arrow-back-up', Fortification: 'wall', Mitigation: 'trending-down', Lifesteal: 'heart-plus',
  Penetration: 'arrow-bar-to-right', 'Critical Strike': 'sparkles', Speed: 'bolt', Bursting: 'bomb', Revenge: 'skull',
  Patience: 'hourglass', Pulverization: 'hammer', Immunity: 'shield-check', Swiftness: 'wind', Weakness: 'heart-broken',
  Augmentation: 'trending-up',
};
export const setIcon = (short: string): IconName => SET_ICON[short] ?? 'hexagon';

export const ELEMENT_ICON: Record<string, IconName> = { fire: 'flame', water: 'droplet', earth: 'leaf', light: 'sun', dark: 'moon' };
export const CLASS_ICON: Record<string, IconName> = {
  striker: 'axe', defender: 'building-castle', ranger: 'target-arrow', healer: 'first-aid-kit', mage: 'wand',
};
export const TALISMAN_ICON: IconName = 'star';
