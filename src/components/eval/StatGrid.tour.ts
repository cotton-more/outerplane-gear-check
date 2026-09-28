// Сетка: у аксессуара первое нажатие — main; клетки «main» — стат из main вещи, сабстатом не бывает
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'accMain', rev: 1, at: 'grid', when: (c) => c.s.tab === 'eval' && c.s.slot === 'accessory' && !c.s.main },
  { id: 'mainCell', rev: 1, at: 'maincell', when: (c) => c.s.tab === 'eval' },
);
