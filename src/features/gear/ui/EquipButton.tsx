// Кнопка «Надеть на X» / «Заменить шлем X» — то, что сделает «Надеть» (poolVs replaces); под карточкой вердикта и в
// «Сейчас на персонажах». good — исход держит штамп (вещь герою нужна): кнопка выделена. place — класс места.
import { useT } from '@/i18n';
import type { CharVs } from '@/features/gear/model/poolVs';
import { Icon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';
import { equipLabel } from './VsChip';

export function EquipButton({ x, slot, t4, good, place, onEquip }: {
  x: CharVs; slot: string; t4: boolean; good: boolean; place: string; onEquip: (x: CharVs) => void;
}) {
  const t = useT();
  return (
    <button type="button" className={`btn ${place}${good ? ' good' : ''}`} onClick={() => onEquip(x)} {...tour('gequip')}>
      <Icon name={x.replaces ? 'replace' : 'check'} />{equipLabel(t, x, slot, t4)}
    </button>
  );
}
