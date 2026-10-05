// Варианты связок сетов (GEARPOOL): показан самый собранный, другие — в чипах и «ещё N»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'variants', rev: 1, at: 'variants', when: (c) => c.s.tab === 'chars' },
);
