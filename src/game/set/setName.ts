// Название сета во фразах и строках — короткое (Speed, Penetration); незнакомый сет (от других данных) — сам id.
import type { Index } from '@/game/data';
import type { SetPiece } from '@/game/data/types';

export const setName = (idx: Index, id: string): string => idx.SET[id]?.short ?? id;
// часть связки: «Speed ×4»
export const partText = (idx: Index, p: Pick<SetPiece, 'set' | 'n'>): string => `${setName(idx, p.set)} ×${p.n}`;
