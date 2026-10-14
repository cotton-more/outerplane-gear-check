// The boss's portrait (HISTORY.md 0206 Q1, owner 2026-10-14: portraits everywhere — the slot, the list, the card, the
// turn plan): outerpedia's boss art by Boss.icon (update.py; a hero-monster sub takes the hero's face). A snapshot without
// icons — the element icon in its place.
import type { Boss } from '@/game/data/types';
import { ElementIcon, Img } from '@/game/icons/Img';

export function BossFace({ b, className = 'boss-face' }: { b: Boss; className?: string }) {
  return b.icon ? <Img k={`boss:${b.icon}`} className={className} /> : <span className={`${className} noface`}><ElementIcon el={b.element} /></span>;
}
