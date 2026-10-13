// «Ход против босса» under the team (.x/0200-boss E1): the turn timeline — who moves first, the luck chance, the debuff
// chance, a row expands. In «Что нового» (owner, 2026-10-13; text approved the same day).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamTurn', rev: 1, at: 'teamTurn', news: true, when: (c) => c.s.tab === 'team' },
);
