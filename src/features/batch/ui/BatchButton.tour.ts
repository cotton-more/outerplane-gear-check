// «Партия»: a whole filter of pieces in a row, one plan (.x/0110-batch). In «Что нового» (owner, 2026-10-07).
// rev 2 — the step-by-step walk (.x/0140-batch-walk, text approved 2026-10-08, «Что нового» again)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'batch', rev: 2, at: 'batch', news: true, when: (c) => c.s.tab === 'eval' },
);
