// A hero in a phrase that sends the player to find them in the game (batch plan and walk, owner 2026-10-08): the class
// icon and the name in the element's colour — the game's roster filters by element and class, so these two narrow the
// search; no portrait (less on screen). The rest of the phrase stays plain text around it.
import type { ReactNode } from 'react';
import type { Char } from '@/game/data/types';
import { ClassIcon } from '@/game/icons/Img';

export function HeroTag({ c }: { c: Pick<Char, 'name' | 'element' | 'class'> }) {
  return <span className={`htag el-${c.element}`}><ClassIcon cls={c.class} /><b>{c.name}</b></span>;
}

// «Надень на Rin — вместо шлема» with Rin as a tag: the first occurrence of the name as a whole word is replaced — not
// the «K» of «Cradle's Key» or the «Snow» of «Snow-white Embrace» (a letter or a hyphen next to it; «Rin's» is fine)
export function withHero(text: string, c: Pick<Char, 'name' | 'element' | 'class'> | null): ReactNode {
  const m = c && new RegExp(`(^|[^\\p{L}\\p{N}-])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}-])`, 'u').exec(text);
  if (!c || !m) return text;
  const i = m.index + m[1].length;
  // the tag and the characters stuck to it (no plain space between: «'s», «)», «-а») are one no-wrap unit, so «Kappa» is
  // never left alone on a line with «'s helmet» on the next; a no-break-spaced run («Caren · запас») goes with it
  const before = /[^ ]*$/.exec(text.slice(0, i))![0], after = /^[^ ]*/.exec(text.slice(i + c.name.length))![0];
  return <>{text.slice(0, i - before.length)}<span className="nw">{before}<HeroTag c={c} />{after}</span>{text.slice(i + c.name.length + after.length)}</>;
}
