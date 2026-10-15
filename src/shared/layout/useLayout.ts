import { useEffect, useState } from 'react';

// Sizes the app is built and checked for (owner, 2026-10-15; DEVELOPMENT.md «Screen sizes»): the owner's computer
// (2056×1202, and 1280×800) and a Pixel split in half — stacked 411×564, side by side 411×363. Nothing is laid out
// narrower than MIN_W: a narrower window shows the same page scaled down (measure)
export const MIN_W = 410;
// a window up to this height is «short» (side-by-side split, ~363–378); the stacked split (~564–586) is not. The CSS
// rules for short windows use the same number: @media (max-height: 480px)
export const SHORT_H = 480;

export interface Layout {
  narrow: boolean;  // < 720: вердикт под вводом, плашка вердикта внизу экрана
  xs: boolean;      // < 560
  sheet: boolean;   // < 900: билды персонажа — полноэкранной шторкой
  wide: boolean;    // ≥ 1100
  tall: boolean;    // height > SHORT_H: not the side-by-side split strip
  desktopModeOnPhone: boolean;
}

const root = () => document.documentElement;

// есть мышь и клавиатура — можно подсказать горячие клавиши
export const fineHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export interface Viewport { innerWidth: number; innerHeight: number; screenWidth: number; screenHeight: number; coarse: boolean }

// Реальная ширина экрана. В режиме «Версия для ПК» мобильный Chrome рисует страницу шириной ~980px и сжимает её —
// текст становится мелким, а раскладка десктопной; распознаём это по ширине экрана и возвращаем мобильную раскладку.
// Ширину экрана берём по ориентации самого окна, а не screen.width как есть: на iPhone screen.width всегда портретный,
// а Android во время поворота ещё отдаёт старое значение — иначе ландшафт выглядел бы как «Версия для ПК»
// (страница увеличена в 2+ раза, мобильная раскладка).
// A window narrower than MIN_W is laid out at MIN_W and scaled down to fit — smaller text, no sideways scroll.
export function measure(v: Viewport): { width: number; zoom: number; desktopModeOnPhone: boolean } {
  const landscape = v.innerWidth > v.innerHeight;
  const screenW = landscape ? Math.max(v.screenWidth, v.screenHeight) : Math.min(v.screenWidth, v.screenHeight);
  const desktopModeOnPhone = v.coarse && screenW > 0 && screenW < 720 && v.innerWidth > screenW * 1.25;
  // масштабируем страницу обратно до ширины телефона: текст нормального размера, раскладка мобильная
  const width = Math.max(desktopModeOnPhone ? screenW : v.innerWidth, MIN_W);
  return { width, zoom: v.innerWidth / width, desktopModeOnPhone };
}

// Классы на <html> читает CSS; зовём до первого рендера, чтобы не мигала раскладка.
export function applyLayout(): Layout {
  const r = root();
  r.style.zoom = '';
  const m = measure({
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    screenWidth: screen.width, screenHeight: screen.height, coarse: matchMedia('(pointer: coarse)').matches,
  });
  if (m.zoom !== 1) r.style.zoom = String(m.zoom);
  const w = m.width;
  const tall = window.innerHeight / m.zoom > SHORT_H;
  const layout = { narrow: w < 720, xs: w < 560, sheet: w < 900, wide: w >= 1100, tall, desktopModeOnPhone: m.desktopModeOnPhone };
  r.classList.toggle('narrow', layout.narrow);
  r.classList.toggle('xs', layout.xs);
  r.classList.toggle('sheet', layout.sheet);
  r.classList.toggle('wide', layout.wide);
  return layout;
}

const same = (a: Layout, b: Layout) => (Object.keys(a) as (keyof Layout)[]).every((k) => a[k] === b[k]);

export function useLayout(): Layout {
  const [layout, setLayout] = useState(applyLayout);
  useEffect(() => {
    const apply = () => { const next = applyLayout(); setLayout((prev) => (same(prev, next) ? prev : next)); };
    // после поворота размеры окна и экрана доходят не одновременно — перепроверяем, когда всё улеглось
    let settle = 0;
    const onResize = () => { apply(); clearTimeout(settle); settle = window.setTimeout(apply, 400); };
    window.addEventListener('resize', onResize);
    screen.orientation?.addEventListener?.('change', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      screen.orientation?.removeEventListener?.('change', onResize);
      clearTimeout(settle);
    };
  }, []);
  return layout;
}
