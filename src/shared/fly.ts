// A flight: copies of elements fly from where they were to where the thing they became now is, and fade there
// (motion.css .ghost). takeOff copies them and their places before the page changes; land, after the render, sends each
// copy to its target (fewer targets — the rest go to the last one). fold — a removed element's copy folds up where it was;
// slide — elements that moved come from their old places, at the same time. «Уменьшить движение» — none of it.

export interface Leg { copy: HTMLElement; at: DOMRect }

export function takeOff(els: Iterable<Element>): Leg[] {
  return [...els].map((el) => {
    const copy = el.cloneNode(true) as HTMLElement;
    // sizes that came from the place (.subrow …) — frozen, the copy flies outside it
    const from = el.querySelectorAll('img, .ico, .noimg');
    copy.querySelectorAll<HTMLElement>('img, .ico, .noimg').forEach((x, i) => {
      const r = from[i]?.getBoundingClientRect();
      if (r) { x.style.width = `${r.width}px`; x.style.height = `${r.height}px`; }
    });
    return { copy, at: el.getBoundingClientRect() };
  });
}

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function land(legs: readonly Leg[], to: readonly Element[]): void {
  if (!to.length || still()) return;
  legs.forEach(({ copy, at }, i) => {
    const r = to[Math.min(i, to.length - 1)].getBoundingClientRect();
    copy.style.setProperty('--dx', `${r.left + r.width / 2 - (at.left + at.width / 2)}px`);
    copy.style.setProperty('--dy', `${r.top + r.height / 2 - (at.top + at.height / 2)}px`);
    copy.style.setProperty('--s', String(Math.min(1, r.height / at.height)));
    play(copy, at, 'fly');
  });
}

// host — where the copy goes: inside the same container its styles depend on (.batch .bgear-row)
export function fold(legs: readonly Leg[], host: Element = document.body): void {
  if (!still()) legs.forEach(({ copy, at }) => play(copy, at, 'fold', host));
}

// tops — where each element's top was before; the element now starts there and moves to its place
export function slide(els: readonly Element[], tops: readonly number[]): void {
  if (still()) return;
  els.forEach((el, i) => {
    const dy = tops[i] - el.getBoundingClientRect().top;
    if (!dy || !(el instanceof HTMLElement)) return;
    el.classList.remove('slide');
    void el.offsetWidth; // the same element may still be sliding: start it again
    el.style.setProperty('--fy', `${dy}px`);
    el.classList.add('slide');
    el.addEventListener('animationend', () => el.classList.remove('slide'), { once: true });
  });
}

function play(copy: HTMLElement, at: DOMRect, cls: string, host: Element = document.body) {
  Object.assign(copy.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px` });
  copy.classList.add('ghost', cls);
  copy.setAttribute('aria-hidden', 'true');
  for (const x of [copy, ...copy.querySelectorAll('[id], [data-tour], [data-tour-item]')]) ['id', 'data-tour', 'data-tour-item'].forEach((a) => x.removeAttribute(a));
  const done = () => copy.remove();
  copy.addEventListener('animationend', done, { once: true });
  setTimeout(done, 600); // a tab in the background doesn't play it
  // inside a host — on its place in the host (.ghost.in: absolute; the host is positioned): scrolls with it
  if (host !== document.body) {
    const h = host.getBoundingClientRect();
    Object.assign(copy.style, { left: `${at.left - h.left}px`, top: `${at.top - h.top}px` });
    copy.classList.add('in');
  }
  host.append(copy);
}
