// Кубик Reforge у свежей Epic — главный тур его не показывает: на примере вердикт «Оставить»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'dice', rev: 1, at: 'dice', since: '2026-09-28', news: true, when: (c) => c.s.tab === 'eval' && !!c.verdict.gamble },
);
