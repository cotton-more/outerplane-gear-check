// Общее для слоя тура и подсказок: найти на странице то, на что показывает шаг, и его рамку.
export interface Rect { top: number; left: number; width: number; height: number }
export interface Geom { rings: Rect[]; ring: Rect | null; overlay: boolean; card: boolean; bottom: number; h: number; vw: number; vh: number }

export const visible = (el: Element) => el.getClientRects().length > 0;
export const rect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

// Окно поверх страницы: шторка (Sheet) или карточка персонажа во весь экран на телефоне
const LAYER = '.drawer, html.sheet .char-detail.open';

// Цели шага: у каждого селектора — первый видимый элемент. Пока открыто окно — только то, что в нём,
// иначе — только то, что не в окне (поле под шторкой формально видно).
export function targets(sels: string[], overlay: boolean): Element[] {
  return sels.flatMap((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && !!e.closest(LAYER) === overlay);
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

// рамка с отступом p, но не за краями окна по бокам: у элемента во всю ширину иначе не видно боковых линий
export const pad = (r: Rect, p: number, vw = Infinity) => {
  const left = Math.max(2, r.left - p), right = Math.min(vw - 2, r.left + r.width + p);
  return { top: r.top - p, left, width: right - left, height: r.height + 2 * p };
};

// якорь в свободной части окна (не за краем и не под плашкой вердикта; в окне поверх страницы — в пределах окна)
export function inView(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return true; // jsdom раскладку не считает — там это не проверить
  const bottom = el.closest(LAYER) ? window.innerHeight : freeBottom();
  return r.height > 0 && r.bottom > 0 && r.top < bottom;
}

// карточка персонажа во весь экран (телефон): плашка тура встаёт снизу, чтобы не закрыть «← К списку»
export const cardOpen = () => document.body.classList.contains('sheet-open');

export const overlayOpen = () => {
  const b = document.body.classList;
  return b.contains('drawer-lock') || b.contains('sheet-open');
};

// нижняя граница свободного места: верх плашки вердикта на телефоне, иначе низ окна
export const freeBottom = () => document.getElementById('vbar')?.getBoundingClientRect().top ?? window.innerHeight;
