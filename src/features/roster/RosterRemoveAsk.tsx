// Окно снятия звезды (Р16: вещи есть только у героев ростера): у героя есть вещи — «Убрать X из ростера? Вещи X (n)
// уберутся из приложения». «Да» — герой из ростера, его вещи — из его пула (App, features/gear/model/gear dropChar), сообщение с
// «Вернуть»; «Отмена» и закрытие — ничего не меняют. Без вещей звезда снимается сразу, без окна.
import { useT } from '@/i18n';
import { AskSheet } from '@/shared/ui/AskSheet';

export function RosterRemoveAsk({ name, n, onYes, onClose }: { name: string; n: number; onYes: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <AskSheet kind="roster-ask" onYes={onYes} onClose={onClose}
      title={t.ui.rosterRemoveTitle(name)} text={t.ui.rosterRemoveText(name, n)} yes={t.ui.rosterRemoveYes} />
  );
}
