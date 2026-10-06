// Карточка героя: строка приоритета сабстатов (что значат › и =, серые) на вкладке «Билды»; вкладки «Надето · Пул ·
// Билды» (rev 6, .x/0085 этап 6); «Переодеть» и оценка по вещам героя — статы и сеты вместе (gear rev 3)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'prio', rev: 1, at: 'prio', when: (c) => c.s.tab === 'chars' },
  { id: 'builds', rev: 6, at: 'btabs', when: (c) => c.s.tab === 'chars' },
  { id: 'gear', rev: 3, at: 'bgear', when: (c) => c.s.tab === 'chars' },
);
