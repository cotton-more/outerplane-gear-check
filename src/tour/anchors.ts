// Якоря обучения: элементы, на которые показывает шаг, помечены data-tour. Одно имя можно повесить на несколько
// вариантов раскладки (кнопка «Следующий» — внизу на телефоне и под формой на ПК): берётся первый видимый.
export const ANCHORS = [
  'slot', 'grade', 'pick', 'item', 'sets', 'grid', 'rows', 'subpick', 'verdict', 'next', // главный тур
  'star', 'maincell', 'fourth', 'submove', 'chain', 'code', 'btabs', 'prio', 'dice', // подсказки модулей
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
