// Что стало со снятой вещью после «Надеть» / «Заменить» (сообщение под тостом). Материал новой вещи по «статам + сетам» —
// features/gear/verdict (FORMULA §4 п. 3).
import type { Piece } from './gear';
import { sameForBt } from '@/game/item/item';
import { isArmor } from '@/game/data';

// Что сказать о снятой с формы вещи того же слота (сообщение после «Надеть» / «Заменить»): такая же Epic — материал
// новой, и с T4 (Epic не жалко); новая на T4 — материал ей не нужен. Такая же Legendary — «сначала оцени»: может
// fit another hero (SPEC 4.5). Another piece, or an Epic weapon / accessory (a stopgap, not fed) — nothing
export function oldFate(old: Piece, put: Pick<Piece, 'slot' | 'grade' | 'setId' | 'itemKey' | 'bt'>): 'material' | 'evaluate' | null {
  if (!sameForBt(put, old)) return null;
  if (!isArmor(put.slot) && put.grade === 'rare') return null; // an Epic weapon or accessory isn't fed (owner 2026-10-09)
  if (old.grade === 'unique') return 'evaluate';
  return put.bt === 4 ? null : 'material';
}
