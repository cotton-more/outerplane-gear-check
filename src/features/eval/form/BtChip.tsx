import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';

// «T4» — вещь уже на Breakthrough T4. Не нажата — ниже T4 (T0–T3): свежий дроп — T0. У брони — рядом с сетом: бонус
// сета считается как у T4; у оружия и аксессуара — рядом с предметом (у Epic — с main): сета нет, такие же ей в
// Breakthrough больше не нужны (features/gear/model/material). armor — какая подсказка.
// Та же кнопка — в карточке вещи персонажа (BuildGear PieceSheet); там anchor = false: якорь «bt» — только у формы
export function BtChip({ on, onToggle, armor, anchor = true }: { on: boolean; onToggle: () => void; armor: boolean; anchor?: boolean }) {
  const t = useT();
  return (
    <button type="button" className="btchip" aria-pressed={on} aria-label={t.ui.btAria} title={armor ? t.ui.btTitle : t.ui.btTitleItem} onClick={onToggle} {...(anchor ? tour('bt') : {})}>
      {t.ui.btChip}
    </button>
  );
}
