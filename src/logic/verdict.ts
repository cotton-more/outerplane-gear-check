// Результат оценки предмета — что показывает панель вердикта.
import type { Grade, SlotId } from '../data/types';
import type { Gamble } from './gamble';
import type { RollLevel, Row } from './score';
import type { Subs } from './subs';

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
  badge: string;
  foot: string;
  roll?: RollLevel;        // ролл лучшего кандидата, если вердикт «Оставить» или «Временно»
  plan: string[];          // «Прокачка»: Enhance, Reforge, Breakthrough, Transistone — что вкладывать в эту вещь
  gamble?: Gamble | null;  // кубик: какой 4-й сабстат от первого Reforge вытянет свежую Epic (logic/gamble)
  // штамп поменяли записи экипировки (logic/worn): lower — все, кому подходит, уже носят не хуже; home — вещь уже в билде
  worn?: 'lower' | 'home';
  wornBy?: string[];       // lower: билды («персонаж/билд»), где уже надето не хуже, — их персонажей называет заголовок
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
}

// лучший кандидат вердикта — первая строка первой открытой секции из ростера; у «Разобрать» кандидатов нет
export function bestRow(r: Verdict): { row: Row; n: number } | null {
  if (r.v === 'junk' || r.v === 'idle') return null;
  const sec = r.sections.find((x) => x.rows.length && !x.collapsed && !x.dim);
  return sec ? { row: sec.rows[0], n: sec.count ?? sec.rows.length } : null;
}

export const emptyVerdict = (): Verdict => ({ v: 'idle', title: '', lines: [], sections: [], badge: '', foot: '', plan: [] });
