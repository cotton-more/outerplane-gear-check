// Код ростера для переноса между браузерами: slug персонажей через запятую.
import type { Index } from '../data';

export const encodeRoster = (idx: Index, roster: Iterable<string>): string =>
  [...roster].filter((id) => idx.CHAR[id]).map((id) => idx.CHAR[id].slug).join(', ');

// принимает slug или id, разделители — пробел, запятая, точка с запятой
export function parseRoster(idx: Index, text: string): { found: string[]; missed: string[] } {
  const found: string[] = [], missed: string[] = [];
  for (const x of text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)) {
    const id = idx.CHAR_BY_SLUG[x]?.id || (idx.CHAR[x] ? x : null);
    if (id) found.push(id); else missed.push(x);
  }
  return { found, missed };
}
