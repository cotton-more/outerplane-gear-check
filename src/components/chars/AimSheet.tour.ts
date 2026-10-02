// «сменить ▾» на вкладке «Надето»: билд — то, под что одеваешь героя; смена покажет, что надеть (шторка «Билд для X»).
// Без news — решение владельца
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'aimChange', rev: 1, at: 'wchange', when: (c) => c.s.tab === 'chars' },
);
