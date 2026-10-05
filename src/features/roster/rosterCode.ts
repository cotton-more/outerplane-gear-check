// Старый код ростера (до резервной копии одним кодом, features/roster/backup): slug персонажей через запятую. Его
// по-прежнему понимает «Заменить» в поле копии.
import type { Index } from '@/game/data';

// принимает slug или id, разделители — пробел, запятая, точка с запятой
export function parseRoster(idx: Index, text: string): { found: string[]; missed: string[] } {
  const found: string[] = [], missed: string[] = [];
  for (const x of text.split(/[\s,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)) {
    const id = idx.CHAR_BY_SLUG[x]?.id || (idx.CHAR[x] ? x : null);
    if (id) found.push(id); else missed.push(x);
  }
  return { found, missed };
}
