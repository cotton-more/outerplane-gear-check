// «К обмену ▸» в карточке персонажа: шторка «Обмен вещами» — кто что наденет из всех вещей, булавка «Не отдавать надетое».
// news: новая функция — давним игрокам «Что нового»
import { defineTips } from '@/tour/types';

export default defineTips(
  { id: 'trade', rev: 1, at: 'trade', news: true, when: (c) => c.s.tab === 'chars' },
);
