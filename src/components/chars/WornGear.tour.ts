// Вкладка «Надето» в карточке персонажа: что на герое сейчас в игре, пустой слот — «Ввести» (оценка для этого слота).
// news: новая вкладка — давним игрокам «Что нового»
import { defineTips } from '../../tour/types';

export default defineTips(
  { id: 'wornTab', rev: 1, at: 'wtab', news: true, when: (c) => c.s.tab === 'chars' },
);
