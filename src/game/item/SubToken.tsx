// Сабстат вещи чипом: подпись и уровень (сколько сегментов горит). credit — насколько он засчитан билду: 1 и больше —
// полностью (ok), между 0 и 1 — наполовину (half), 0 — нет; без credit — без цвета. sort — по нему сортирует игра (↓).
import { subLabel } from '@/game/data';

export function SubToken({ stat, lit, credit, sort, title }: {
  stat: string; lit: number; credit?: number; sort?: boolean; title?: string;
}) {
  const cls = credit === undefined ? '' : credit >= 1 ? ' ok' : credit > 0 ? ' half' : '';
  return <span className={`tok${cls}${sort ? ' sort' : ''}`} title={title}>{subLabel(stat)}{sort && ' ↓'}<i>{lit}</i></span>;
}
