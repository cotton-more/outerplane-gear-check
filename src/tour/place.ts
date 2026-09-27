// Где встать полосе обучения, чтобы не закрыть то, на что она показывает. Чистая функция — проверяется тестом
// на ширинах 280–1280 и в ландшафте.
export interface Box { top: number; bottom: number }

// target — рамка якоря (или null); top/bottom — свободная полоса экрана (снизу — над плашкой вердикта);
// h — высота полосы с текстом. Внизу удобнее — под большим пальцем; не помещается ни снизу, ни сверху —
// сворачиваемся в узкую плашку сверху.
export function place(target: Box | null, top: number, bottom: number, h: number): 'bottom' | 'top' | 'pill' {
  const gap = 8;
  if (!target) return 'bottom';
  if (bottom - h - gap >= target.bottom) return 'bottom';
  if (top + h + gap <= target.top) return 'top';
  return 'pill';
}
