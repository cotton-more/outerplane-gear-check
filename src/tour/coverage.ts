// Что с обучением у каждого компонента src/components/**/*.tsx, у которого нет своего Имя.tour.ts рядом.
// Проверяет test/tour.test.ts: новый компонент без записи и без .tour.ts — тест падает и говорит, что сделать.
//   core   — его функцию объясняет главный тур (src/tour/core.ts)
//   helper — служебный или понятен без объяснений: отдельной подсказки не нужно
//   todo   — игроку есть что подсказать, подсказка ещё не написана (этап 2: подсказки по ходу)
// Причина — в комментарии: значения только латиницей (русский в src — только в i18n, test/i18n.test.ts).
export type Coverage = 'core' | 'helper' | 'todo';

export const COVERAGE: Record<string, Coverage> = {
  'Footer.tsx': 'helper',          // подвал: версия данных, лицензии, язык
  'Guide.tsx': 'core',             // карточка первого запуска и Справка — отсюда начинается тур
  'Header.tsx': 'helper',          // вкладки на широком экране
  'Img.tsx': 'helper',             // картинки и значки
  'Menu.tsx': 'helper',            // меню ☰: те же кнопки, что под формой на ПК
  'Notice.tsx': 'helper',          // плашка с одной кнопкой
  'Rich.tsx': 'helper',            // жирный текст в фразах
  'Sheet.tsx': 'helper',           // шторка для окон
  'chars/CharDetail.tsx': 'todo',  // билды персонажа, «что искать»
  'eval/EvalPanel.tsx': 'core',    // форма: слот, грейд, сет или main, сетка
  'eval/ItemPicker.tsx': 'core',   // окно выбора Legendary по названию — шаг «сет или предмет»
  'eval/MainButtons.tsx': 'core',  // main оружия кнопками — тот же шаг
  'eval/MainPicker.tsx': 'core',   // окно main — тот же шаг
  'eval/PickField.tsx': 'helper',  // поле, открывающее окно выбора
  'eval/SetPicker.tsx': 'core',    // окно сетов — шаг «сет»
};
