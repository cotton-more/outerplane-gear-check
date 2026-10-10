// Вкладка «Надето» в карточке героя: что на герое сейчас в игре, пустой слот — «Ввести», внизу — «Что искать».
// rev 3 — «Что искать» с ценой сета в очках, строка «что даст T4» (owner 2026-10-10: text OK, in «Что нового»)
// wornChain — points of the worn gear and the chain with segment sums (owner, 2026-10-07: text OK, in «Что нового»)
// wornBudget — the Worn heading opens into stats, sets and passive (anchor wbudget on the heading; owner 2026-10-10: text OK, in «Что нового»)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'wornTab', rev: 3, at: 'wtab', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornChain', rev: 1, at: 'wchain', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornBudget', rev: 1, at: 'wbudget', news: true, when: (c) => c.s.tab === 'chars' },
);
