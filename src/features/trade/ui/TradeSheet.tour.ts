// «К обмену ▸» в карточке персонажа: шторка «Обмен вещами» — кто что наденет из всех вещей, заказ героя.
// rev 2 (stat-sets этап 5): булавки нет, есть заказ; в «Что нового» не идёт — новость одна, о новой оценке (владелец)
// rev 3 (0200 stage A): the gain by each hero, «Закончить», other heroes' spare is never taken; in «Что нового» (owner)
// rev 4 (0200 E2b): the plan is a walk with ticks, «Оставить как было», «Ввести», replacements and parking; in «Что нового» (owner 2026-10-13)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'trade', rev: 4, at: 'trade', news: true, when: (c) => c.s.tab === 'chars' },
);
