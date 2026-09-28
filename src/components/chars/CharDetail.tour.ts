// Карточка персонажа: строка приоритета сабстатов (что значат › и =, серые) и вкладки нескольких билдов
// (rev 2: у каждого билда теперь свои 6 слотов экипировки)
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'prio', rev: 1, at: 'prio', since: '2026-09-27', when: (c) => c.s.tab === 'chars' },
  { id: 'builds', rev: 2, at: 'btabs', since: '2026-09-27', when: (c) => c.s.tab === 'chars' },
);
