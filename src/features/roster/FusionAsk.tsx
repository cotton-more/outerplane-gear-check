// Окно перехода Core Fusion (features/roster/fusion): звезда, «Надеть» или оценка для Core Fusion X, когда есть X («Отметить Core
// Fusion X?»), или на X, когда есть Core Fusion X («Вернуться к X?»). «Да» — вещи и ростер переходят (App), «Отмена» и
// закрытие — ничего не меняют. base — имя обычного героя, n — сколько вещей перейдёт.
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';

export function FusionAsk({ base, toFusion, n, onYes, onClose }: {
  base: string; toFusion: boolean; n: number; onYes: () => void; onClose: () => void;
}) {
  const t = useT();
  return (
    <Sheet title={toFusion ? t.ui.fuseAskTitle(base) : t.ui.unfuseAskTitle(base)} onClose={onClose} className="ask">
      <div className="twin fusion-ask">
        <p>{toFusion ? t.ui.fuseAskText(base, n) : t.ui.unfuseAskText(base, n)}</p>
        <div className="piece-act twin-act">
          <button type="button" className="btn primary" onClick={onYes}>{toFusion ? t.ui.fuseAskYes(base) : t.ui.unfuseAskYes(base)}</button>
          <button type="button" className="btn" onClick={onClose}>{t.ui.cancel}</button>
        </div>
      </div>
    </Sheet>
  );
}
