// Вкладка «Надето» в карточке героя: что на герое сейчас в игре, пустой слот — «Ввести», внизу — «Что искать».
// rev 3 — «Что искать» с ценой сета в очках, строка «что даст T4» (owner 2026-10-10: text OK, in «Что нового»)
// wornChain — points of the worn gear and the chain with segment sums (owner, 2026-10-07: text OK, in «Что нового»)
// wornBudget — the Worn heading opens into stats, sets and passive (anchor wbudget on the heading; owner 2026-10-10: text OK, in «Что нового»)
// wornCrit — «Крит: 45%» under the chain, tap → the hero's N (crit soft cap; owner 2026-10-11: text OK, in «Что нового»)
// wornEff — «Эфф: ≈ 233» under the crit line, tap → the typed stat-screen EFF (HISTORY.md 0200-boss stage D; owner 2026-10-12: text OK, in «Что нового»)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'wornTab', rev: 3, at: 'wtab', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornChain', rev: 1, at: 'wchain', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornBudget', rev: 1, at: 'wbudget', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornCrit', rev: 1, at: 'wcrit', news: true, when: (c) => c.s.tab === 'chars' },
  { id: 'wornEff', rev: 1, at: 'weff', news: true, when: (c) => c.s.tab === 'chars' },
);
