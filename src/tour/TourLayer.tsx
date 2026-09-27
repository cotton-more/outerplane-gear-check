// Слой обучения поверх страницы: рамка вокруг того, на что показывает шаг, и полоса с текстом и кнопками.
// Экран не затемняется и нажатия проходят к странице: игрок делает шаг сам. Полоса встаёт снизу (над плашкой
// вердикта) или сверху — где не закроет рамку (place.ts); пока открыто окно выбора — узкой плашкой сверху.
// На примере рамки показывают точные кнопки, а остальное приглушено — но нажимается: ошибку можно поправить.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rich } from '../components/Rich';
import { useT } from '../i18n';
import type { Tab } from '../state/appState';
import { pinSelector, type Anchor } from './anchors';
import { CORE, stepText } from './core';
import { place, type Box } from './place';
import type { TourCtx } from './types';
import type { TourApi } from './useTour';

interface Rect { top: number; left: number; width: number; height: number }
interface Geom { rings: Rect[]; ring: Rect | null; overlay: boolean; bottom: number; h: number; vh: number }

const visible = (el: Element) => el.getClientRects().length > 0;
const rect = (r: DOMRect): Rect => ({ top: r.top, left: r.left, width: r.width, height: r.height });

// Цели шага: у каждого селектора — первый видимый элемент. Пока открыто окно — только то, что в нём,
// иначе — только то, что не в окне (поле под шторкой формально видно).
function targets(sels: string[], overlay: boolean): Element[] {
  return sels.flatMap((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => visible(e) && !!e.closest('.drawer') === overlay);
    return el ? [el] : [];
  });
}

