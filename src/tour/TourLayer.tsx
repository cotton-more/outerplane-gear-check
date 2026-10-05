// Слой обучения поверх страницы: рамка вокруг того, на что показывает шаг, и полоса с текстом и кнопками.
// Нажатия проходят к странице: игрок делает шаг сам. Полоса встаёт снизу (над плашкой
// вердикта) или сверху — где не закроет рамку (place.ts); пока открыто окно выбора — узкой плашкой сверху.
// На примере рамки показывают точные кнопки, а остальное приглушено — но нажимается: ошибку можно поправить.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Rich } from '@/shared/ui/Rich';
import { useT } from '@/i18n';
import type { Tab } from '@/shared/tab';
import { pinSelector, type Anchor } from './anchors';
import { cardOpen, freeBottom, overlayOpen, pad, rect, targets, union, type Geom, type Rect } from './dom';
import { stepText } from './core';
import { place, type Box } from './place';
import type { TourCtx, TourId } from './types';
import { stepsOf, type TourApi } from './useTour';

// На примере всё, кроме нужных кнопок, приглушено: маска с окном на каждую цель (одно общее окно открывало бы и
// соседние кнопки). Нажатия проходят — слой pointer-events: none
function Dim({ rings, vw }: { rings: Rect[]; vw: number }) {
  return (
    <svg className="tour-dim" aria-hidden="true">
      <defs>
        <mask id="tour-dim-mask">
          <rect width="100%" height="100%" fill="white" />
          {rings.map((r, i) => { const p = pad(r, 6, vw); return <rect key={i} x={p.left} y={p.top} width={p.width} height={p.height} rx="10" fill="black" />; })}
        </mask>
      </defs>
      <rect width="100%" height="100%" mask="url(#tour-dim-mask)" />
    </svg>
  );
}

