// «Переодеть в … ▸» под вкладками билда: билд — то, под что одеваешь героя; смена покажет, что надеть («Переодеть»).
// Без news — решение владельца
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'aimChange', rev: 2, at: 'wchange', when: (c) => c.s.tab === 'chars' },
);
