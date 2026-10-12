// «Команда»: four heroes and their ★ → skills that miss a status from the team, who in the roster would give it.
// In «Что нового» (owner, 2026-10-11; text approved the same day).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'team', rev: 1, at: 'team', news: true, when: (c) => c.s.tab === 'team' },
  // the hero window suggests whom to add (.x/0171-team-suggest), in «Что нового» (owner, 2026-10-11); rev 2 — with a boss
  // the guide's heroes for the spot come first (.x/0200-boss stage C, owner 2026-10-12)
  { id: 'teamPick', rev: 2, at: 'team', news: true, when: (c) => c.s.tab === 'team' },
);
