// Карточка персонажа: строка приоритета сабстатов (что значат › и =, серые) и вкладки нескольких билдов
// (rev 3, GEARPOOL: билды собираются из вещей персонажа сами)
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'prio', rev: 1, at: 'prio', when: (c) => c.s.tab === 'chars' },
  { id: 'builds', rev: 3, at: 'btabs', when: (c) => c.s.tab === 'chars' },
);
