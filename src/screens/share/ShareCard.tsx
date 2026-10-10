// Карточка показа героя по ссылке (DEVELOPMENT.md "features/worn", макет A): полоса «Показ · только просмотр» с ✕,
// шапка героя без звезды и переходов, закреплённый набор, «Надето · N из 6», бонусы и шесть слотов — как во «Надето» на
// хранилище из кода (features/worn/share shownStore). Ничего не нажимается, кроме ✕ и «outerpedia ↗»; хранилище, ростер,
// форма и сохранённое состояние страницы не меняются. Подсветка сабстатов — по настройкам смотрящего (ctx).
import { useMemo } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { poolView } from '@/features/gear/pool';
import type { GearApi } from '@/features/gear/store/useGear';
import { decodeHero } from '@/features/gear/store/heroCode';
import { shownStore } from '@/features/worn/share';
import { wornView } from '@/features/worn/wearing';
import { WornGear } from '@/features/worn/WornGear';
import { Sheet } from '@/shared/ui/Sheet';
import { comboText } from '@/game/build/builds';
import { CharHead } from '@/screens/chars/CharHead';

export function ShareCard({ code, ctx, onClose }: { code: string; ctx: Ctx; onClose: () => void }) {
  const t = useT();
  const { idx } = ctx;
  const d = useMemo(() => decodeHero(code), [code]);
  const shown = useMemo(() => (typeof d === 'string' ? null : shownStore(idx, d)), [idx, d]);
  const c = typeof d === 'string' ? undefined : idx.CHAR[d.heroId];
  const hp = c && shown ? poolView(ctx, shown).hero(c.id) : null;
  const wv = c && shown ? wornView(ctx, c, shown, hp) : null;
  // запись ничего не делает: карточка только показывает
  const gear: GearApi | null = shown && { store: shown, set: () => {}, newer: false };
  const pin = hp?.P.pin;
  const body = d === 'broken' ? <p className="shown-msg">{t.ui.shownBroken}</p>
    : d === 'newer' ? <p className="shown-msg">{t.ui.shownNewer}</p>
      : !c || !wv || !gear ? <p className="shown-msg">{t.ui.shownNoHero}</p>
        : (
          <>
            <CharHead c={c} ctx={ctx} />
            <WornGear c={c} wv={wv} ctx={ctx} gear={gear} shown pinned={pin ? comboText(idx, pin.combo) : null} />
          </>
        );
  return <Sheet title={t.ui.shownStrip} className="shown" onClose={onClose}>{body}</Sheet>;
}
