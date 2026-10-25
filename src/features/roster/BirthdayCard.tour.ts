// «Что нового» for long-time players: birthdays and the gold ★ gone from roster tiles (owner Q6, HISTORY.md 0240). The card
// itself shows a few times a year, so the tip sits on the grey ☆ of the hero list
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'bday', rev: 1, since: '2026-10-20', at: 'star', news: true, when: (c) => c.s.tab === 'chars' && c.roster > 0 },
);
