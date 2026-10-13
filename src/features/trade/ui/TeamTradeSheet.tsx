// «Обмен для команды» (.x/0200-boss E2, owner 2026-10-13): the team trade, opened by «Подобрать вещи» on «Команда» for
// its 2–4 heroes with builds (model/team teamOk). The calculation starts at once (runTeam in chunks: «Считаю…» and
// «Отмена» — closes the window); the plan is a walk (TradeWalk, MODEL.md §7 item 9; E2b): the members, then «В конце —
// замены» (others' holes filled by the members' old pieces, parking). Each member's order (build) comes from «Команда»,
// where it is kept with the team; changing it here goes back there (onOrder) and the plan is counted again. «Оставить как
// было» — counted again. Worn gear is what the app records now (never kept with the team). «Сделал» — one record
// (model/apply applyWalk), App shows the message with «Вернуть» (onApplied). The walk's decisions and ticks stay on the
// device until «Сделал» / «Отмена» (useWalk, 'ogc.trade'); ✕ keeps them for the same team.
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import type { GearApi } from '@/features/gear/store/useGear';
import { pinOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { applyWalk, stampOf } from '../model/apply';
import { slotKey, type World } from '../model/model';
import { targetOf } from '../model/stored';
import { runTeam, type TeamPlan } from '../model/team';
import { STATS, worldOf } from '../model/world';
import type { EffGoal, SpdGoal } from '../model/goal';
import { Sheet } from '@/shared/ui/Sheet';
import { TradeWalk } from './TradeWalk';
import { EntrySheet } from './EntrySheet';
import { OrderSheet, orderName } from './OrderSheet';
import { useOutcome, useWalk } from './useWalk';

type Undo = (st: GearStore) => GearStore | null;

// the pinned set as the order's name (MODEL.md §7 item 1: a pin is the hero's order, hard); null — not pinned
export function pinnedOrder(ctx: Ctx, st: GearStore, id: string, t: ReturnType<typeof useT>): string | null {
  const c = ctx.idx.CHAR[id];
  const p = c ? pinOf(c, st.pin?.[id]) : null;
  return p ? t.card.pinned(comboText(ctx.idx, p.combo)) : null;
}

// goals — a boss on «Команда»: member → the EFF goal (MODEL.md §13; .x/0200-boss E3), spdGoals — → the SPD goal (E4); goalKey
// names its inputs (boss, stage,
// members and their ★) — the world is counted again and the walk is another one when it changes (owner Q7)
export function TeamTradeSheet({ ctx, gear, roster, team, orders, goals, spdGoals, goalKey = '', onOrder, onApplied, onClose }: {
  ctx: Ctx; gear: GearApi; roster: readonly string[]; team: readonly string[]; orders: Readonly<Record<string, string>>;
  goals?: Readonly<Record<string, EffGoal>>; spdGoals?: Readonly<Record<string, SpdGoal>>; goalKey?: string;
  onOrder: (id: string, order: string) => void; onApplied: (text: string, undo: Undo) => void; onClose: () => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const [stale, setStale] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  const world = useMemo(() => worldOf(ctx, st, roster, { orders, goals, spd: spdGoals }), [ctx, st, roster, orders, goalKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stamp = useMemo(() => stampOf(st), [st]);
  const teamKey = team.join();
  const walk = useWalk(targetOf(team, true) + (goalKey ? `|${goalKey}` : ''), idx);
  const [tp, setTp] = useState<{ w: World; frozen: ReadonlySet<string>; tp: TeamPlan } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    runTeam(world, { team, frozen: walk.frozen }, ac.signal).then((x) => {
      if (x && !ac.signal.aborted) setTp({ w: world, frozen: walk.frozen, tp: x });
    }).catch((e) => console.error(e));
    return () => ac.abort();
  }, [teamKey, world, walk.frozen]); // eslint-disable-line react-hooks/exhaustive-deps
  // a plan for another world or other declines is not shown (counted again)
  const cur = tp && tp.w === world && tp.frozen === walk.frozen ? tp.tp : null;
  const res = useOutcome(world, cur?.steps ?? null, cur?.order ?? team, team, walk.d, walk.mark);
  const missing = useMemo(() => Object.fromEntries((cur?.members ?? []).map((m) => [m.to, m.missing])), [cur]);

  const done = () => {
    if (!res || res.left) return;
    const r = applyWalk(st, { steps: res.o.steps, ends: res.o.ends, entered: res.entered }, stamp);
    if (!r) { setStale(true); return; }
    walk.clear();
    if (r.st !== st) { gear.set(r.st); onApplied(t.trade.savedTeam, r.undo); }
    onClose();
  };
  const cancel = () => { walk.clear(); onClose(); };
  const orderOf = (id: string) => orders[id] ?? STATS;
  const nameOfOrder = (id: string) => pinnedOrder(ctx, st, id, t) ?? orderName(ctx, idx.CHAR[id], orderOf(id), t.ui.byStats);
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;
  const entry = walk.entry;

  return (
    <Sheet title={t.trade.teamOpen} onClose={onClose} className="trade">
      <div className="trade-b">
        {!res && (
          <p className="trade-busy" role="status">
            <span>{t.trade.counting}</span>
            <button type="button" className="btn" onClick={onClose}>{t.trade.cancel}</button>
          </p>
        )}
        {res && (
          <TradeWalk ctx={ctx} st={st} walk={res.o.walk} lines={res.lines} missing={missing} ticks={res.ticks} left={res.left}
            recount={res.recount} resumed={walk.resumed ? [res.done, res.total] : null} stale={stale}
            onDecide={(x) => { walk.decide(x, res.o); setStale(false); }} onDone={done} onCancel={cancel} orderName={nameOfOrder} onOrder={setOrderFor} />
        )}
      </div>
      {orderC && (
        <OrderSheet c={orderC} ctx={ctx} order={orderOf(orderC.id)} pinned={pinnedOrder(ctx, st, orderC.id, t)} onClose={() => setOrderFor(null)}
          onChoose={(o) => { onOrder(orderC.id, o); setStale(false); setOrderFor(null); }} />
      )}
      {entry && (
        <EntrySheet ctx={ctx} hero={entry.hero} slot={entry.slot} initial={walk.d.entered[slotKey(entry.hero, entry.slot)] ?? null}
          pin={st.pin?.[entry.hero]} onSave={walk.save} onClose={walk.closeEntry} />
      )}
    </Sheet>
  );
}
