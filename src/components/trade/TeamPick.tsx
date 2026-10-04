// Команда обмена — четыре места ромбом, как в игре (R4.2, R10.3). Пустое место — «+»: нажатие открывает выбор героя под
// ромбом. У члена — портрет и имя (✕ убирает из команды), мерило «сменить ▾» (шторка «Билд для X») и булавка «Не отдавать
// надетое» (у героя без вещей её нет, R3.4). Выбор героя, запись мерила и закрепления — у TradeSheet.
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { isPinned, type GearStore } from '../../logic/gear';
import { Icon, Img } from '../Img';

export function TeamPick({ team, ctx, st, place, gaugeName, onPlace, onRemove, onAim, onPin }: {
  team: readonly (string | null)[]; ctx: Ctx; st: GearStore; place: number | null; gaugeName: (id: string) => string;
  onPlace: (i: number) => void; onRemove: (i: number) => void; onAim: (id: string) => void; onPin: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="team">
      {team.map((id, i) => {
        const c = id ? ctx.idx.CHAR[id] : null;
        if (!id || !c) {
          return (
            <div key={i} className={`team-p team-${i}`}>
              <button type="button" className="team-add" aria-pressed={place === i} aria-label={t.trade.addMember} onClick={() => onPlace(i)}>+</button>
            </div>
          );
        }
        const pinned = isPinned(st, id);
        return (
          <div key={i} className={`team-p team-${i}`}>
            <button type="button" className="team-face" aria-pressed={place === i} onClick={() => onPlace(i)}>
              <Img k={'face:' + c.icon} className="face" />
              <span className="team-n">{c.name}</span>
            </button>
            <button type="button" className="team-x tour-x" aria-label={t.trade.removeMember(c.name)} onClick={() => onRemove(i)}>✕</button>
            <button type="button" className="linkbtn small team-g" onClick={() => onAim(id)}>{gaugeName(id)} ▾</button>
            {st.pools[id]?.length ? (
              <button type="button" className="team-pin" aria-pressed={pinned} aria-label={t.trade.pin} title={t.trade.pin} onClick={() => onPin(id)}>
                <Icon name="pin" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
