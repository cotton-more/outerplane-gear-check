// «Поделиться» во «Надето»: ссылка показа героя — друг видит надетое и билд, только просмотр (.x/0060-share-code SPEC 6).
// news: новая функция — давним игрокам «Что нового»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'share', rev: 1, at: 'share', news: true, when: (c) => c.s.tab === 'chars' },
);
