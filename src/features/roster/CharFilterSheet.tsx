// Шторка «Фильтр» списка персонажей: стихии и классы теми же кнопками со значками и подписями; в группе выбирается одна,
// повторное нажатие снимает; «Сбросить», когда что-то выбрано. Выбор применяется сразу.
import { useT } from '@/i18n';
import { useIndex } from '@/game/data/IndexContext';
import { ClassIcon, ElementIcon } from '@/game/icons/Img';
import { FilterChips } from '@/shared/ui/FilterChips';
import { Sheet } from '@/shared/ui/Sheet';

export function CharFilterSheet({ cel, ccl, onChange, onClose }: {
  cel: string; ccl: string; onChange: (patch: { cel?: string; ccl?: string }) => void; onClose: () => void;
}) {
  const t = useT();
  const { D } = useIndex();
  return (
    <Sheet title={t.ui.filter} onClose={onClose}>
      <div className="cfilter">
        <FilterChips options={D.elements} value={cel} onChange={(v) => onChange({ cel: v })} icon={(k) => <ElementIcon el={k} />} />
        <FilterChips options={D.classes} value={ccl} onChange={(v) => onChange({ ccl: v })} icon={(k) => <ClassIcon cls={k} />} />
        {(cel || ccl) && <button type="button" className="btn" onClick={() => onChange({ cel: '', ccl: '' })}>{t.ui.filterReset}</button>}
      </div>
    </Sheet>
  );
}
