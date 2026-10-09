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
  'app/shell/About.tsx': 'helper',                     // «О приложении» в «Ещё»: откуда данные, версия, лицензии
  'app/shell/Guide.tsx': 'core',                       // карточка первого запуска и Справка — отсюда начинается тур
  'app/shell/Header.tsx': 'helper',                    // вкладки на широком экране
  'app/shell/Switches.tsx': 'helper',                  // язык и значки в «Ещё»: подписи говорят сами за себя
  'app/shell/OnboardingStrips.tsx': 'helper',          // полосы «Появилось обучение» и «Что нового»: говорят сами за себя
  'screens/chars/BuildView.tsx': 'helper',             // билд из outerpedia в карточке: его объясняет подсказка карточки персонажа
  'screens/chars/CharHead.tsx': 'helper',              // шапка героя: портрет, имя, тиры — только показ
  'screens/share/ShareCard.tsx': 'helper',            // карточка показа по ссылке: только просмотр, полоса сверху говорит сама; кнопку объясняет подсказка share
  'screens/eval/EvalPanel.tsx': 'core',                // форма: слот, грейд, сет или main, сетка
  'screens/eval/VBar.tsx': 'core',                     // плашка вердикта на телефоне — шаг «Вердикт» главного тура (якорь verdict)
  'screens/eval/VerdictCard.tsx': 'core',              // карточка вердикта — шаг «Вердикт» главного тура (якорь verdict)
  'features/eval/form/EvalSettings.tsx': 'helper',     // настройки оценки: подписи говорят сами за себя
  'features/eval/form/ItemPicker.tsx': 'core',         // окно выбора Legendary по названию — шаг «сет или предмет»
  'features/eval/form/LevelAsk.tsx': 'core',           // окно уровня после нажатия в сетке — шаг «сетка»; очевидно само (владелец: в «Что нового» не нужно)
  'features/eval/form/MainPicker.tsx': 'core',         // окно main — тот же шаг
  'features/eval/form/PickField.tsx': 'helper',        // поле, открывающее окно выбора
  'features/eval/form/RosterOnlyToggle.tsx': 'helper', // «Только мой ростер» — настройка оценки, подпись говорит сама
  'features/eval/form/SetPicker.tsx': 'core',          // окно сетов — шаг «сет»
  'features/gear/ui/EquipButton.tsx': 'helper',        // кнопка «Надеть»: её объясняют подсказки вердикта и тур «Экипировка»
  'features/gear/ui/VsChip.tsx': 'helper',             // чип исхода в «Сейчас на персонажах» и карточке вердикта: их подсказки его объясняют
  'features/gear/ui/pieceText.tsx': 'helper',          // подписи вещи в строках экипировки
  'features/roster/BackupIO.tsx': 'helper',            // «Резервная копия» в «Ещё»: подпись говорит, что это
  'features/roster/CharBar.tsx': 'helper',             // панель над списком: поиск, фильтр, «Мои · Доодеть», «Обмен» — подписи говорят сами, звёздочку объясняет подсказка star
  'features/roster/CharFilterSheet.tsx': 'helper',     // шторка фильтра: стихии и классы кнопками, «Сбросить»
  'features/roster/CharTile.tsx': 'helper',            // плитка героя: её объясняют подсказки списка персонажей
  'features/roster/RosterRemoveAsk.tsx': 'helper',     // окно «Убрать X из ростера?» при звезде героя с вещами: объясняет себя само
  'features/worn/Redress.tsx': 'helper',               // re-dress sheet from the Worn tab button: the gear tip explains it, rows name themselves
  'features/trade/ui/TeamPick.tsx': 'helper',          // team diamond inside the trade sheet: the trade tip explains the sheet
  'features/trade/ui/TradePlan.tsx': 'helper',         // trade plan inside the trade sheet: the trade tip explains the sheet
  'features/trade/ui/OrderSheet.tsx': 'helper',        // hero's order in the trade sheet: the trade tip explains the sheet
  'features/batch/ui/BatchStrip.tsx': 'helper',        // batch strip over the form: the batch tip explains the mode
  'features/batch/ui/BatchList.tsx': 'helper',         // pieces of the batch: the batch tip explains the mode
  'features/batch/ui/BatchPlan.tsx': 'helper',         // the batch plan: its lines say what to do, the batch tip explains the mode
  'features/batch/ui/BatchPanel.tsx': 'helper',        // list or plan in the sheet / column: the batch tip explains the mode
  'features/batch/ui/BatchWalk.tsx': 'helper',         // the step-by-step walk: its steps say what to do, the batch tip (rev 2) names it
  'game/hero/HeroFace.tsx': 'helper',                  // портрет героя
  'game/hero/HeroName.tsx': 'helper',                  // имя героя одной строкой: приставка режется первой
  'game/hero/HeroTag.tsx': 'helper',                   // hero to find in the game: class icon + element colour
  'game/icons/Img.tsx': 'helper',                      // картинки и значки
  'game/item/SubLevels.tsx': 'helper',                 // кнопки уровня сабстата и строка предела: их объясняют подсказки формы и карточки вещи
  'game/item/SubToken.tsx': 'helper',                  // сабстат вещи чипом в строках экипировки
  'shared/ui/AskSheet.tsx': 'helper',                  // окно-вопрос с «Да» и «Отмена»
  'shared/ui/CloseButton.tsx': 'helper',               // кнопка ✕
  'shared/ui/CodeBox.tsx': 'helper',                   // поле кода для переноса: подпись говорит, что это
  'shared/ui/Expand.tsx': 'helper',                    // строка, раскрывающаяся на месте («Ещё»)
  'shared/ui/FilterChips.tsx': 'helper',               // фильтр кнопками
  'shared/ui/Notice.tsx': 'helper',                    // плашка с одной кнопкой
  'shared/ui/RadioRow.tsx': 'helper',                  // строка-радио в шторке выбора: учат шторки, где она стоит
  'shared/ui/Rich.tsx': 'helper',                      // жирный текст в фразах
  'shared/ui/SegSwitch.tsx': 'helper',                 // переключатель сегментами
  'shared/ui/Sheet.tsx': 'helper',                     // шторка для окон
  'shared/ui/Toast.tsx': 'helper',                     // сообщение внизу с «Вернуть»: его текст говорит сам за себя
  'shared/ui/Toggle.tsx': 'helper',                    // галочка с подписью
};
