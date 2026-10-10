// «Сейчас на персонажах»: очки героя, «включится / выключится» и кнопка «Надеть» / «Заменить» (rev 3 — stat-sets этап 9: очки вместо ▲ ▼)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'vs', rev: 3, at: 'vs', when: (c) => c.s.tab === 'eval' },
);
