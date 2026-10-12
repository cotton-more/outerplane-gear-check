// «Найти вещь» (owner 2026-10-12, 0199): who has this piece — worn or set aside. The same piece as the verdict's look-alike
// check (samePiece): slot, grade, set or item, main and the substats at the same levels in the same order; Breakthrough
// is not compared (a chat code has none). Every pool is searched, so a record shared by two heroes names both
import type { ItemInput } from '@/game/item/item';
import type { GearStore } from './model/gear';
import { formPiece, samePiece } from './verdict';

export interface Holders { worn: string[]; stash: string[] }

export function holdersOf(st: GearStore, input: ItemInput): Holders {
  const x = formPiece(input);
  const out: Holders = { worn: [], stash: [] };
  for (const [hero, ids] of Object.entries(st.pools)) {
    const on = new Set(Object.values(st.worn?.[hero] ?? {}));
    for (const id of ids) {
      const p = st.pieces[id];
      if (!p || !samePiece(p, x)) continue;
      const list = on.has(id) ? out.worn : out.stash;
      if (!list.includes(hero)) list.push(hero);
    }
  }
  return out;
}
