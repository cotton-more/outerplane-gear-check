// Полоса режима «для героя»: для кого оценка, что в нём про героя (строка карточки, «Надеть»), а что общее (штамп), ✕.
// rev 2 — «Оценка — единственный ввод»: режим героя вместо примерки билда
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'tryStrip', rev: 2, at: 'tryon', when: (c) => c.s.tab === 'eval' && c.tryOn },
);
