// The hero list under the stamp (0230 T1, rev 4 — it was «Сейчас на персонажах», tip `vs`): who the piece helps, in groups
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'vs', rev: 4, at: 'vs', when: (c) => c.s.tab === 'eval' },
);
