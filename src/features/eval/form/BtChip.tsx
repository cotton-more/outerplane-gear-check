import { useLayoutEffect, useRef } from 'react';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import type { Bt } from '@/game/item/item';

const LEVELS: readonly Bt[] = [0, 1, 2, 3, 4];

// Breakthrough of the piece, exactly T0–T4 (HISTORY.md 0270; before it — one «T4» toggle): five segments in the pill
// of the star controls (.lv-pill / .lv-seg of chars.css). A fresh drop is T0. A raised plate fills the pill like a bar from the «T»
// mark up to the chosen level (owner 2026-11-22): T2 lights «T 0 1 2». У брони — рядом с сетом: бонус сета считается
// как у T4; у оружия и аксессуара — рядом с main во втором ряду формы (owner 2026-11-22): сета нет, на T4 такие же ей в Breakthrough больше
// не нужны (features/gear/verdict). armor — какая подсказка.
// value null — «T?»: an old record (below T4 by the old toggle, or before it); no segment pressed until the player taps one.
// Тот же ряд — в карточке вещи персонажа (screens/chars PieceSheet); там anchor = false: якорь «bt» — только у формы
export function BtChip({ value, onPick, armor, anchor = true }: { value: Bt | null; onPick: (bt: Bt) => void; armor: boolean; anchor?: boolean }) {
  const t = useT();
  // the plate is one layer under the digits (owner 2026-11-22: animate a change of T): --fill is where the chosen digit
  // ends, measured — the label and digits differ in width and stretch in a narrow row; it slides there (motion.css)
  const track = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const place = () => {
      const on = el.querySelector<HTMLElement>('.lv-seg.on');
      el.style.setProperty('--fill', on ? `${on.offsetLeft + on.offsetWidth}px` : '0px');
    };
    place();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [value]);
  return (
    <div className={value === null ? 'lv-pill btseg unknown' : 'lv-pill btseg'} role="group" aria-label={t.ui.btGroup}
      title={value === null ? t.ui.btUnknown : armor ? t.ui.btTitle : t.ui.btTitleItem} {...(anchor ? tour('bt') : {})}>
      <div ref={track} className="btseg-track">
        <span className="btseg-plate" aria-hidden="true" />
        <span className={value === null ? 'btseg-t' : 'btseg-t fill'} aria-hidden="true">{value === null ? 'T?' : 'T'}</span>
        {LEVELS.map((n) => (
          <button key={n} type="button" className={value === n ? 'lv-seg fill on' : value !== null && n < value ? 'lv-seg fill' : 'lv-seg'} aria-pressed={value === n} aria-label={'T' + n} onClick={() => onPick(n)}>{n}</button>
        ))}
      </div>
    </div>
  );
}
