// Полоса примерки: для кого сравниваем, что «Надеть» и «Следующий» делают в примерке, ✕
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'tryStrip', rev: 1, at: 'tryon', since: '2026-09-28', when: (c) => c.s.tab === 'eval' && c.tryOn },
);
