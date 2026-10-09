// Grid: for a weapon and an accessory the first tap is the main (rev 2: weapon too, owner 2026-10-09, not in «Что нового»); the
// «main» cells are a stat from the piece's main, never a substat
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'accMain', rev: 2, at: 'grid', when: (c) => c.s.tab === 'eval' && (c.s.slot === 'accessory' || c.s.slot === 'weapon') && !c.s.main },
  { id: 'mainCell', rev: 1, at: 'maincell', when: (c) => c.s.tab === 'eval' },
);
