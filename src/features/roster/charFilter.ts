// Фильтр и порядок списка персонажей; что выбрано в списке — действия, которые шлёт список (их выполняет app/appState).
import { SLOTS } from '@/game/data';
import type { Char } from '@/game/data/types';

// Кого показывать (DEVELOPMENT.md "features/roster"): «Мои» — все свои, с билдами и без; «Доодеть» — свои с билдами, у кого надето
// меньше 6 из 6; «Все» — с билдами, а героя без билдов находит только поиск
export type CharMode = 'mine' | 'todress' | 'all'; // 'all' — в переключателе ничего не нажато

export interface CharFilter {
  cq: string;      // поиск по имени
  cel: string;     // стихия
  ccl: string;     // класс
  cMode: CharMode; // «Мои» и «Все» сохраняются, «Доодеть» — нет (после перезапуска «Мои»), как и поиск
}

// Пока ростер пуст, режим «Все»: «Мои» и «Доодеть» показали бы пустоту (SPEC 6). Применяют те, кто знает ростер: список и
// «открыть героя»; сам отбор (charMatches) берёт режим как есть
export const effectiveMode = (mode: CharMode, rosterSize: number): CharMode => (rosterSize === 0 ? 'all' : mode);

// «Доодеть»: героя есть кому доодеть — у него есть билды, надето меньше 6 из 6 (geared — сколько отмечено надетым,
// нет записи — ничего), и его не заменил Core Fusion (off)
export function isBare(c: Char, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>): boolean {
  return c.builds.length > 0 && !off?.has(c.id) && (geared?.get(c.id) ?? 0) < SLOTS.length;
}

// сколько своих доодеть: число у «Доодеть» в списке и в «Ещё»
export function countToDress(
  chars: readonly Char[], roster: ReadonlySet<string>, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>,
): number {
  return chars.filter((c) => roster.has(c.id) && isBare(c, geared, off)).length;
}

export function charMatches(
  c: Char, f: CharFilter, roster: ReadonlySet<string>, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>,
): boolean {
  const q = f.cq.trim().toLowerCase();
  if (q && !(c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.nick || '').toLowerCase().includes(q))) return false;
  if (f.cel && c.element !== f.cel) return false;
  if (f.ccl && c.class !== f.ccl) return false;
  if (f.cMode === 'mine') return roster.has(c.id);
  if (f.cMode === 'todress') return roster.has(c.id) && isBare(c, geared, off);
  return c.builds.length > 0 || !!q; // «Все»: герой без билдов — только поиском
}

// Сортировка всегда по имени героя (c.base); префикс/вариант (Gnosis, Core Fusion, Demiurge и т. д.) — второй уровень сортировки
export function charSortName(c: Char): string {
  return c.base || c.name;
}

// Сортировка списка героев: сначала по базовому имени героя, затем по префиксу/варианту
export function compareChars(a: Char, b: Char): number {
  const an = charSortName(a);
  const bn = charSortName(b);
  const diff = an.localeCompare(bn, 'en', { sensitivity: 'base' });
  if (diff !== 0) return diff;
  const ap = a.prefix || '';
  const bp = b.prefix || '';
  const pDiff = ap.localeCompare(bp, 'en', { sensitivity: 'base' });
  if (pDiff !== 0) return pDiff;
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
}

// что список читает: фильтр и выбранный герой (его карточка)
export interface ListState extends CharFilter { charId: string | null }

// что шлёт список: выбрать героя (карточка) или поправить фильтр
export type ListAction =
  | { type: 'selectChar'; id: string | null }
  | { type: 'charFilter'; patch: Partial<CharFilter> };
