// Кубик Reforge у свежей Epic — главный тур его не показывает: на примере вердикт «Оставить»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'dice', rev: 1, at: 'dice', news: true, when: (c) => c.s.tab === 'eval' && !!c.verdict.gamble },
);
