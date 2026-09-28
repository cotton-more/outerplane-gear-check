// «Сейчас на персонажах»: что значат ▲ и ▼ и кнопка «Надеть» / «Заменить»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'vs', rev: 1, at: 'vs', since: '2026-09-28', when: (c) => c.s.tab === 'eval' },
);
