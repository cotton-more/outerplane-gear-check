// The boss slot on «Команда» (.x/0200-boss stage C as the boss row; .x/0206-boss-sheet — the fifth slot behind «VS», the
// sheet picks on «Выбрать», ✕ on the slot, one team for every boss — rev 2). In «Что нового» (owner, 2026-10-12; rev 2
// text and «Что нового» approved 2026-10-14).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamBoss', rev: 2, at: 'teamBoss', news: true, when: (c) => c.s.tab === 'team' },
);
