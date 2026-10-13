// «Обмен для команды» (.x/0200-boss E2, owner 2026-10-13): the team trade, opened by «Подобрать вещи» on «Команда» for
// its 2–4 heroes with builds (model/team teamOk). The calculation starts at once (runTeam in chunks: «Считаю…» and
// «Отмена» — closes the window); the plan — TradePlan, only the members (owner, 2026-10-04: others' losses and holes are
// not shown). Each member's order (build) comes from «Команда», where it is kept with the team; changing it here goes back
// there (onOrder) and the plan is counted again. «Не брать» — counted again. Worn gear is what the app records now (never
// kept with the team). «Сделал» — one record (model/apply applyTeam), App shows the message with «Вернуть» (onApplied);
// pieces taken off and given to no one go to «Свободные вещи» (onClose(free), model/free).
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import type { GearApi } from '@/features/gear/store/useGear';
import { pinOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { applyTeam, stampOf } from '../model/apply';
import { skipKey } from '../model/cands';
import { freeOf, wornOf } from '../model/free';
import type { HoleFill } from '../model/holes';
import { advance } from '../model/moves';
import type { Missing } from '../model/plan';
import { runTeam, type TeamPlan } from '../model/team';
import { linesOf, type HeroLine } from '../model/view';
import { STATS, worldOf } from '../model/world';
import { Sheet } from '@/shared/ui/Sheet';
import { TradePlan } from './TradePlan';
import { OrderSheet, orderName } from './OrderSheet';

type Undo = (st: GearStore) => GearStore | null;
interface Result { tp: TeamPlan; lines: HeroLine[]; fills: HoleFill[]; missing: Record<string, Missing[]>; stamp: string; empty: boolean }

// the pinned set as the order's name (MODEL.md §7 item 1: a pin is the hero's order, hard); null — not pinned
export function pinnedOrder(ctx: Ctx, st: GearStore, id: string, t: ReturnType<typeof useT>): string | null {
  const c = ctx.idx.CHAR[id];
  const p = c ? pinOf(c, st.pin?.[id]) : null;
  return p ? t.card.pinned(comboText(ctx.idx, p.combo)) : null;
}

export function TeamTradeSheet({ ctx, gear, roster, team, orders, onOrder, onApplied, onClose }: {
  ctx: Ctx; gear: GearApi; roster: readonly string[]; team: readonly string[]; orders: Readonly<Record<string, string>>;
  onOrder: (id: string, order: string) => void; onApplied: (text: string, undo: Undo) => void; onClose: (free: string[]) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [stale, setStale] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  const [opened] = useState(() => wornOf(st)); // worn when the window opened (mounted per window)
  const free = useMemo(() => new Set(freeOf(opened, st)), [opened, st]);
  const world = useMemo(() => worldOf(ctx, st, roster, { orders, free }), [ctx, st, roster, orders, free]);
  const stamp = useMemo(() => stampOf(st), [st]);
  const [res, setRes] = useState<Result | null>(null);
  const teamKey = team.join();
  useEffect(() => {
    setRes(null);
    const ac = new AbortController();
    runTeam(world, { team, skip }, ac.signal).then((tp) => {
      if (!tp || ac.signal.aborted) return;
      const w1 = tp.steps.reduce(advance, world);
      setRes({
        tp, lines: linesOf(world, w1, tp.order, tp.moves).filter((l) => l.receiver), fills: tp.steps.flatMap((s) => s.fills),
        missing: Object.fromEntries(tp.members.map((m) => [m.to, m.missing])), stamp, empty: !tp.moves.moves.length,
      });
    }).catch((e) => console.error(e));
    return () => ac.abort();
  }, [teamKey, world, skip, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => onClose(freeOf(opened, st));
  const done = () => {
    if (!res) return;
    const r = applyTeam(st, { tp: res.tp, stamp: res.stamp });
    if (!r) { setStale(true); return; }
    if (r.st !== st) { gear.set(r.st); onApplied(t.trade.savedTeam, r.undo); }
    onClose(freeOf(opened, r.st)); // the applied store: the prop is not updated yet
  };
  const orderOf = (id: string) => orders[id] ?? STATS;
  const nameOfOrder = (id: string) => pinnedOrder(ctx, st, id, t) ?? orderName(ctx, idx.CHAR[id], orderOf(id), t.ui.byStats);
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;

  return (
    <Sheet title={t.trade.teamOpen} onClose={close} className="trade">
      <div className="trade-b">
        {!res && (
          <p className="trade-busy" role="status">
            <span>{t.trade.counting}</span>
            <button type="button" className="btn" onClick={close}>{t.trade.cancel}</button>
          </p>
        )}
        {res && (
          <TradePlan ctx={ctx} st={st} lines={res.lines} fills={res.fills} missing={res.missing} empty={res.empty} stale={stale}
            onSkip={(item, h) => { setSkip((s) => new Set([...s, skipKey(item, h)])); setStale(false); }}
            onDone={done} onCancel={close} orderName={nameOfOrder} onOrder={setOrderFor} />
        )}
      </div>
      {orderC && (
        <OrderSheet c={orderC} ctx={ctx} order={orderOf(orderC.id)} pinned={pinnedOrder(ctx, st, orderC.id, t)} onClose={() => setOrderFor(null)}
          onChoose={(o) => { onOrder(orderC.id, o); setStale(false); setOrderFor(null); }} />
      )}
    </Sheet>
  );
}
