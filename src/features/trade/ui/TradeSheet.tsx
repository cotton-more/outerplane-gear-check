// Шторка «Обмен вещами» (R4, R10.3–R10.6 — MODEL.md §10; сеанс и заказ — MODEL.md §7). Режим «Герой»:
// выбрать героя → план считается сразу; «Сделал» — и можно выбрать следующего, а надетое переодетого следующие не берут,
// пока шторка открыта (сеанс, строка о нём над выбором с «Закончить»). «Кого переодеть?» (0200 stage A, MODEL.md §7 item 8):
// by name, at each hero the gain of his plan now (counted in chunks after every «Сделал» / «Вернуть»), the re-dressed last
// with ✓, not pickable. Смена заказа — пересчёт (R7.3). The team trade lives on «Команда» (TeamTradeSheet,
// HISTORY.md 0200-boss E2, owner 2026-10-13): this sheet is the one-hero trade only — «dressing in turn».
// The plan is a walk (TradeWalk, MODEL.md §7 item 9): «Оставить как было» — counted again; its end gives every piece taken
// off an owner. «Сделал» — одна запись (features/trade/model/apply applyWalk) with the replacements, parking and entered
// pieces, сообщение с «Вернуть» — у App (onApplied). The walk's decisions and ticks stay on the device until «Сделал» /
// «Отмена» (useWalk, 'ogc.trade'); orders and the session are not stored (R4.5): closed the sheet — they are gone.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { applyWalk, stampOf, type Step } from '@/features/trade/model/apply';
import { slotKey } from '@/features/trade/model/model';
import { heroPlan } from '@/features/trade/model/plan';
import { targetOf } from '@/features/trade/model/stored';
import { STATS, worldOf } from '@/features/trade/model/world';
import { runChunks } from '@/features/trade/model/chunks';
import { turnGains, turnOrder, type Gains } from '@/features/trade/model/turn';
import type { World } from '@/features/trade/model/model';
import type { GearApi } from '@/features/gear/store/useGear';
import { Sheet } from '@/shared/ui/Sheet';
import { TradeWalk } from './TradeWalk';
import { EntrySheet } from './EntrySheet';
import { OrderSheet, orderName } from './OrderSheet';
import { useOutcome, useWalk } from './useWalk';
import { pinOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { heroName } from '@/game/hero/HeroName';
import { HeroPicker, type PickMark } from '@/features/roster/HeroPicker';
import { compareChars } from '@/features/roster/charFilter';

type Undo = (st: GearStore) => GearStore | null;

// start — герой с карточки «К обмену ▸» (сразу его план); null — «Обмен» над списком: «Кого переодеть?»
// onApplied: after — for the toast's «Вернуть» once the store is back (the hero leaves the session; a no-op once the sheet is closed)
export function TradeSheet({ ctx, gear, roster, off, start, onApplied, onClose }: {
  ctx: Ctx; gear: GearApi; roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>;
  start: string | null; onApplied: (text: string, undo: Undo, after?: () => void) => void; onClose: () => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const name = (id: string) => heroName(idx, id);
  const [hero, setHero] = useState<string | null>(start);
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set()); // переодетые в этом окне (сеанс)
  const [stale, setStale] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  // кого можно выбрать: герои ростера с билдами (R2.7, R10.3), X при Core Fusion X — нет
  const pickable = useMemo(() => roster.filter((id) => idx.CHAR[id]?.builds.length && !off.has(id)), [roster, idx, off]);
  const world = useMemo(() => worldOf(ctx, st, roster, { locked, orders }), [ctx, st, roster, locked, orders]);
  const stamp = useMemo(() => stampOf(st), [st]);
  const walk = useWalk(hero ? targetOf([hero], false) : null, idx);
  const alive = useRef(true);
  // set on every setup: StrictMode runs setup → cleanup → setup on mount
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // «Кого переодеть?»: each open hero's gain now — for this world only (a new «Сделал», «Вернуть», order: counted again)
  const [gains, setGains] = useState<{ w: World; g: Gains } | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    runChunks(turnGains(world, pickable.filter((id) => !locked.has(id))), ac.signal).then((g) => {
      if (g && !ac.signal.aborted) setGains({ w: world, g });
    }).catch((e) => console.error(e));
    return () => ac.abort();
  }, [world, pickable, locked]);
  const marks = gains?.w === world ? gains.g : null;
  const markOf = (id: string): PickMark | null => {
    if (locked.has(id)) return { text: '✓', title: t.trade.markDone, off: true };
    const g = marks?.get(id);
    if (g === undefined) return null;
    if (g === null) return { text: '—', title: t.trade.markNone };
    return { text: t.trade.mark(g), title: t.trade.markTitle(g), cls: g > 0 ? 'up' : g < 0 ? 'down' : undefined };
  };

  // план героя — синхронно (R11.1: до 50 мс); the frozen slots of the walk count
  const hp = useMemo(() => (hero ? heroPlan(world, { to: hero, frozen: walk.frozen }) : null), [hero, world, walk.frozen]);
  const plan = useMemo((): Step[] | null => (hero && hp ? [{ plans: [{ to: hero, plan: hp.plan }] }] : null), [hero, hp]);
  const who = useMemo(() => (hero ? [hero] : []), [hero]);
  const res = useOutcome(world, plan, who, who, walk.d, walk.mark);

  const done = () => {
    if (!res || !hero || res.left) return;
    const r = applyWalk(st, { steps: res.o.steps, ends: res.o.ends, entered: res.entered }, stamp);
    if (!r) { setStale(true); return; }
    walk.clear();
    if (r.st !== st) {
      gear.set(r.st);
      setLocked((x) => new Set([...x, hero]));
      // «Вернуть»: the hero is not re-dressed any more — he leaves the session
      const unlock = () => { if (alive.current) setLocked((x) => new Set([...x].filter((id) => id !== hero))); };
      onApplied(t.trade.savedHero(name(hero)), r.undo, unlock);
    }
    setHero(null);
    setStale(false);
  };
  const cancel = () => { walk.clear(); setHero(null); setStale(false); };
  const orderOf = (id: string) => orders[id] ?? STATS;
  // закреплённый (MODEL.md §7 item 1) — его закрепление, жёстко: «Закреплено: Speed ×4»
  const pinnedName = (id: string) => { const p = idx.CHAR[id] ? pinOf(idx.CHAR[id], st.pin?.[id]) : null; return p ? t.card.pinned(comboText(idx, p.combo)) : null; };
  const nameOfOrder = (id: string) => pinnedName(id) ?? orderName(ctx, idx.CHAR[id], orderOf(id), t.ui.byStats);
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;
  const entry = walk.entry;

  return (
    <Sheet title={t.trade.title} onClose={onClose} className="trade">
      <div className="trade-b">
        {locked.size > 0 && (
          <p className="muted small trade-session">
            <span>{t.trade.session}</span>
            <button type="button" className="btn" onClick={onClose}>{t.trade.finish}</button>
          </p>
        )}
        {!hero && (
          <HeroPicker ids={turnOrder(pickable, [...locked], (a, z) => compareChars(idx.CHAR[a], idx.CHAR[z]))} title={t.trade.pickHero} empty={pickable.length ? '' : t.trade.noHeroes}
            mark={markOf} onPick={(id) => { setHero(id); setStale(false); }} />
        )}
        {res && hero && (
          <TradeWalk ctx={ctx} st={st} walk={res.o.walk} lines={res.lines} missing={{ [hero]: hp?.missing ?? [] }} ticks={res.ticks} left={res.left}
            recount={res.recount} resumed={walk.resumed ? [res.done, res.total] : null} stale={stale}
            onDecide={(x) => { walk.decide(x, res.o); setStale(false); }} onDone={done} onCancel={cancel} orderName={nameOfOrder} onOrder={setOrderFor} />
        )}
      </div>
      {orderC && (
        <OrderSheet c={orderC} ctx={ctx} order={orderOf(orderC.id)} pinned={pinnedName(orderC.id)} onClose={() => setOrderFor(null)}
          onChoose={(o) => { setOrders((x) => ({ ...x, [orderC.id]: o })); setStale(false); setOrderFor(null); }} />
      )}
      {entry && (
        <EntrySheet ctx={ctx} hero={entry.hero} slot={entry.slot} initial={walk.d.entered[slotKey(entry.hero, entry.slot)] ?? null}
          pin={st.pin?.[entry.hero]} onSave={walk.save} onClose={walk.closeEntry} />
      )}
    </Sheet>
  );
}
