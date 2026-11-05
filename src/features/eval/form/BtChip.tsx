import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import type { Bt } from '@/game/item/item';

const LEVELS: readonly Bt[] = [0, 1, 2, 3, 4];

// Breakthrough of the piece, exactly T0–T4 (HISTORY.md 0270; before it — one «T4» toggle): five segments in the gold pill
// of the star controls (.lv-pill / .lv-seg of chars.css). A fresh drop is T0. У брони — рядом с сетом: бонус сета считается
// как у T4; у оружия и аксессуара — рядом с предметом (у Epic — с main): сета нет, на T4 такие же ей в Breakthrough больше
// не нужны (features/gear/verdict). armor — какая подсказка.
// value null — «T?»: an old record (below T4 by the old toggle, or before it); no segment pressed until the player taps one.
// Тот же ряд — в карточке вещи персонажа (screens/chars PieceSheet); там anchor = false: якорь «bt» — только у формы
export function BtChip({ value, onPick, armor, anchor = true }: { value: Bt | null; onPick: (bt: Bt) => void; armor: boolean; anchor?: boolean }) {
  const t = useT();
  return (
    <div className={value === null ? 'lv-pill btseg unknown' : 'lv-pill btseg'} role="group" aria-label={t.ui.btGroup}
      title={value === null ? t.ui.btUnknown : armor ? t.ui.btTitle : t.ui.btTitleItem} {...(anchor ? tour('bt') : {})}>
      <span className="btseg-t" aria-hidden="true">{value === null ? 'T?' : 'T'}</span>
      {LEVELS.map((n) => (
        <button key={n} type="button" className={value === n ? 'lv-seg on' : 'lv-seg'} aria-pressed={value === n} aria-label={'T' + n} onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}
