// Вердикт «Временно» — главный тур его не объясняет: на примере вердикт «Оставить»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'temp', rev: 1, at: 'verdict', since: '2026-09-27', when: (c) => c.s.tab === 'eval' && c.verdict.v === 'temp' },
);