// общая рамка всех целей — от неё считается, где встать полосе, и «окно» в приглушении
function union(rs: Rect[]): Rect | null {
  if (!rs.length) return null;
  const top = Math.min(...rs.map((r) => r.top)), left = Math.min(...rs.map((r) => r.left));
  const bottom = Math.max(...rs.map((r) => r.top + r.height)), right = Math.max(...rs.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

const pad = (r: Rect, p: number) => ({ top: r.top - p, left: r.left - p, width: r.width + 2 * p, height: r.height + 2 * p });

export function TourLayer({ tour, c, rosterEmpty, onTab, onRoster }: {
  tour: TourApi; c: TourCtx; rosterEmpty: boolean; onTab: (t: Tab) => void; onRoster: () => void;
}) {
  const t = useT();
  const run = tour.run;
  const strip = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Geom>({ rings: [], ring: null, overlay: false, bottom: 0, h: 0, vh: 0 });
  const step = run?.phase.kind === 'step' ? CORE[run.phase.i] : null;
  const demo = !!run?.demo;
  // на примере — точные кнопки, которые осталось нажать; иначе весь якорь
  const pins = step && demo ? step.pin?.(c) ?? [] : [];
  const sels = pins.length ? pins.map(pinSelector) : (step ? step.at(c) : []).map((n: Anchor) => `[data-tour="${n}"]`);
  const selsRef = useRef(sels);
  selsRef.current = sels;

  // положение меняется от прокрутки, поворота, окон и самой страницы — меряем каждый кадр, пока идёт тур
  useEffect(() => {
    if (!run) return;
    let id = 0, last = '';
    const tick = () => {
      const b = document.body.classList;
      const vbar = document.getElementById('vbar');
      const overlay = b.contains('drawer-lock') || b.contains('sheet-open');
      const rings = targets(selsRef.current, overlay).map((el) => rect(el.getBoundingClientRect()));
      const next: Geom = {
        rings,
        ring: union(rings),
        overlay,
        bottom: vbar ? vbar.getBoundingClientRect().top : window.innerHeight,
        h: strip.current?.offsetHeight ?? 0,
        vh: window.innerHeight,
      };
      const s = JSON.stringify(next);
      if (s !== last) { last = s; setG(next); }
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [run !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // новый шаг: прокрутить к нему, если он за краем экрана или под плашкой вердикта
  const stepNo = run?.phase.kind === 'step' ? run.phase.i : -1;
  useLayoutEffect(() => {
    if (stepNo < 0) return;
    const el = targets(selsRef.current, false)[0];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottom = document.getElementById('vbar')?.getBoundingClientRect().top ?? window.innerHeight;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (r.top < 0 || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }, [stepNo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const x = stepText(c, run.demo);
  const off = step && demo ? step.off?.(c) ?? null : null;
  const away = c.s.tab !== 'eval';
  const box: Box | null = g.ring && { top: g.ring.top, bottom: g.ring.top + g.ring.height };
  const side = away || g.overlay ? 'pill' : place(box, 0, g.bottom || g.vh, g.h);
  const stripStyle = side === 'bottom' ? { bottom: Math.max(0, g.vh - (g.bottom || g.vh)) } : { top: 0 };

  const closeBtn = <button type="button" className="tour-x" aria-label={t.tour.close} onClick={tour.close}>✕</button>;
  let body;
  if (away) {
    body = <><span>{t.tour.stepOf((stepNo < 0 ? CORE.length : stepNo) + 1, CORE.length)}</span>
      <button type="button" className="btn" onClick={() => onTab('eval')}>{t.tour.backToEval}</button>{closeBtn}</>;
  } else if (run.phase.kind === 'choose') {
    body = <><p className="tour-t">{t.tour.choose}</p>
      <div className="tour-b">
        <button type="button" className="btn primary" onClick={() => tour.choose(true)}>{t.tour.demo}</button>
        <button type="button" className="btn" onClick={() => tour.choose(false)}>{t.tour.own}</button>
        {closeBtn}
      </div></>;
  } else if (run.phase.kind === 'end') {
    body = run.phase.choice
      ? <><p className="tour-t">{t.tour.choice}</p>
        <div className="tour-b">
          <button type="button" className="btn primary" onClick={() => tour.finish(true)}>{t.tour.keepItem}</button>
          <button type="button" className="btn" onClick={() => tour.finish(false)}>{t.tour.restoreItem}</button>
        </div></>
      : <><p className="tour-t">{t.tour.endText(!rosterEmpty, c.narrow)}</p>
        <div className="tour-b">
          {rosterEmpty && <button type="button" className="btn primary" onClick={() => { tour.close(); onRoster(); }}>{t.ui.markChars}</button>}
          <button type="button" className={rosterEmpty ? 'btn' : 'btn primary'} onClick={tour.close}>{t.tour.done}</button>
        </div></>;
  } else if (g.overlay) {
    // окно выбора открыто: узкая плашка сверху; на примере рамка — на нужной строке окна
    body = <><span>{step!.id === 'next' ? t.tour.closeSheet : t.tour.inSheet}</span>{closeBtn}</>;
  } else {
    const last = stepNo === CORE.length - 1;
    body = <><p className="tour-k">{t.tour.stepOf(stepNo + 1, CORE.length)}</p>
      <p className="tour-t" aria-live="polite"><Rich text={t.tour.steps[step!.id](x)} /></p>
      {off && <p className="tour-off" role="status">{t.tour.off[off]}</p>}
      <div className="tour-b">
        <button type="button" className="btn" onClick={tour.advance}>{last ? t.tour.done : t.tour.next}</button>
        {closeBtn}
      </div></>;
  }

  return createPortal(
    <>
      {step && !away && demo && g.ring && (
        <div className="tour-hole" aria-hidden="true" style={pad(g.ring, 6)} />
      )}
      {step && !away && g.rings.map((r, i) => <div key={i} className="tour-ring" aria-hidden="true" style={pad(r, 4)} />)}
      <div ref={strip} className={`tour-strip tour-${side}`} style={side === 'pill' ? undefined : stripStyle} role="dialog" aria-modal="false" aria-label={t.tour.start}>
        {body}
      </div>
    </>,
    document.body,
  );
}
