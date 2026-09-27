// Строки сабстатов: замена по нажатию (ввод поверх прошлой вещи) и 4-й сабстат у Epic после Reforge
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'replace', rev: 1, at: 'rows', since: '2026-09-27', when: (c) => c.s.tab === 'eval' && c.nSubs >= 2 },
  { id: 'fourth', rev: 1, at: 'fourth', since: '2026-09-26', when: (c) => c.s.tab === 'eval' && c.s.grade === 'rare' && c.nSubs === 3 },
);
