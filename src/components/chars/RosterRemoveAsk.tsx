// Окно снятия звезды (Р16: вещи есть только у героев ростера): у героя есть вещи — «Убрать X из ростера? Вещи X (n)
// уберутся из приложения». «Да» — герой из ростера, его вещи — из его пула (App, logic/gear dropChar), сообщение с
// «Вернуть»; «Отмена» и закрытие — ничего не меняют. Без вещей звезда снимается сразу, без окна.
import { useT } from '../../i18n';
import { Sheet } from '../Sheet';

export function RosterRemoveAsk({ name, n, onYes, onClose }: { name: string; n: number; onYes: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet title={t.ui.rosterRemoveTitle(name)} onClose={onClose} className="ask">
      <div className="twin roster-ask">
        <p>{t.ui.rosterRemoveText(name, n)}</p>
        <div className="piece-act twin-act">
          <button type="button" className="btn primary" onClick={onYes}>{t.ui.rosterRemoveYes}</button>
          <button type="button" className="btn" onClick={onClose}>{t.ui.cancel}</button>
        </div>
      </div>
    </Sheet>
  );
}
