import { useLayoutEffect, type RefObject } from 'react';

const GAP = 12; // отступ снизу — такой же, как сверху у липкой колонки
const MIN = 160;

// Липкая колонка (вердикт на широком экране) — от своего верха до низа окна. Пока шапка видна, колонка начинается
// ниже, а после прокрутки прилипает к верху; фиксированный запас под шапку съедал треть высоты на телефоне
// в ландшафте. Поэтому высоту считаем по факту: при прокрутке, смене размера окна и когда меняется то, что над
// колонкой (плашки, шапка).
// Форма слева выше окна (телефон в ландшафте) — колонка не ниже формы: когда снизу въезжает подвал, колонка
// укорачивается, а не уезжает вверх вместе со штампом вердикта. Форма ниже окна (монитор) — так не делаем:
// колонка сама задаёт высоту раздела, и такое ограничение не давало бы ей вырасти обратно.
export function useFillViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const top = Math.max(el.getBoundingClientRect().top, GAP);
      let bottom = window.innerHeight - GAP;
      const form = el.previousElementSibling;
      if (form instanceof HTMLElement && form.offsetHeight >= window.innerHeight - 2 * GAP) {
        bottom = Math.min(bottom, form.getBoundingClientRect().bottom);
      }
      el.style.maxHeight = `${Math.max(bottom - top, MIN)}px`;
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(fit); };
    fit();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(request);
    ro?.observe(document.body);
    return () => {
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      ro?.disconnect();
      cancelAnimationFrame(frame);
      el.style.maxHeight = '';
    };
  }, [ref]);
}
