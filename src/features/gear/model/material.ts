// Что стало со снятой вещью после «Надеть» / «Заменить» (сообщение под тостом). Материал новой вещи по «статам + сетам» —
// features/gear/verdict (FORMULA §4 п. 3).
import type { Piece } from './gear';
import { sameForBt } from '@/game/item/item';

// Что сказать о снятой с формы вещи того же слота (сообщение после «Надеть» / «Заменить»): такая же Epic — материал
// новой, и с T4 (Epic не жалко); новая на T4 — материал ей не нужен. Такая же Legendary — «сначала оцени»: может
// подойти другому герою (SPEC 4.5). Другая вещь — ничего
export function oldFate(old: Piece, put: Pick<Piece, 'slot' | 'grade' | 'setId' | 'itemKey' | 'bt'>): 'material' | 'evaluate' | null {
  if (!sameForBt(put, old)) return null;
  if (old.grade === 'unique') return 'evaluate';
  return put.bt === 4 ? null : 'material';
}
