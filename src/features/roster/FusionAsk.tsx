// Окно перехода Core Fusion (features/gear/model/fusion): звезда, «Надеть» или оценка для Core Fusion X, когда есть X («Отметить Core
// Fusion X?»), или на X, когда есть Core Fusion X («Вернуться к X?»). «Да» — вещи и ростер переходят (App), «Отмена» и
// закрытие — ничего не меняют. base — имя обычного героя, n — сколько вещей перейдёт.
import { useT } from '@/i18n';
import { AskSheet } from '@/shared/ui/AskSheet';

export function FusionAsk({ base, toFusion, n, onYes, onClose }: {
  base: string; toFusion: boolean; n: number; onYes: () => void; onClose: () => void;
}) {
  const t = useT();
  return (
    <AskSheet kind="fusion-ask" onYes={onYes} onClose={onClose}
      title={toFusion ? t.ui.fuseAskTitle(base) : t.ui.unfuseAskTitle(base)}
      text={toFusion ? t.ui.fuseAskText(base, n) : t.ui.unfuseAskText(base, n)}
      yes={toFusion ? t.ui.fuseAskYes(base) : t.ui.unfuseAskYes(base)} />
  );
}
