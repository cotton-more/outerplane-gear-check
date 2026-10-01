import { useT } from '../../i18n';
import { tour } from '../../tour/anchors';

// «T4» — вещь брони уже на Breakthrough T4: бонус сета считается как у T4. Не нажата — ниже T4 (T0–T3): свежий дроп — T0.
// Только броня: у оружия и аксессуара Breakthrough сета нет — их форма кнопку не показывает.
// Та же кнопка — в карточке вещи персонажа (BuildGear PieceSheet); там anchor = false: якорь «bt» — только у формы
export function BtChip({ on, onToggle, anchor = true }: { on: boolean; onToggle: () => void; anchor?: boolean }) {
  const t = useT();
  return (
    <button type="button" className="btchip" aria-pressed={on} aria-label={t.ui.btAria} title={t.ui.btTitle} onClick={onToggle} {...(anchor ? tour('bt') : {})}>
      {t.ui.btChip}
    </button>
  );
}
