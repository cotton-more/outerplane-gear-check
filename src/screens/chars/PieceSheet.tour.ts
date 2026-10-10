// Шторка вещи в карточке героя: сделал в игре Reforge или Breakthrough — поправь сегменты и «T4», как на вещи в игре.
// rev 2 — «Оценка — единственный ввод»: правка вещи — уровень и «T4»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'piece', rev: 2, at: 'gpiece', when: (c) => c.pieceOpen },
);
