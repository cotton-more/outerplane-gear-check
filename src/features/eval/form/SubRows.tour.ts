// Строки сабстатов: замена по нажатию (ввод поверх прошлой вещи) и 4-й сабстат у Epic (от первого Reforge или с дропа)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'replace', rev: 1, at: 'rows', when: (c) => c.s.tab === 'eval' && c.nSubs >= 2 },
  { id: 'fourth', rev: 2, at: 'fourth', when: (c) => c.s.tab === 'eval' && c.s.grade === 'rare' && c.nSubs === 3 },
);
