// Русские числительные и мелкое форматирование для текстов вердикта и списков.
// Строки вердикта — обычный текст; **так** выделяется жирным (см. components/Rich.tsx).
import type { Char, GearSet, Item } from '../data/types';
import { uniqChars } from './builds';

export const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const persons = (n: number) => `${n} ${plural(n, 'персонаж', 'персонажа', 'персонажей')}`;
export const personsGen = (n: number) => `${n} ${plural(n, 'персонажа', 'персонажей', 'персонажей')}`;
export const personsDat = (n: number) => `${n} ${plural(n, 'персонажу', 'персонажам', 'персонажам')}`;
export const fmtGood = (x: number) => (x % 1 ? `${Math.floor(x) || ''}½` : String(x));
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export const namesLine = (list: { c: Char }[], max = 6): string => {
  const u = uniqChars(list).map((c) => c.name);
  return u.slice(0, max).join(', ') + (u.length > max ? ` и ещё ${u.length - max}` : '');
};

// эффект сета на T4 (и на T0, если отличается) — для подсказки на кнопке
export function setTitle(set: GearSet): string {
  const t4 = [set.p2 && '2: ' + set.p2, set.p4 && '4: ' + set.p4].filter(Boolean).join(', ');
  const t0 = [set.p2base && '2: ' + set.p2base, set.p4base && '4: ' + set.p4base].filter(Boolean).join(', ');
  return t0 && t0 !== t4 ? `T0 — ${t0}\nT4 — ${t4}` : t4;
}

export const classText = (item: Item, classes: Record<string, string>): string =>
  (item.classLimits.length ? item.classLimits.map((c) => classes[c] || c).join(', ') : 'любой класс');
