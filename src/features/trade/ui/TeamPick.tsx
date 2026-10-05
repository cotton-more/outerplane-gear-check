// Команда обмена — четыре места ромбом, как в игре (R4.2, R10.3). Пустое место — «+»: нажатие открывает выбор героя под
// ромбом. Член — плитка как в списке персонажей (CharTile): нажатие — выбор на его место (там же «Убрать из команды»,
// TradeSheet), в углу вместо звезды — булавка «Не отдавать надетое» (у героя без вещей её нет, R3.4); под плиткой — билд
// мерила «Speed ▾», как на карточке героя (шторка «Билд для X»). Выбор героя, запись мерила и закрепления — у TradeSheet.
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { isPinned, type GearStore } from '@/features/gear/model/gear';
import { AimButton } from '@/features/worn/AimSheet';
import { CharTile } from '@/features/roster/CharList';
import { Icon } from '@/game/icons/Img';

export function TeamPick({ team, ctx, st, place, gaugeName, onPlace, onAim, onPin }: {
  team: readonly (string | null)[]; ctx: Ctx; st: GearStore; place: number | null; gaugeName: (id: string) => string;
  onPlace: (i: number) => void; onAim: (id: string) => void; onPin: (id: string) => void;
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
        const n = st.pools[id]?.length ?? 0;
        return (
          <div key={i} className={`team-p team-${i}`}>
            <CharTile c={c} selected={place === i} isNew={ctx.idx.NEW.has(id)} gear={n || undefined} off={false} pinned={false} onSelect={() => onPlace(i)}
              corner={n ? (
                <button type="button" className="team-pin" aria-pressed={pinned} aria-label={t.trade.pin} title={t.trade.pin} onClick={() => onPin(id)}>
                  <Icon name="pin" />
                </button>
              ) : null} />
            <AimButton name={gaugeName(id)} aria={t.ui.wornChangeAria(c.name)} onClick={() => onAim(id)} />
          </div>
        );
      })}
    </div>
  );
}
