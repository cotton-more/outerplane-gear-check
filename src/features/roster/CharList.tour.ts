// Звёздочка — в ростер: самое важное на вкладке, от ростера зависят все вердикты
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'star', rev: 1, at: 'star', when: (c) => c.s.tab === 'chars' && c.roster === 0 },
);
