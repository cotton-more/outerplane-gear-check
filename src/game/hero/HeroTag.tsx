// A hero in a phrase that sends the player to find them in the game (batch plan and walk, owner 2026-10-08): the class
// icon and the name in the element's colour — the game's roster filters by element and class, so these two narrow the
// search; no portrait (less on screen). The rest of the phrase stays plain text around it.
import type { ReactNode } from 'react';
import type { Char } from '@/game/data/types';
import { ClassIcon } from '@/game/icons/Img';

export function HeroTag({ c }: { c: Pick<Char, 'name' | 'element' | 'class'> }) {
  return <span className={`htag el-${c.element}`}><ClassIcon cls={c.class} /><b>{c.name}</b></span>;
}

// «Надень на Rin — вместо шлема» with Rin as a tag: the first occurrence of the name is replaced
export function withHero(text: string, c: Pick<Char, 'name' | 'element' | 'class'> | null): ReactNode {
  const i = c ? text.indexOf(c.name) : -1;
  if (!c || i < 0) return text;
  return <>{text.slice(0, i)}<HeroTag c={c} />{text.slice(i + c.name.length)}</>;
}
