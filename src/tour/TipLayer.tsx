// Подсказки по ходу: пунктирная рамка вокруг того, что объясняется, и полоса с текстом и «Понятно». Без приглушения.
// Какую показать — tips.ts (одна за раз, лимиты, пауза в нажатиях). Увиденной подсказка считается, когда её
// закрыли или нажали на то, на что она показывает; ушла сама (закрыли окно, сменили вещь) — покажется ещё.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/i18n';
import type { Anchor } from './anchors';
import { freeBottom, inView, onScreen, overlayOpen, pad, rect, targets, type Rect } from './dom';
import { place } from './place';
import { TIPS } from './registry';
import { nextTip, type TipSession } from './tips';
import type { Tip, TourCtx } from './types';
import type { TourApi } from './useTour';

// якорь подсказки на экране: видимый элемент в свободной части окна — если он за краем, полоса закрыла бы
// что-то другое (кнопку «← К списку», ✕ шторки), а рамки не было бы видно. Исключение — «Ещё» (☰ стоит на самой плашке
// вердикта): полоса встаёт над плашкой, рамка — вокруг ☰
const at = (a: Anchor) => targets([`[data-tour="${a}"]`], overlayOpen()).find((el) => inView(el) || (a === 'more' && onScreen(el)));

// forced — «Показать» в «Что нового»: эту подсказку сразу, без лимитов и условий; нет якоря на экране — просто текст
export function TipLayer({ tour, c, enabled, forced, onForced }: {
  tour: TourApi; c: TourCtx; enabled: boolean; forced: Tip | null; onForced: () => void;
}) {
  const t = useT();
  const [tip, setTip] = useState<Tip | null>(null);
  const [g, setG] = useState<{ ring: Rect | null; bar: boolean; bottom: number; h: number; vw: number; vh: number }>({ ring: null, bar: false, bottom: 0, h: 0, vw: 0, vh: 0 });
  const strip = useRef<HTMLDivElement>(null);
  const sess = useRef<TipSession>({ shown: 0, lastAt: 0 });
  const lastInput = useRef(0);
  const pinned = useRef(false); // показана по «Показать»: не гасим, пока игрок сам не закроет
  const live = useRef({ c, enabled, store: tour.store, tip, forced });
  live.current = { c, enabled, store: tour.store, tip, forced };

  // пауза в нажатиях: подсказка не выскакивает под пальцем посреди ввода
  useEffect(() => {
    const onInput = () => { lastInput.current = Date.now(); };
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
    return () => { window.removeEventListener('pointerdown', onInput, true); window.removeEventListener('keydown', onInput, true); };
  }, []);

  // раз в полсекунды: погасить подсказку, если её уже не к чему показывать, или выбрать следующую
  useEffect(() => {
    const id = setInterval(() => {
      const { c: now, enabled: on, store, tip: cur, forced: f } = live.current;
      if (f) {
        onForced();
        pinned.current = true;
        setTip(f);
        sess.current = { shown: sess.current.shown + 1, lastAt: Date.now() };
        return;
      }
      if (cur) {
        if (!on || (!pinned.current && ((cur.when && !cur.when(now)) || !at(cur.at)))) { pinned.current = false; setTip(null); }
        return;
      }
      if (!on) return;
      const next = nextTip(TIPS, store, now, sess.current, Date.now(), lastInput.current, (a) => !!at(a));
      if (next) { setTip(next); sess.current = { shown: sess.current.shown + 1, lastAt: Date.now() }; }
    }, 500);
    return () => clearInterval(id);
  }, [onForced]);

  // рамка следует за якорем; нажал на него — подсказка увидена
  useEffect(() => {
    if (!tip) return;
    let id = 0, last = '';
    const tick = () => {
      const el = at(tip.at);
      const r = el?.getBoundingClientRect();
      const next = { ring: r && r.height > 0 ? rect(r) : null, bar: !!el?.closest('#vbar'), bottom: freeBottom(), h: strip.current?.offsetHeight ?? 0, vw: window.innerWidth, vh: window.innerHeight };
      const s = JSON.stringify(next);
      if (s !== last) { last = s; setG(next); }
      id = requestAnimationFrame(tick);
    };
    tick();
    const onDown = (e: PointerEvent) => {
      if (at(tip.at)?.contains(e.target as Node)) { tour.seeTip(tip); pinned.current = false; setTip(null); }
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => { cancelAnimationFrame(id); window.removeEventListener('pointerdown', onDown, true); };
  }, [tip]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tip) return null;
  const ok = () => { tour.seeTip(tip); pinned.current = false; setTip(null); };
  const box = g.ring && { top: g.ring.top, bottom: g.ring.top + g.ring.height };
  // цель выше свободного места — полоса снизу, поверх низа цели
  // цель на плашке вердикта (☰) — полоса прямо над ней, а не наверху экрана
  const side = !g.bar && place(box, 0, g.bottom || g.vh, g.h) === 'top' ? 'top' : 'bottom';
  const style = side === 'bottom' ? { bottom: Math.max(0, g.vh - (g.bottom || g.vh)) } : { top: 0 };
  return createPortal(
    <>
      {g.ring && <div className="tour-ring tip" aria-hidden="true" style={pad(g.ring, 4, g.vw)} />}
      <div ref={strip} key={tip.id} className={`tour-strip tour-tip tour-${side}`} style={style} role="status">
        <p className="tour-t">{t.tour.tips[tip.id]}</p>
        <div className="tour-b"><button type="button" className="btn" onClick={ok}>{t.ui.gotIt}</button></div>
      </div>
    </>,
    document.body,
  );
}
