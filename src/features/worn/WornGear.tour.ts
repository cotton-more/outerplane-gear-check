// Вкладка «Надето» в карточке героя: что на герое сейчас в игре, пустой слот — «Ввести», внизу — «Что искать».
// rev 2 — .x/0085 этап 6 (без «Что нового»: новость этапа одна — pin)
// wornChain — points of the worn gear and the chain with segment sums (owner, 2026-10-07: text OK, in «Что нового»)
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'wornTab', rev: 2, at: 'wtab', when: (c) => c.s.tab === 'chars' },
  { id: 'wornChain', rev: 1, at: 'wchain', news: true, when: (c) => c.s.tab === 'chars' },
);
