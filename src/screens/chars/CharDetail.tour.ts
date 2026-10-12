// Карточка героя: строка приоритета сабстатов (что значат › и =, серые) на вкладке «Билды»; вкладки «Надето · Пул ·
// Билды» (rev 6, stat-sets этап 6); «Переодеть» и оценка по вещам героя — статы и сеты вместе (gear rev 3)
// heroStars rev 2 — the star sheet holds the hero's level too (.x/0205; owner 2026-10-12: text OK, in «Что нового»)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'prio', rev: 1, at: 'prio', when: (c) => c.s.tab === 'chars' },
  { id: 'builds', rev: 6, at: 'btabs', when: (c) => c.s.tab === 'chars' },
  { id: 'gear', rev: 3, at: 'bgear', when: (c) => c.s.tab === 'chars' },
  // the stars under the name (PLAN 0190): crit from transcend stars counts; Team takes the stars from the card
  { id: 'heroStars', rev: 2, at: 'hstars', news: true, when: (c) => c.s.tab === 'chars' },
);
