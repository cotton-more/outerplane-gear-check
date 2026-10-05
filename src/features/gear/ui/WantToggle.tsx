// «Собираю» у варианта билда и строка «почему» рядом (pieceText wantWhy): в карточке билда и в окне связок.
import { useT } from '@/i18n';

export function WantToggle({ on, why, onToggle }: { on: boolean; why: string; onToggle: () => void }) {
  const t = useT();
  return (
    <>
      <button type="button" className="want-btn" aria-pressed={on} onClick={onToggle}>{t.ui.filling}</button>
      <span className="muted small">{why}</span>
    </>
  );
}
