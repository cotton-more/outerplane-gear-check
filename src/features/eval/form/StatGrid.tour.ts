// Grid: for an accessory the first tap is the main (rev 2: weapon too, owner 2026-10-09; rev 3: accessory only — a weapon's main
// is the pill next to the grade, and the gold chip changes it, owner 2026-11-22; not in «Что нового»); the
// «main» cells are a stat from the piece's main, never a substat
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'accMain', rev: 3, since: '2026-11-22', at: 'grid', when: (c) => c.s.tab === 'eval' && c.s.slot === 'accessory' && !c.s.main },
  { id: 'mainCell', rev: 1, since: '2026-09-27', at: 'maincell', when: (c) => c.s.tab === 'eval' },
);
