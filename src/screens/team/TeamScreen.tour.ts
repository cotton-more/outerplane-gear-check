// «Команда»: four heroes and their ★ → skills that miss a status from the team, who in the roster would give it.
// In «Что нового» (owner, 2026-10-11; text approved the same day).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'team', rev: 1, at: 'team', news: true, when: (c) => c.s.tab === 'team' },
);
