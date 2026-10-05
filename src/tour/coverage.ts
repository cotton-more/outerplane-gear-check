// Что с обучением у каждого компонента src/**/*.tsx (кроме src/tour и main.tsx), у которого нет своего Имя.tour.ts рядом.
// Ключ — путь от src/.
// Проверяет test/tour/tour.test.ts: новый компонент без записи и без .tour.ts — тест падает и говорит, что сделать.
//   core   — его функцию объясняет главный тур (src/tour/core.ts)
//   helper — служебный или понятен без объяснений: отдельной подсказки не нужно
//   todo   — игроку есть что подсказать, подсказка ещё не написана
// Причина — в комментарии: значения только латиницей (русский в src — только в i18n, test/i18n.test.ts).
export type Coverage = 'core' | 'helper' | 'todo';

export const COVERAGE: Record<string, Coverage> = {
  'app/App.tsx': 'helper',                             // корень: собирает экраны и шторки, своего на экране нет
  'app/shell/Footer.tsx': 'helper',                    // подвал: версия данных, лицензии, язык
  'app/shell/Guide.tsx': 'core',                       // карточка первого запуска и Справка — отсюда начинается тур
  'app/shell/Header.tsx': 'helper',                    // вкладки на широком экране
  'app/shell/Menu.tsx': 'helper',                      // меню ☰: те же кнопки, что под формой на ПК; «Экипировка» называет конец тура gear
  'app/shell/OnboardingStrips.tsx': 'helper',          // полосы «Появилось обучение» и «Что нового»: говорят сами за себя
  'screens/chars/BuildView.tsx': 'helper',             // билд из outerpedia в карточке: его объясняет подсказка карточки персонажа
  'screens/eval/EvalPanel.tsx': 'core',                // форма: слот, грейд, сет или main, сетка
  'screens/eval/VBar.tsx': 'core',                     // плашка вердикта на телефоне — шаг «Вердикт» главного тура (якорь verdict)
  'screens/eval/VerdictCard.tsx': 'core',              // карточка вердикта — шаг «Вердикт» главного тура (якорь verdict)
  'features/eval/form/EvalSettings.tsx': 'helper',     // настройки оценки: подписи говорят сами за себя
  'features/eval/form/ItemPicker.tsx': 'core',         // окно выбора Legendary по названию — шаг «сет или предмет»
  'features/eval/form/MainButtons.tsx': 'core',        // main оружия кнопками — тот же шаг
  'features/eval/form/MainPicker.tsx': 'core',         // окно main — тот же шаг
  'features/eval/form/PickField.tsx': 'helper',        // поле, открывающее окно выбора
  'features/eval/form/RosterOnlyToggle.tsx': 'helper', // «Только мой ростер» — настройка оценки, подпись говорит сама
  'features/eval/form/SetPicker.tsx': 'core',          // окно сетов — шаг «сет»
  'features/gear/ui/EquipButton.tsx': 'helper',        // кнопка «Надеть»: её объясняют подсказки вердикта и тур «Экипировка»
  'features/gear/ui/PinMark.tsx': 'helper',            // булавка «Не отдавать надетое»: её объясняет подсказка обмена
  'features/gear/ui/VsChip.tsx': 'helper',             // чип исхода в «Сейчас на персонажах» и карточке вердикта: их подсказки его объясняют
  'features/gear/ui/WantToggle.tsx': 'helper',         // «Собираю»: его объясняет подсказка want карточки билда
  'features/gear/ui/pieceText.tsx': 'helper',          // подписи вещи в строках экипировки
  'features/roster/CharTile.tsx': 'helper',            // плитка героя: её объясняют подсказки списка персонажей
  'features/roster/RosterRemoveAsk.tsx': 'helper',     // окно «Убрать X из ростера?» при звезде героя с вещами: объясняет себя само
  'features/worn/AimsSheet.tsx': 'helper',             // list of heroes with picked builds, opened from the notice button: the notice explains it
  'features/worn/Redress.tsx': 'helper',               // re-dress screen, opens from the build sheet whose tip explains it; sections name themselves
  'features/trade/ui/TeamPick.tsx': 'helper',          // team diamond inside the trade sheet: the trade tip explains the sheet
  'features/trade/ui/TradePlan.tsx': 'helper',         // trade plan inside the trade sheet: the trade tip explains the sheet
  'game/hero/HeroFace.tsx': 'helper',                  // портрет героя
  'game/hero/HeroName.tsx': 'helper',                  // имя героя одной строкой: приставка режется первой
  'game/icons/Img.tsx': 'helper',                      // картинки и значки
  'game/item/SubLevels.tsx': 'helper',                 // кнопки уровня сабстата и строка предела: их объясняют подсказки формы и карточки вещи
  'game/item/SubToken.tsx': 'helper',                  // сабстат вещи чипом в строках экипировки
  'shared/ui/AskSheet.tsx': 'helper',                  // окно-вопрос с «Да» и «Отмена»
  'shared/ui/CloseButton.tsx': 'helper',               // кнопка ✕
  'shared/ui/CodeBox.tsx': 'helper',                   // поле кода для переноса: подпись говорит, что это
  'shared/ui/FilterChips.tsx': 'helper',               // фильтр кнопками
  'shared/ui/Notice.tsx': 'helper',                    // плашка с одной кнопкой
  'shared/ui/Rich.tsx': 'helper',                      // жирный текст в фразах
  'shared/ui/SegSwitch.tsx': 'helper',                 // переключатель сегментами
  'shared/ui/Sheet.tsx': 'helper',                     // шторка для окон
  'shared/ui/Toast.tsx': 'helper',                     // сообщение внизу с «Вернуть»: его текст говорит сам за себя
  'shared/ui/Toggle.tsx': 'helper',                    // галочка с подписью
};
