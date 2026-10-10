// «К обмену ▸» в карточке персонажа: шторка «Обмен вещами» — кто что наденет из всех вещей, заказ героя.
// rev 2 (stat-sets этап 5): булавки нет, есть заказ; в «Что нового» не идёт — новость одна, о новой оценке (владелец)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'trade', rev: 2, at: 'trade', when: (c) => c.s.tab === 'chars' },
);
