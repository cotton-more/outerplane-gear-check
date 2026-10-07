// «Партия»: a whole filter of pieces in a row, one plan (.x/0110-batch). In «Что нового» (owner, 2026-10-07)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'batch', rev: 1, at: 'batch', news: true, when: (c) => c.s.tab === 'eval' },
);
