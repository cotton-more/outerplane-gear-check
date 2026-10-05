// Фильтр и порядок списка персонажей; что выбрано в списке — действия, которые шлёт список (их выполняет app/appState).
import { SLOTS } from '@/game/data';
import type { Char } from '@/game/data/types';

export interface CharFilter {
  cq: string;      // поиск по имени
  cel: string;     // стихия
  ccl: string;     // класс
  cOwned: boolean; // только мои
  cAll: boolean;   // и без билдов
  cBare?: boolean; // не всё надето: меньше 6 из 6 (и меню ☰ «Не всё надето»); не сохраняется, как и поиск
}

// «не всё надето»: героя есть кому доодеть — у него есть билды, надето меньше 6 из 6 (geared — сколько отмечено надетым,
// нет записи — ничего), и его не заменил Core Fusion (off)
export function isBare(c: Char, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>): boolean {
  return c.builds.length > 0 && !off?.has(c.id) && (geared?.get(c.id) ?? 0) < SLOTS.length;
}

export function charMatches(
  c: Char, f: CharFilter, roster: ReadonlySet<string>, geared?: ReadonlyMap<string, number>, off?: Pick<ReadonlyMap<string, string>, 'has'>,
): boolean {
  const q = f.cq.trim().toLowerCase();
  if (q && !(c.name.toLowerCase().includes(q) || c.slug.includes(q) || (c.nick || '').toLowerCase().includes(q))) return false;
  if (f.cel && c.element !== f.cel) return false;
  if (f.ccl && c.class !== f.ccl) return false;
  if (f.cOwned && !roster.has(c.id)) return false;
  if (f.cBare && !isBare(c, geared, off)) return false;
  if (!f.cAll && !c.builds.length && !q) return false;
  return true;
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
