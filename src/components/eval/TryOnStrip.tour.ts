// Полоса режима «для героя» (прежде — примерки): для кого сравниваем, что «Надеть» и «Следующий» делают в нём, ✕.
// Текст и rev под режим героя — шаг 12 «Оценки — единственный ввод»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'tryStrip', rev: 1, at: 'tryon', when: (c) => c.s.tab === 'eval' && c.tryOn },
);
