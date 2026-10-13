// «Подобрать вещи» on «Команда» (.x/0200-boss E2): the team trade for these heroes and the build under each spot. In «Что
// нового» (owner, 2026-10-13; text approved the same day). rev 2 (E2b): the plan is a walk, replacements at the end; in «Что
// нового» (owner 2026-10-13). rev 3 (E3): with a boss the trade raises debuffers' EFF to RES + 1; in «Что нового» (owner
// 2026-10-13, text approved). rev 4 (E4): and SPD for those who should move before the boss; in «Что нового» (owner 2026-10-13,
// text approved).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamTrade', rev: 4, at: 'teamTrade', news: true, when: (c) => c.s.tab === 'team' },
);
