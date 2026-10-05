// Карточка показа героя по ссылке (.x/0060-share-code SPEC 3.3–3.6, макет A): полоса «Показ · только просмотр» с ✕,
// шапка героя без звезды и переходов, строка билда, «Надето · N из 6», бонусы и шесть слотов — как во «Надето» на
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
import { CharHead } from '@/screens/chars/CharHead';

export function ShareCard({ code, ctx, onClose }: { code: string; ctx: Ctx; onClose: () => void }) {
  const t = useT();
  const { idx } = ctx;
  const d = useMemo(() => decodeHero(code), [code]);
  const shown = useMemo(() => (typeof d === 'string' ? null : shownStore(idx, d)), [idx, d]);
  const c = typeof d === 'string' ? undefined : idx.CHAR[d.heroId];
  const cp = c && shown ? poolView(ctx, shown.st).of(c.id) : null;
  const wv = c && shown && cp ? wornView(ctx, c, shown.st, cp) : null;
  // запись ничего не делает: карточка только показывает
  const gear: GearApi | null = shown && { store: shown.st, set: () => {}, newer: false };
  const body = d === 'broken' ? <p className="shown-msg">{t.ui.shownBroken}</p>
    : d === 'newer' ? <p className="shown-msg">{t.ui.shownNewer}</p>
      : !c || !wv || !gear ? <p className="shown-msg">{t.ui.shownNoHero}</p>
        : (
          <>
            <CharHead c={c} ctx={ctx} />
            {shown?.lost && <p className="shown-msg muted small">{t.ui.shownLost}</p>}
            <WornGear c={c} wv={wv} ctx={ctx} gear={gear} shown />
          </>
        );
  return <Sheet title={t.ui.shownStrip} className="shown" onClose={onClose}>{body}</Sheet>;
}
