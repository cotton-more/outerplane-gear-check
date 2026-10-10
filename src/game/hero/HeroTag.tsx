// A hero in a phrase that sends the player to find them in the game (batch plan and walk, owner 2026-10-08): the class
// icon in the element's colour (owner 2026-10-10: the name in plain colour — one cue is enough) — the game's roster
// filters by element and class, so these two narrow the search; no portrait (less on screen).
import type { ReactNode } from 'react';
import type { Char } from '@/game/data/types';
import { ClassIcon } from '@/game/icons/Img';

export function HeroTag({ c }: { c: Pick<Char, 'name' | 'element' | 'class'> }) {
  return <span className="htag"><ClassIcon cls={c.class} el={c.element} /><b>{c.name}</b></span>;
}

// «Надень на Rin — вместо шлема» with Rin as a tag: the first occurrence of the name as a whole word is replaced — not
// the «K» of «Cradle's Key» or the «Snow» of «Snow-white Embrace» (a letter or a hyphen next to it; «Rin's» is fine)
export function withHero(text: string, c: Pick<Char, 'name' | 'element' | 'class'> | null): ReactNode {
  const m = c && new RegExp(`(^|[^\\p{L}\\p{N}-])${c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}-])`, 'u').exec(text);
  if (!c || !m) return text;
  const i = m.index + m[1].length;
  // the tag and the characters stuck to it (no plain space between: «'s», «)», «-а») are one no-wrap unit, so «Kappa» is
  // never left alone on a line with «'s helmet» on the next; a no-break-spaced run («Caren · запас») goes with it
  // («'s» takes the next word along: «Core Fusion Eternal / 's armor», not «'s» alone on a line)
  const rest = text.slice(i + c.name.length);
  const before = /[^ ]*$/.exec(text.slice(0, i))![0], after = /^[^ ]*/.exec(rest)![0] + (/^['’]s(?= \S)/.test(rest) ? /^ [^ ]*/.exec(rest.slice(2))![0] : '');
  return <>{text.slice(0, i - before.length)}<span className="nw">{before}<HeroTag c={c} />{after && <span className="nwx">{after}</span>}</span>{text.slice(i + c.name.length + after.length)}</>;
}
