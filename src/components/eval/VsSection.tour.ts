// «Сейчас на персонажах»: что значат ▲ и ▼ и кнопка «Надеть» / «Заменить»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'vs', rev: 1, at: 'vs', when: (c) => c.s.tab === 'eval' },
);
