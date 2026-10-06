// Вкладка «Пул»: все вещи героя и зачем каждая; «больше не нужна» — разобрать в игре и убрать здесь. rev 3 — .x/0085
// этап 6: причины вместо билдов
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'pool', rev: 3, at: 'pool', when: (c) => c.s.tab === 'chars' },
);
