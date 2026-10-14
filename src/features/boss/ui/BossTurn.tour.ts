// The turn plan under the team (HISTORY.md 0200-boss E1): who moves first, the luck chance, the debuff chance, a row expands;
// HISTORY.md 0206 — shown without a boss too («Порядок хода»), rev 2. In «Что нового» (owner, 2026-10-13; rev 2 text and
// «Что нового» approved 2026-10-14).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamTurn', rev: 2, at: 'teamTurn', news: true, when: (c) => c.s.tab === 'team' },
);
