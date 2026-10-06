// Чип героя по вещи с формы («статы + сеты»): «▲ +2,5 очк.» — она ему «Надень», «держи» — «Оставь»; подпись кнопки
// «Надеть на X» / «Заменить шлем X». Карточка вердикта, «Сейчас на персонажах», «Кому надеть?».
import { useT, type Texts } from '@/i18n';
import type { CharVs } from '@/features/gear/model/poolVs';
import { Icon } from '@/game/icons/Img';

// прирост, который стоит назвать: от сотой очка (ранг оружия бывает и при V ниже — тогда числа нет)
export const gainOf = (x: CharVs): number | null => (x.h.dV >= 0.005 ? x.h.dV : null);

// слова чипа, как их прочтёт диктор; null — чипа нет
export function chipLabel(t: Texts, x: CharVs): string | null {
  const g = gainOf(x);
  if (x.h.kind === 'keep') return t.fit.chipKeep;
  if (g !== null) return t.fit.chipGain(t.fit.pts(g));
  return x.h.kind === 'wear' && x.h.rankUp ? t.fit.chipRank(x.slot) : null;
}

export function VsChip({ x }: { x: CharVs }) {
  const t = useT();
  const label = chipLabel(t, x);
  if (!label) return null;
  if (x.h.kind === 'keep') return <span className="vs fill">{label}</span>;
  return <span className="vs up"><Icon name="trending-up" />{label}</span>;
}

// что сделает кнопка: заменить, если «Надеть» уберёт вещь её слота (poolVs replaces), иначе — надеть; на форме нажата
// «T4» — «· T4» в конце (В4: видно, с каким Breakthrough вещь ляжет в пул)
export const equipLabel = (t: Texts, x: CharVs, slot: string, t4 = false) =>
  (x.replaces ? t.ui.replaceOn(slot, x.c.name) : t.ui.equipTo(x.c.name)) + (t4 ? t.ui.withT4 : '');
