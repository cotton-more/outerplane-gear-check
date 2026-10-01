// Карточка персонажа: строка приоритета сабстатов (что значат › и =, серые) и вкладки нескольких билдов
// (rev 4, GEARPOOL: билды собираются из вещей персонажа сами; начатые — Р14, Р18)
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'prio', rev: 1, at: 'prio', when: (c) => c.s.tab === 'chars' },
  { id: 'builds', rev: 5, at: 'btabs', when: (c) => c.s.tab === 'chars' },
);
