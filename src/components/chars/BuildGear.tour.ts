// Экипировка в карточке персонажа: вещи у персонажа, билды собираются сами (rev 2, GEARPOOL; новость — «Показать»
// запускает тур «Экипировка»), «Собираю», «По статам», «Примерить» и карточка вещи — оранжевые сегменты и Breakthrough
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'gear', rev: 2, at: 'bgear', news: true, tour: 'gear', when: (c) => c.s.tab === 'chars' },
  { id: 'want', rev: 1, at: 'want', when: (c) => c.s.tab === 'chars' },
  { id: 'stats', rev: 1, at: 'stats', when: (c) => c.s.tab === 'chars' },
  { id: 'tryOn', rev: 1, at: 'gtry', when: (c) => c.s.tab === 'chars' },
  { id: 'piece', rev: 1, at: 'gpiece', when: (c) => c.pieceOpen },
);
