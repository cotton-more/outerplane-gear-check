// «Поделиться» во «Надето»: ссылка показа героя — друг видит надетое и закреплённый набор, только просмотр (.x/0060
// SPEC 6). rev 2 — набор вместо билда (.x/0085 этап 6), без «Что нового»: новость этапа одна — pin
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'share', rev: 2, at: 'share', when: (c) => c.s.tab === 'chars' },
);
