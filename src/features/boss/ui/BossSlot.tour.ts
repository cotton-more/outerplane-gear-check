// The boss slot on «Команда» (HISTORY.md 0200-boss stage C as the boss row; HISTORY.md 0206 — the fifth slot behind «VS», the
// sheet picks on «Выбрать», ✕ on the slot, one team for every boss — rev 2). In «Что нового» (owner, 2026-10-12; rev 2
// text and «Что нового» approved 2026-10-14).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamBoss', rev: 2, since: '2026-10-14', at: 'teamBoss', news: true, when: (c) => c.s.tab === 'team' },
);
