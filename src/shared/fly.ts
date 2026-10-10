// A flight: copies of elements fly from where they were to where the thing they became now is, and fade there
// (motion.css .fly). takeOff copies them and their places before the page changes; land, after the render, sends each
// copy to its target (fewer targets — the rest go to the last one). «Уменьшить движение» — no flight.

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

export function land(legs: readonly Leg[], to: readonly Element[]): void {
  if (!legs.length || !to.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  legs.forEach(({ copy, at }, i) => {
    const r = to[Math.min(i, to.length - 1)].getBoundingClientRect();
    const s = Math.min(1, r.height / at.height);
    Object.assign(copy.style, { left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px` });
    copy.style.setProperty('--dx', `${r.left + r.width / 2 - (at.left + at.width / 2)}px`);
    copy.style.setProperty('--dy', `${r.top + r.height / 2 - (at.top + at.height / 2)}px`);
    copy.style.setProperty('--s', String(s));
    copy.classList.add('fly');
    copy.setAttribute('aria-hidden', 'true');
    for (const x of [copy, ...copy.querySelectorAll('[id], [data-tour], [data-tour-item]')]) ['id', 'data-tour', 'data-tour-item'].forEach((a) => x.removeAttribute(a));
    const done = () => copy.remove();
    copy.addEventListener('animationend', done, { once: true });
    setTimeout(done, 600); // a tab in the background doesn't play it
    document.body.append(copy);
  });
}
