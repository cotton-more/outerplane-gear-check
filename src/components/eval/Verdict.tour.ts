// Вердикт «Временно» — главный тур его не объясняет: на примере вердикт «Оставить».
// Кнопка «Надеть» под карточкой (телефон) и «Фоддер», потому что вещь — материал для надетой
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'temp', rev: 1, at: 'verdict', since: '2026-09-27', when: (c) => c.s.tab === 'eval' && c.verdict.v === 'temp' },
  { id: 'cardEquip', rev: 1, at: 'gequip', since: '2026-09-28', when: (c) => c.s.tab === 'eval' && c.narrow && !c.verdictOpen },
  { id: 'material', rev: 1, at: 'verdict', since: '2026-09-28', when: (c) => c.s.tab === 'eval' && c.material },
);
