// «Сейчас на персонажах»: что значат ▲, ▼ и «сет 3 из 4» (rev 2, GEARPOOL) и кнопка «Надеть» / «Заменить»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'vs', rev: 2, at: 'vs', when: (c) => c.s.tab === 'eval' },
);
