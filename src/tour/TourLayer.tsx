// Слой обучения поверх страницы: рамка вокруг того, на что показывает шаг, и полоса с текстом и кнопками.
// Экран не затемняется и нажатия проходят к странице: игрок делает шаг сам. Полоса встаёт снизу (над плашкой
// вердикта) или сверху — где не закроет рамку (place.ts); пока открыто окно выбора — узкой плашкой сверху.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rich } from '../components/Rich';
import { useT } from '../i18n';
import type { Tab } from '../state/appState';
import type { Anchor } from './anchors';
import { CORE, stepText } from './core';
import { place, type Box } from './place';
import type { TourCtx } from './types';
import type { TourApi } from './useTour';

interface Rect { top: number; left: number; width: number; height: number }
interface Geom { ring: Rect | null; overlay: boolean; bottom: number; h: number; vh: number }

const visible = (el: Element) => el.getClientRects().length > 0;

// рамка вокруг всех якорей шага: у каждого имени — первый видимый элемент
function measure(names: Anchor[]): Rect | null {
  const rects = names.flatMap((n) => {
    const el = [...document.querySelectorAll(`[data-tour="${n}"]`)].find(visible);
    return el ? [el.getBoundingClientRect()] : [];
  });
  if (!rects.length) return null;
  const top = Math.min(...rects.map((r) => r.top)), left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom)), right = Math.max(...rects.map((r) => r.right));
  return { top, left, width: right - left, height: bottom - top };
}

const firstAnchor = (names: Anchor[]) => names.map((n) => [...document.querySelectorAll(`[data-tour="${n}"]`)].find(visible)).find(Boolean);

export function TourLayer({ tour, c, rosterEmpty, onTab, onRoster }: {
  tour: TourApi; c: TourCtx; rosterEmpty: boolean; onTab: (t: Tab) => void; onRoster: () => void;
}) {
  const t = useT();
  const run = tour.run;
  const strip = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Geom>({ ring: null, overlay: false, bottom: 0, h: 0, vh: 0 });
  const step = run?.phase.kind === 'step' ? CORE[run.phase.i] : null;
  const names = step ? step.at(c) : [];
  const key = names.join(',');

  // положение меняется от прокрутки, поворота, окон и самой страницы — меряем каждый кадр, пока идёт тур
  useEffect(() => {
    if (!run) return;
    let id = 0, last = '';
    const tick = () => {
      const b = document.body.classList;
      const vbar = document.getElementById('vbar');
      const next: Geom = {
        ring: measure(key ? (key.split(',') as Anchor[]) : []),
        overlay: b.contains('drawer-lock') || b.contains('sheet-open'),
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
  }, [run !== null, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // новый шаг: прокрутить к нему, если он за краем экрана или под плашкой вердикта
  const stepNo = run?.phase.kind === 'step' ? run.phase.i : -1;
  useLayoutEffect(() => {
    if (stepNo < 0) return;
    const el = firstAnchor(CORE[stepNo].at(c));
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottom = document.getElementById('vbar')?.getBoundingClientRect().top ?? window.innerHeight;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (r.top < 0 || r.bottom > bottom) el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }, [stepNo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const x = stepText(c, run.demo);
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
    body = <><span>{step!.id === 'next' ? t.tour.closeSheet : t.tour.inSheet}</span>{closeBtn}</>;
  } else {
    const last = stepNo === CORE.length - 1;
    body = <><p className="tour-k">{t.tour.stepOf(stepNo + 1, CORE.length)}</p>
      <p className="tour-t" aria-live="polite"><Rich text={t.tour.steps[step!.id](x)} /></p>
      <div className="tour-b">
        <button type="button" className="btn" onClick={tour.advance}>{last ? t.tour.done : t.tour.next}</button>
        {closeBtn}
      </div></>;
  }

  return createPortal(
    <>
      {step && g.ring && !g.overlay && !away && (
        <div className="tour-ring" aria-hidden="true"
          style={{ top: g.ring.top - 4, left: g.ring.left - 4, width: g.ring.width + 8, height: g.ring.height + 8 }} />
      )}
      <div ref={strip} className={`tour-strip tour-${side}`} style={side === 'pill' ? undefined : stripStyle} role="dialog" aria-modal="false" aria-label={t.tour.start}>
        {body}
      </div>
    </>,
    document.body,
  );
}
