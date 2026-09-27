// Сетка: у аксессуара первое нажатие — main; клетки «main» — стат из main вещи, сабстатом не бывает
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'accMain', rev: 1, at: 'grid', since: '2026-09-26', when: (c) => c.s.tab === 'eval' && c.s.slot === 'accessory' && !c.s.main },
  { id: 'mainCell', rev: 1, at: 'maincell', since: '2026-09-27', when: (c) => c.s.tab === 'eval' },
);
