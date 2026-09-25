import { useEffect, useState } from 'react';

export interface Layout {
  narrow: boolean;  // < 720: вердикт под вводом, плашка вердикта внизу экрана
  xs: boolean;      // < 560
  sheet: boolean;   // < 900: билды персонажа — полноэкранной шторкой
  wide: boolean;    // ≥ 1100
  desktopModeOnPhone: boolean;
}

const root = () => document.documentElement;

// Реальная ширина экрана. В режиме «Версия для ПК» мобильный Chrome рисует страницу шириной ~980px
// и сжимает её — текст становится мелким, а раскладка десктопной. screen.width при этом честный.
// Классы на <html> читает CSS; зовём до первого рендера, чтобы не мигала раскладка.
export function applyLayout(): Layout {
  const r = root();
  r.style.zoom = '';
  const coarse = matchMedia('(pointer: coarse)').matches;
  let w = window.innerWidth;
  const desktopModeOnPhone = coarse && screen.width > 0 && screen.width < 720 && w > screen.width * 1.25;
  if (desktopModeOnPhone) {
    // масштабируем страницу обратно до ширины телефона: текст нормального размера, раскладка мобильная
    r.style.zoom = String(w / screen.width);
    w = screen.width;
  }
  const layout = { narrow: w < 720, xs: w < 560, sheet: w < 900, wide: w >= 1100, desktopModeOnPhone };
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
    const onResize = () => { const next = applyLayout(); setLayout((prev) => (same(prev, next) ? prev : next)); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layout;
}