// tours — какие туры предложить в «Какое обучение?»
export function TourLayer({ tour, c, rosterEmpty, tours, onTab, onRoster }: {
  tour: TourApi; c: TourCtx; rosterEmpty: boolean; tours: TourId[]; onTab: (t: Tab) => void; onRoster: () => void;
}) {
  const t = useT();
  const run = tour.run;
  const strip = useRef<HTMLDivElement>(null);
  const [g, setG] = useState<Geom>({ rings: [], ring: null, overlay: false, card: false, bottom: 0, h: 0, vw: 0, vh: 0 });
  const steps = run ? stepsOf(run.id) : [];
  const step = run?.phase.kind === 'step' ? steps[run.phase.i] : null;
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
      const overlay = overlayOpen();
      const rings = targets(selsRef.current, overlay).map((el) => rect(el.getBoundingClientRect()));
      const next: Geom = {
        rings,
        ring: union(rings),
        overlay,
        card: cardOpen(),
        bottom: freeBottom(),
        h: strip.current?.offsetHeight ?? 0,
        vw: window.innerWidth,
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
    // цель может быть и в окне (карточка персонажа во весь экран, шторка): класс окна на body ставится чуть позже
    const el = targets(selsRef.current, true)[0] ?? targets(selsRef.current, false)[0];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottom = freeBottom();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // в карточке и шторке (layer) — к верху: низ низкого экрана остаётся полосе (над «← К списку» — scroll-margin);
    // шаг, который может идти и в шторке, на самой странице прокручивается как обычно
    const top = step?.layer === 'card' || (step?.layer === 'sheet' && !!el.closest('.drawer'));
    if (r.top < 0 || r.bottom > bottom) el.scrollIntoView({ block: top ? 'start' : 'center', behavior: still ? 'auto' : 'smooth' });
  }, [stepNo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run) return null;
  const x = stepText(c, run.demo);
  const off = step && demo ? step.off?.(c) ?? null : null;
  // не на вкладке шага (у главного тура — «Оценка») — плашка «← К обучению»; выбор тура — на любой вкладке
  const home = step?.home ?? 'eval';
  const away = (run.phase.kind === 'choose' || step !== null) && c.s.tab !== home;
  const box: Box | null = g.ring && { top: g.ring.top, bottom: g.ring.top + g.ring.height };
  // Вне шага или при открытом окне — узкая плашка: сверху, а над карточкой персонажа во весь экран — снизу (сверху
  // её кнопка «← К списку»). Шаг в карточке или в шторке (layer) — обычная полоса. Цель выше свободного места (вердикт
  // колонкой на ПК) — обычная полоса снизу, поверх низа цели
  const pill = away || (g.overlay && !step?.layer);
  const side = pill ? (g.card ? 'pill-low' : 'pill') : place(box, 0, g.bottom || g.vh, g.h) === 'top' ? 'top' : 'bottom';
  const above = { bottom: Math.max(0, g.vh - (g.bottom || g.vh)) };
  const stripStyle = side === 'bottom' || side === 'pill-low' ? above : side === 'top' ? { top: 0 } : undefined;

  const closeBtn = <button type="button" className="tour-x" aria-label={t.tour.close} onClick={tour.close}>✕</button>;
  let body;
  if (away) {
    body = <><span>{stepNo < 0 ? t.tour.start : t.tour.stepOf(stepNo + 1, steps.length)}</span>
      <button type="button" className="btn" onClick={() => onTab(home)}>{t.tour.backToEval}</button>{closeBtn}</>;
  } else if (run.phase.kind === 'pick') {
    body = <><p className="tour-t">{t.tour.pick}</p>
      <div className="tour-b">
        {tours.map((id) => (
          <button key={id} type="button" className={id === 'core' ? 'btn primary' : 'btn'} onClick={() => tour.pick(id)}>{t.tour.tours[id]}</button>
        ))}
        {closeBtn}
      </div></>;
  } else if (run.phase.kind === 'choose') {
    body = <><p className="tour-t">{t.tour.choose}</p>
      <div className="tour-b">
        <button type="button" className="btn primary" onClick={() => tour.choose(true)}>{t.tour.demo}</button>
        <button type="button" className="btn" onClick={() => tour.choose(false)}>{t.tour.own}</button>
        {closeBtn}
      </div></>;
  } else if (run.phase.kind === 'end') {
    body = run.id === 'gear'
      ? <><p className="tour-t">{t.tour.gearEnd(c.narrow)}</p>
        <div className="tour-b"><button type="button" className="btn primary" onClick={tour.close}>{t.tour.done}</button></div></>
      : run.phase.choice
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
  } else if (g.overlay && !step?.layer) {
    // окно выбора открыто: узкая плашка сверху; на примере рамка — на нужной строке окна
    body = <><span>{step!.id === 'next' ? t.tour.closeSheet : t.tour.inSheet}</span>{closeBtn}</>;
  } else {
    const last = stepNo === steps.length - 1;
    body = <><p className="tour-k">{run.id === 'core' ? t.tour.stepOf(stepNo + 1, steps.length) : t.tour.gearStepOf(stepNo + 1, steps.length)}</p>
      <p className="tour-t" aria-live="polite"><Rich text={t.tour.steps[step!.id](x)} /></p>
      {off && <p className="tour-off" role="status">{t.tour.off[off]}</p>}
      <div className="tour-b">
        <button type="button" className="btn" onClick={tour.advance}>{last ? t.tour.done : t.tour.next}</button>
        {closeBtn}
      </div></>;
  }

  return createPortal(
    <>
      {step && !away && demo && g.rings.length > 0 && <Dim rings={g.rings} vw={g.vw} />}
      {step && !away && g.rings.map((r, i) => <div key={i} className="tour-ring" aria-hidden="true" style={pad(r, 4, g.vw)} />)}
      <div ref={strip} key={`${run.phase.kind}-${stepNo}-${pill}`} className={`tour-strip tour-${side === 'pill-low' ? 'pill low' : side}`} style={stripStyle} role="dialog" aria-modal="false" aria-label={t.tour.start}>
        {body}
      </div>
    </>,
    document.body,
  );
}
