// Вердикт «Временно» — главный тур его не объясняет: на примере вердикт «Оставить».
// Кнопка «Надеть» под карточкой (телефон), «Фоддер», потому что вещь — материал для надетой, и «Разобрать»,
// потому что всем, кому она подходит, уже надето не хуже (logic/worn)
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'temp', rev: 1, at: 'verdict', when: (c) => c.s.tab === 'eval' && c.verdict.v === 'temp' },
  { id: 'cardEquip', rev: 1, at: 'gequip', when: (c) => c.s.tab === 'eval' && c.narrow && !c.verdictOpen },
  { id: 'material', rev: 1, at: 'verdict', when: (c) => c.s.tab === 'eval' && c.material },
  { id: 'worn', rev: 1, at: 'verdict', when: (c) => c.s.tab === 'eval' && c.worn },
);
