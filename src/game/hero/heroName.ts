// Имя героя по id; незнакомый (ростер или вещи от других данных) — сам id.
import type { Index } from '@/game/data';

export const heroName = (idx: Index, id: string): string => idx.CHAR[id]?.name ?? id;
