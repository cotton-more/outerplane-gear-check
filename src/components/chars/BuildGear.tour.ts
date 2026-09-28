// Экипировка в карточке персонажа: у билда свои 6 слотов (новость — «Показать» запускает тур «Экипировка»),
// «Примерить» / «Собрать билд» и карточка вещи — оранжевые сегменты и Breakthrough
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'gear', rev: 1, at: 'bgear', news: true, tour: 'gear', when: (c) => c.s.tab === 'chars' },
  { id: 'tryOn', rev: 1, at: 'gtry', when: (c) => c.s.tab === 'chars' },
  { id: 'piece', rev: 1, at: 'gpiece', when: (c) => c.pieceOpen },
);
