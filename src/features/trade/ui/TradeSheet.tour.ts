// «К обмену ▸» в карточке персонажа: шторка «Обмен вещами» — кто что наденет из всех вещей, заказ героя.
// rev 2 (stat-sets этап 5): булавки нет, есть заказ; в «Что нового» не идёт — новость одна, о новой оценке (владелец)
// rev 3 (0200 stage A): the gain by each hero, «Закончить», other heroes' spare is never taken; in «Что нового» (owner)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'trade', rev: 3, at: 'trade', news: true, when: (c) => c.s.tab === 'chars' },
);
