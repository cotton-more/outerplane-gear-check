// Выбранные билды героев на странице («Надето»): выбор в шторке и экран «Переодеть», сообщение «Выбрал билды по твоим
// вещам у N героев — проверь» и «Всё верно». Правила — aim.ts.
import { useEffect, useMemo, useState } from 'react';
import type { Index } from '@/game/data';
import type { Ctx } from '@/game/context';
import { heroName } from '@/game/hero/heroName';
import type { Texts } from '@/i18n';
import { isStats, type PoolView } from '@/features/gear/pool';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearMsg } from '@/features/gear/ui/gearMsg';
import { storage } from '@/shared/storage';
import type { Tab } from '@/shared/tab';
import { confirmAims, setAim, unconfirmed, undoAims } from './aim';

export function useAims({ idx, t, ctx, gear, view, touring, demo, charId, tab, say, openChar }: {
  idx: Index; t: Texts; ctx: Ctx; gear: GearApi; view: PoolView;
  touring: boolean; demo: boolean;       // обучение; тур «Экипировка» на примере
  charId: string | null; tab: Tab;       // открытый герой и вкладка
  say: (m: GearMsg) => void; openChar: (id: string) => void;
}) {
  // «Надето» (шаг 7): «Переодеть» — выбор здесь, а не в карточке: к нему ведут и «Переодеть в …» под вкладками билда, и «Билды героев». Ушли с этой
  // карточки или с вкладки — выбор снят
  const [redress, setRedress] = useState<{ charId: string; key: string } | null>(null);
  useEffect(() => { if (redress && (charId !== redress.charId || tab !== 'chars')) setRedress(null); }, [redress, charId, tab]);
  // выбор билда в шторке: запись (aim — только явно, Р17) с «Вернуть» и экран «Переодеть» на карточке героя
  const chooseAim = (id: string, key: string) => {
    const r = setAim(gear.store, id, key);
    setAimsOpen(false);
    if (r.st !== gear.store) {
      const v = view.of(id)?.variants.find((x) => x.key === key);
      gear.set(r.st);
      say({ text: t.ui.aimToast(heroName(idx, id), !v || isStats(v) ? t.ui.byStats : v.name), note: '', tab: 'chars', undo: (x) => undoAims(x, r) });
    }
    setRedress({ charId: id, key });
    openChar(id);
  };
  // сообщение «Выбрал билды по твоим вещам у N героев — проверь»: пока есть герои без выбранного билда и плашку не закрыли
  // и не нажали «Всё верно» (флаг ogc.aimsShown — не в экипировке: загрузка в ogc.gear ничего не пишет, Р17). В обучении и
  // на чужой версии экипировки — нет
  const [aimsShown, setAimsShown] = useState(() => storage.get('aimsShown', false));
  const [aimsOpen, setAimsOpen] = useState(false);
  const aimsOn = !aimsShown && !touring && !demo && !gear.newer;
  const aimsPending = useMemo(() => (aimsOn ? unconfirmed(ctx, gear.store) : []), [aimsOn, ctx, gear.store]);
  const hideAims = () => { storage.set('aimsShown', true); setAimsShown(true); };
  const confirmAll = () => {
    const r = confirmAims(ctx, gear.store, aimsPending);
    hideAims();
    setAimsOpen(false);
    if (r.st === gear.store) return;
    gear.set(r.st);
    say({ text: t.ui.aimsSaved, note: '', tab, undo: (x) => undoAims(x, r) });
  };
  // на открытом герое: выбранный «Переодеть» (ключ билда) и его смена с карточки
  const redressKey = redress?.charId === charId ? redress.key : null;
  const onRedress = (key: string | null) => setRedress(key && charId ? { charId, key } : null);
  return { redressKey, onRedress, chooseAim, aimsPending, aimsOpen, openAims: () => setAimsOpen(true), closeAims: () => setAimsOpen(false), hideAims, confirmAll };
}
