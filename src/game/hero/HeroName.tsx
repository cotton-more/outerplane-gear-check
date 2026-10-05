// Имя героя (Р-2, решения владельца 2026-10-05): приставка (Core Fusion, Demiurge, Kitsune of Eternity…) приглушена.
// В строках — одной строкой, приставка при нехватке места режется первой, имя — последним, с «…»: «Kitsune of…
// Tamamo-no-Mae». stacked — плитка списка и шапка карточки: приставка мелкой строкой над именем, ничего не режется
// (.cp — размер по месту). Без приставки — просто имя.
import type { Index } from '@/game/data';
import type { Char } from '@/game/data/types';

// имя героя по id для фраз; незнакомый (ростер или вещи от других данных) — сам id
export const heroName = (idx: Index, id: string): string => idx.CHAR[id]?.name ?? id;

export function HeroName({ c, stacked }: { c: Pick<Char, 'name' | 'prefix' | 'base'>; stacked?: boolean }) {
  if (!c.prefix) return <>{c.name}</>;
  const base = c.base || c.name.slice(c.prefix.length + 1);
  // пробел — для диктора и копирования: строкой выше он не виден
  if (stacked) return <><span className="cp">{c.prefix}</span>{' '}{base}</>;
  return <span className="hname" title={c.name}><span className="hname-p">{c.prefix}</span>{' '}<span className="hname-b">{base}</span></span>;
}
