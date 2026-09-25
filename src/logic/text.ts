// Мелкое форматирование для текстов вердикта и списков — без языка: сами фразы в src/i18n.
// Строки вердикта — обычный текст; **так** выделяется жирным (см. components/Rich.tsx).
import type { Char, GearSet, Item } from '../data/types';
import { uniqChars } from './builds';

export const fmtGood = (x: number) => (x % 1 ? `${Math.floor(x) || ''}½` : String(x));
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// «A, B, C и ещё 3» — хвост «и ещё N» даёт язык
export const namesLine = (list: { c: Char }[], more: (n: number) => string, max = 6): string => {
  const u = uniqChars(list).map((c) => c.name);
  return u.slice(0, max).join(', ') + (u.length > max ? more(u.length - max) : '');
};

// эффект сета на T4 (и на T0, если отличается) — для подсказки на кнопке
export function setTitle(set: GearSet): string {
  const t4 = [set.p2 && '2: ' + set.p2, set.p4 && '4: ' + set.p4].filter(Boolean).join(', ');
  const t0 = [set.p2base && '2: ' + set.p2base, set.p4base && '4: ' + set.p4base].filter(Boolean).join(', ');
  return t0 && t0 !== t4 ? `T0 — ${t0}\nT4 — ${t4}` : t4;
}

export const classText = (item: Item, classes: Record<string, string>, any: string): string =>
  (item.classLimits.length ? item.classLimits.map((c) => classes[c] || c).join(', ') : any);
