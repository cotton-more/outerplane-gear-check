// Строки main предмета и сабстаты, которых из-за них не бывает.
// Игра не даёт сабстату повторить строку main, но сравнивает стат вместе с видом: flat EFF в main и EFF%
// сабстатом — разные статы, на одной вещи бывают оба (проверено в игре), как flat DEF и DEF%. Какая строка
// какой сабстат запрещает, решает update.py по таблицам outerpedia (D.mainBlocks).
// Строки бывают выбранные (main оружия и аксессуара) и фиксированные: у брони main не выбирают — шлем HP%,
// броня DEF, перчатки EFF + DEF, ботинки RES + HP% (берём по сету и грейду из данных), у оружия всегда есть flat ATK.
import { FLAT, isArmor, type Index } from '../data';
import type { GearKind } from '../data/types';
import type { ItemInput } from './verdict';

export interface ItemMains {
  lines: string[];              // все строки main на предмете: фиксированные и выбранная
  blocked: Set<string>;         // сабстаты, которых из-за них не бывает
  subKeys: ReadonlySet<string>; // какие статы вообще бывают сабстатом (PEN% и CDMG RED% — только main)
}

export const NO_MAINS: ItemMains = { lines: [], blocked: new Set(), subKeys: new Set() };

// какой сабстат запрещает строка main. В данных до mainBlocks — сабстат с той же меткой и того же вида: метка main
// без % — flat, а сабстаты EFF и RES — rate (EFF%, RES%), и flat EFF в main их не запрещает
export function blocksOf(idx: Index, line: string): string | null {
  const table = idx.D.mainBlocks;
  if (table) return table[line] ?? null;
  const sub = idx.SUB[line];
  return sub && (line.endsWith('%') || sub.mode !== 'rate') ? line : null;
}

// фиксированные строки main: у брони — по сету (или обычные для слота, пока сет не выбран), у оружия — базовый flat ATK
export function fixedLines(idx: Index, s: Pick<ItemInput, 'slot' | 'grade' | 'setId' | 'itemKey'>): string[] {
  const { D } = idx;
  if (isArmor(s.slot)) {
    const set = s.setId ? idx.SET[s.setId] : undefined;
    return set?.fixed?.[s.slot]?.[s.grade] ?? D.fixedMains?.[s.slot]?.[s.grade] ?? [];
  }
  const item = s.itemKey ? idx.ITEM[s.slot as GearKind][s.itemKey] : undefined;
  return item?.fixed ?? D.fixedMains?.[s.slot]?.[s.grade] ?? [];
}

export function itemMains(idx: Index, s: Pick<ItemInput, 'slot' | 'grade' | 'setId' | 'itemKey' | 'main'>): ItemMains {
  const fixed = fixedLines(idx, s);
  const lines = s.main ? [s.main, ...fixed.filter((l) => l !== s.main)] : [...fixed]; // выбранный — первым: «main ATK%/ATK»
  const blocked = new Set<string>();
  for (const l of lines) { const b = blocksOf(idx, l); if (b) blocked.add(b); }
  return { lines, blocked, subKeys: new Set(Object.keys(idx.SUB)) };
}

// стат может быть сабстатом этого предмета (те же правила, что у формы, appState restoreItem и сетка): есть среди
// сабстатов данных (PEN%, CDMG RED%, flat EFF и RES — нет) и не запрещён строкой main
export const subAllowed = (idx: Index, s: Pick<ItemInput, 'slot' | 'grade' | 'setId' | 'itemKey' | 'main'>, k: string): boolean =>
  !!idx.SUB[k] && !itemMains(idx, s).blocked.has(k);

const axisOf = (k: string) => k.trim().replace(/%$/, '');

// сабстаты, которыми закрывается токен цепочки: у ATK/DEF/HP — и flat, и %, у остальных — сам стат
export const subForms = (tok: string): string[] => {
  const axis = axisOf(tok);
  return FLAT.has(axis) ? [axis, axis + '%'] : [tok.trim()];
};

// строки main на оси токена — для пометки «main» в цепочке
export const mainsOnAxis = (tok: string, im: ItemMains): string[] => im.lines.filter((l) => axisOf(l) === axisOf(tok));

// токен цепочки занят main: стат есть в main, а сабстатом на этом предмете ему выпасть уже нечем.
// Main SPD у аксессуара занимает SPD; у оружия с main ATK% ось ATK занята целиком (ATK% — main, flat ATK —
// базовая строка), а с main DEF% — нет: ATK% сабстатом ещё бывает. Flat EFF в main перчаток EFF не занимает —
// EFF% сабстатом бывает. PEN% сабстатом не бывает вовсе: main PEN% его занимает.
// useless — сабстаты, которые этому персонажу ничего не дают (score.uselessFor): у шлема с main HP% сабстатом
// остаётся только flat HP, а он почти никому не засчитывается — тогда место HP тоже занято main
export const takenByMain = (tok: string, im: ItemMains, useless: (k: string) => boolean = () => false): boolean =>
  mainsOnAxis(tok, im).length > 0 && subForms(tok).every((k) => im.blocked.has(k) || !im.subKeys.has(k) || useless(k));
