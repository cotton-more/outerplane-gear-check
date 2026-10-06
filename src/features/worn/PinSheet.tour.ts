// Закрепление набора (.x/0085 FORMULA §6): кнопка «Закрепить набор» в карточке героя. news — одна новость этапа
// «статы + сеты» (PLAN Д12): оценка считает статы и сеты вместе, билд выбирать не нужно
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'pin', rev: 1, at: 'pin', news: true, when: (c) => c.s.tab === 'chars' },
);
