// Core Fusion X в ростере — X неактивен и стоит за ним (пометка на плитке): что будет от звезды на Core Fusion и как
// вернуться к X. Текст с примером Eternal: подсказки без подстановок, как у соседних (Caren, Rin, Speed-шлем)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'fusion', rev: 1, at: 'fusion', when: (c) => c.s.tab === 'chars' },
);
