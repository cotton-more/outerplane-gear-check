// «Вещи Caren · N» (GEARPOOL): что это за вещи и что убирать разобранное. rev 2 — «Оценка — единственный ввод»: пул по
// слотам, «Убрать» — в шторке вещи
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'pool', rev: 2, at: 'pool', when: (c) => c.s.tab === 'chars' },
);
