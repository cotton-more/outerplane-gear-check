// Результат оценки предмета — что показывает панель вердикта.
import type { Grade, SlotId } from '@/game/data/types';
import type { Row } from '@/game/build/score';
import type { Subs } from '@/game/item/subs';

export type VerdictKind = 'idle' | 'keep' | 'temp' | 'maybe' | 'fodder' | 'junk';

export interface Section {
  title: string;
  rows: Row[];
  limit?: number;          // сколько строк видно до «показать всех»
  count?: number;          // число в заголовке, если не rows.length
  collapsed?: boolean;     // свёрнута, пока не нажмёшь
  dim?: boolean;           // «не из ростера»
  mainNote?: string | null; // main stat для строк без собственного (временная замена)
}

export interface Verdict {
  v: VerdictKind;
  title: string;
  lines: string[];         // текст; **так** — жирным
  sections: Section[];
  foot: string;
  plan: string[];          // «Прокачка»: Enhance, Breakthrough, Transistone — что вкладывать в эту вещь
  // штамп поменяли записи экипировки (features/gear/model/stamp): lower — все, кому подходит, уже носят не хуже; home — вещь уже в билде
  worn?: 'lower';
  wornBy?: string[];       // lower: билды («персонаж/билд»), где уже надето не хуже, — их персонажей называет заголовок
  // не из ростера: кому броня — «Оставить», кто берёт предмет с этим main. У понижённой — строкой: разбор не молча
  othersKeep?: Row[];
  // «подходит ли» строка — от этого цвет оценки в списке; null — считать по CFG.keepCount
  qualifies?: ((m: Omit<Row, 'alt'>) => boolean) | null;
}

// Что вбито на панели ввода.
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

// лучший кандидат вердикта — первая строка первой открытой секции из ростера; у «Разобрать» кандидатов нет
export function bestRow(r: Verdict): { row: Row; n: number } | null {
  if (r.v === 'junk' || r.v === 'idle') return null;
  const sec = r.sections.find((x) => x.rows.length && !x.collapsed && !x.dim);
  return sec ? { row: sec.rows[0], n: sec.count ?? sec.rows.length } : null;
}

export const emptyVerdict = (): Verdict => ({ v: 'idle', title: '', lines: [], sections: [], foot: '', plan: [] });
