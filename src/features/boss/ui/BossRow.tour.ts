// The boss row on «Команда» (.x/0200-boss stage C): a fight and its stage → RES and immunities, «Собрать из гайда»,
// a team per boss. In «Что нового» (owner, 2026-10-12; text approved the same day).
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'teamBoss', rev: 1, at: 'teamBoss', news: true, when: (c) => c.s.tab === 'team' },
);
