// Якоря обучения: элементы, на которые показывает шаг, помечены data-tour. Одно имя можно повесить на несколько
// вариантов раскладки (кнопка «Следующий» — внизу на телефоне и под формой на ПК): берётся первый видимый.
export const ANCHORS = ['slot', 'grade', 'pick', 'grid', 'verdict', 'next'] as const;
export type Anchor = (typeof ANCHORS)[number];

// <div {...tour('grid')}> — опечатку в имени поймает TypeScript
export const tour = (a: Anchor) => ({ 'data-tour': a });
