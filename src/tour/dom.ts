// Общее для слоя тура и подсказок: найти на странице то, на что показывает шаг, и его рамку.
export interface Rect { top: number; left: number; width: number; height: number }
export interface Geom { rings: Rect[]; ring: Rect | null; overlay: boolean; bottom: number; h: number; vh: number }

export const visible = (el: Element) => el.getClientRects().length > 0;
export const rect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

// Цели шага: у каждого селектора — первый видимый элемент. Пока открыто окно — только то, что в нём,
// иначе — только то, что не в окне (поле под шторкой формально видно).
export function targets(sels: string[], overlay: boolean): Element[] {
  return sels.flatMap((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && !!e.closest('.drawer') === overlay);
    return el ? [el] : [];
  });
}

// общая рамка всех целей — от неё считается, где встать полосе, и «окно» в приглушении
export function union(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  const top = Math.min(...rs.map((r) => r.top)), left = Math.min(...rs.map((r) => r.left));
  const bottom = Math.max(...rs.map((r) => r.top + r.height)), right = Math.max(...rs.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

export const pad = (r: Rect, p: number) => ({ top: r.top - p, left: r.left - p, width: r.width + 2 * p, height: r.height + 2 * p });

export const overlayOpen = () => {
  const b = document.body.classList;
  return b.contains('drawer-lock') || b.contains('sheet-open');
};

// нижняя граница свободного места: верх плашки вердикта на телефоне, иначе низ окна
export const freeBottom = () => document.getElementById('vbar')?.getBoundingClientRect().top ?? window.innerHeight;
