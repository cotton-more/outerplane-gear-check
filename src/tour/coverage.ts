// Что с обучением у каждого компонента src/**/*.tsx (кроме src/tour и main.tsx), у которого нет своего Имя.tour.ts рядом.
// Ключ — путь от src/.
// Проверяет test/tour.test.ts: новый компонент без записи и без .tour.ts — тест падает и говорит, что сделать.
//   core   — его функцию объясняет главный тур (src/tour/core.ts)
//   helper — служебный или понятен без объяснений: отдельной подсказки не нужно
//   todo   — игроку есть что подсказать, подсказка ещё не написана
// Причина — в комментарии: значения только латиницей (русский в src — только в i18n, test/i18n.test.ts).
export type Coverage = 'core' | 'helper' | 'todo';

export const COVERAGE: Record<string, Coverage> = {
  'app/App.tsx': 'helper',                         // корень: собирает экраны и шторки, своего на экране нет
  'app/shell/Footer.tsx': 'helper',                // подвал: версия данных, лицензии, язык
  'app/shell/Guide.tsx': 'core',                   // карточка первого запуска и Справка — отсюда начинается тур
  'app/shell/Header.tsx': 'helper',                // вкладки на широком экране
  'app/shell/Menu.tsx': 'helper',                  // меню ☰: те же кнопки, что под формой на ПК; «Экипировка» называет конец тура gear
  'features/eval/form/EvalPanel.tsx': 'core',      // форма: слот, грейд, сет или main, сетка
  'features/eval/form/ItemPicker.tsx': 'core',     // окно выбора Legendary по названию — шаг «сет или предмет»
  'features/eval/form/MainButtons.tsx': 'core',    // main оружия кнопками — тот же шаг
  'features/eval/form/MainPicker.tsx': 'core',     // окно main — тот же шаг
  'features/eval/form/PickField.tsx': 'helper',    // поле, открывающее окно выбора
  'features/eval/form/SetPicker.tsx': 'core',      // окно сетов — шаг «сет»
  'features/roster/RosterRemoveAsk.tsx': 'helper', // окно «Убрать X из ростера?» при звезде героя с вещами: объясняет себя само
  'features/worn/AimsSheet.tsx': 'helper',         // list of heroes with picked builds, opened from the notice button: the notice explains it
  'features/worn/Redress.tsx': 'helper',           // re-dress screen, opens from the build sheet whose tip explains it; sections name themselves
  'features/trade/ui/TeamPick.tsx': 'helper',      // team diamond inside the trade sheet: the trade tip explains the sheet
  'features/trade/ui/TradePlan.tsx': 'helper',     // trade plan inside the trade sheet: the trade tip explains the sheet
  'game/icons/Img.tsx': 'helper',                  // картинки и значки
  'shared/ui/Notice.tsx': 'helper',                // плашка с одной кнопкой
  'shared/ui/Rich.tsx': 'helper',                  // жирный текст в фразах
  'shared/ui/Sheet.tsx': 'helper',                 // шторка для окон
};
