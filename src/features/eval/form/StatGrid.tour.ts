// Сетка: у оружия и аксессуара первое нажатие — main (rev 2: и у оружия, owner 2026-10-09, не в «Что нового»); клетки
// «main» — стат из main вещи, сабстатом не бывает
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'accMain', rev: 2, at: 'grid', when: (c) => c.s.tab === 'eval' && (c.s.slot === 'accessory' || c.s.slot === 'weapon') && !c.s.main },
  { id: 'mainCell', rev: 1, at: 'maincell', when: (c) => c.s.tab === 'eval' },
);
