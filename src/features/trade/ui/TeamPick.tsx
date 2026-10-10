// Команда обмена — четыре места ромбом, как в игре (R4.2, R10.3). Пустое место — «+»: нажатие открывает выбор героя под
// ромбом. Член — плитка как в списке персонажей (CharTile): нажатие — выбор на его место (там же «Убрать из команды»,
// TradeSheet); под плиткой — его заказ «По статам ▾» (шторка OrderSheet). Выбор героя и заказа — у TradeSheet.
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { CharTile } from '@/features/roster/CharTile';
import { OrderButton } from './OrderSheet';

export function TeamPick({ team, ctx, st, place, orderName, onPlace, onOrder }: {
  team: readonly (string | null)[]; ctx: Ctx; st: GearStore; place: number | null; orderName: (id: string) => string;
  onPlace: (i: number) => void; onOrder: (id: string) => void;
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
        const n = st.pools[id]?.length ?? 0;
        return (
          <div key={i} className={`team-p team-${i}`}>
            <CharTile c={c} selected={place === i} isNew={ctx.idx.NEW.has(id)} gear={n || undefined} off={false} onSelect={() => onPlace(i)} corner={null} />
            <OrderButton name={orderName(id)} short onClick={() => onOrder(id)} />
          </div>
        );
      })}
    </div>
  );
}
