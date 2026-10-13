// «Подобрать вещи» on «Команда» (.x/0200-boss E2): the team trade for these heroes and the build under each spot. In «Что
// нового» (owner, 2026-10-13; text approved the same day).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamTrade', rev: 1, at: 'teamTrade', news: true, when: (c) => c.s.tab === 'team' },
);
