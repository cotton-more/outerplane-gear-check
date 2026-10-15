// «Надеть в игре» (0230 T2): the promises of «Надеть». In «Что нового» (owner 2026-10-15). The tip comes only when the list
// is on screen: its anchor exists only with lines (IngameList draws nothing at 0). On a phone the anchor is the ☰ badge
// (VBar `.vb-ig`), not the «Ещё» row
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'ingame', rev: 1, at: 'ingame', news: true, when: (c) => c.s.tab === 'eval' },
);
