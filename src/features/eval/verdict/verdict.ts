// Результат оценки предмета — что показывает панель вердикта.
import type { Row } from '@/game/build/score';

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
  // «подходит ли» строка — от этого цвет оценки в списке; null — считать по CFG.keepCount
  qualifies?: ((m: Omit<Row, 'alt'>) => boolean) | null;
}

// лучший кандидат вердикта — первая строка первой открытой секции из ростера; у «Разобрать» кандидатов нет
export function bestRow(r: Verdict): { row: Row; n: number } | null {
  if (r.v === 'junk' || r.v === 'idle') return null;
  const sec = r.sections.find((x) => x.rows.length && !x.collapsed && !x.dim);
  return sec ? { row: sec.rows[0], n: sec.count ?? sec.rows.length } : null;
}

export const emptyVerdict = (): Verdict => ({ v: 'idle', title: '', lines: [], sections: [], foot: '', plan: [] });
