// Шторка вещи в карточке героя: сделал в игре Reforge или Breakthrough — поправь сегменты и T, как на вещи в игре.
// rev 2 — «Оценка — единственный ввод»: правка вещи — уровень и T; rev 3 (0270) — точный T0–T4
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'piece', rev: 3, since: '2026-11-05', at: 'gpiece', when: (c) => c.pieceOpen },
);
