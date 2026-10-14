// Вкладка «Пул»: вещи героя и зачем каждая; «больше не нужна» — разобрать в игре и убрать здесь. rev 3 — stat-sets
// этап 6: причины вместо билдов; rev 4 — без надетых (owner 2026-10-14)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'pool', rev: 4, at: 'pool', when: (c) => c.s.tab === 'chars' },
);
