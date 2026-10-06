// Якоря обучения: элементы, на которые показывает шаг, помечены data-tour. Одно имя можно повесить на несколько
// вариантов раскладки (кнопка «Следующий» — внизу на телефоне и под формой на ПК): берётся первый видимый.
export const ANCHORS = [
  'slot', 'grade', 'pick', 'item', 'sets', 'grid', 'rows', 'subpick', 'verdict', 'next', // главный тур
  'star', 'maincell', 'fourth', 'submove', 'chain', 'code', 'btabs', 'prio', // подсказки модулей
  'tryon', 'gequip', 'gslots', 'gpiece', 'gtry', 'vs', 'equipall', 'bgear', // экипировка: тур и подсказки
  'pool', 'variants', 'want', 'stats', // вещи персонажа, варианты связок, «Собираю», «По статам» (GEARPOOL)
  'wtab', // вкладка «Надето» в карточке персонажа
  'wchange', // «Переодеть в … ▸» под вкладками, когда показан не билд героя
  'fusion', // пометка «заменён Core Fusion X» на плитке X
  'bt', // «T4» рядом с сетом брони: вещь уже на Breakthrough T4
  'trade', // «К обмену ▸» в карточке персонажа
  'share', // «Поделиться» во вкладке «Надето»
  'more', // «Ещё»: ☰ на нижней плашке (телефон) и ⋯ в шапке (ПК)
  'stash', // «Отложить для X» под карточкой вердикта и в строке героя
] as const;
export type Anchor = (typeof ANCHORS)[number];

// <div {...tour('grid')}> — опечатку в имени поймает TypeScript
export const tour = (a: Anchor) => ({ 'data-tour': a });

// Кнопка внутри якоря, на которую показывает шаг на примере: 'slot:armor' — [data-tour="slot"] [data-tour-item="armor"]
export type Pin = `${Anchor}:${string}`;
export const tourItem = (key: string) => ({ 'data-tour-item': key });
// 'pick:*' — сам якорь целиком
export const pinSelector = (p: Pin) => {
  const i = p.indexOf(':'), key = p.slice(i + 1);
  const a = `[data-tour="${p.slice(0, i)}"]`;
  return key === '*' ? a : `${a} [data-tour-item="${key.replace(/["\\]/g, "\\$&")}"]`;
};
