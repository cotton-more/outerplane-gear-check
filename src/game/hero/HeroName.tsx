// Имя героя одной строкой (Р-2, решение владельца 2026-10-05): приставка (Core Fusion, Demiurge, Kitsune of Eternity…)
// приглушена и при нехватке места режется первой — само имя видно всегда: «Kitsune of… Tamamo-no-Mae». Без приставки —
// просто имя. Плитка списка пишет приставку строкой над именем (CharTile), заголовок карточки — имя целиком.
import type { Index } from '@/game/data';
import type { Char } from '@/game/data/types';

// имя героя по id для фраз; незнакомый (ростер или вещи от других данных) — сам id
export const heroName = (idx: Index, id: string): string => idx.CHAR[id]?.name ?? id;

export function HeroName({ c }: { c: Pick<Char, 'name' | 'prefix' | 'base'> }) {
  if (!c.prefix) return <>{c.name}</>;
  const base = c.base || c.name.slice(c.prefix.length + 1);
  return <span className="hname" title={c.name}><span className="hname-p">{c.prefix}</span>{' '}<span className="hname-b">{base}</span></span>;
}
