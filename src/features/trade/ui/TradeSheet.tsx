// Шторка «Обмен вещами» (R4, R10.3–R10.6 — MODEL.md §10; сеанс и заказ — MODEL.md §7). Режим «Герой»:
// выбрать героя → план считается сразу; «Сделал» — и можно выбрать следующего, а надетое переодетого следующие не берут,
// пока шторка открыта (сеанс, строка о нём над выбором с «Закончить»). «Кого переодеть?» (0200 stage A, MODEL.md §7 item 8):
// by name, at each hero the gain of his plan now (counted in chunks after every «Сделал» / «Вернуть»), the re-dressed last
// with ✓, not pickable. «Не брать» и смена заказа — пересчёт (R7.3). The team trade lives on «Команда» (TeamTradeSheet,
// .x/0200-boss E2, owner 2026-10-13): this sheet is the one-hero trade only — «dressing in turn».
// «Сделал» — одна запись (features/trade/model/apply), сообщение с «Вернуть» — у App (onApplied). Free pieces (model/free): worn at the
// open, worn by nobody now — any next hero may take them; the window closes with onClose(free) — App lists them (FreeSheet).
// Неподтверждённый план, заказы и сеанс нигде не хранятся (R4.5): закрыл шторку — их нет.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { applyHero, stampOf } from '@/features/trade/model/apply';
import { skipKey } from '@/features/trade/model/cands';
import { freeOf, wornOf } from '@/features/trade/model/free';
import type { HoleFill } from '@/features/trade/model/holes';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { heroPlan, type Missing } from '@/features/trade/model/plan';
import { linesOf, type HeroLine } from '@/features/trade/model/view';
import { STATS, worldOf } from '@/features/trade/model/world';
import { runChunks } from '@/features/trade/model/chunks';
import { turnGains, turnOrder, type Gains } from '@/features/trade/model/turn';
import type { World } from '@/features/trade/model/model';
import type { GearApi } from '@/features/gear/store/useGear';
import { Sheet } from '@/shared/ui/Sheet';
import { TradePlan } from './TradePlan';
import { OrderSheet, orderName } from './OrderSheet';
import { pinOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { heroName } from '@/game/hero/HeroName';
import { HeroPicker, type PickMark } from '@/features/roster/HeroPicker';
import { compareChars } from '@/features/roster/charFilter';

type Undo = (st: GearStore) => GearStore | null;

interface Result { lines: HeroLine[]; fills: HoleFill[]; missing: Record<string, Missing[]>; stamp: string; empty: boolean }

// start — герой с карточки «К обмену ▸» (сразу его план); null — «Обмен» над списком: «Кого переодеть?»
// onApplied: after — for the toast's «Вернуть» once the store is back (the hero leaves the session; a no-op once the sheet is closed)
export function TradeSheet({ ctx, gear, roster, off, start, onApplied, onClose }: {
  ctx: Ctx; gear: GearApi; roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>;
  start: string | null; onApplied: (text: string, undo: Undo, after?: () => void) => void;
  onClose: (free: string[]) => void; // free — pieces taken off in this window and given to no one, from the store as it is now
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const name = (id: string) => heroName(idx, id);
  const [hero, setHero] = useState<string | null>(start);
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set()); // переодетые в этом окне (сеанс)
  const [stale, setStale] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  // кого можно выбрать: герои ростера с билдами (R2.7, R10.3), X при Core Fusion X — нет
  const pickable = useMemo(() => roster.filter((id) => idx.CHAR[id]?.builds.length && !off.has(id)), [roster, idx, off]);
  // what was worn when the window opened (the sheet is mounted per window)
  const [opened] = useState(() => wornOf(st));
  const free = useMemo(() => new Set(freeOf(opened, st)), [opened, st]);
  const world = useMemo(() => worldOf(ctx, st, roster, { locked, orders, free }), [ctx, st, roster, locked, orders, free]);
  const stamp = useMemo(() => stampOf(st), [st]);
  const fresh = () => { setSkip(new Set()); setStale(false); };
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

  // план героя — синхронно (R11.1: до 50 мс)
  const hres = useMemo((): (Result & { hp: ReturnType<typeof heroPlan> }) | null => {
    if (!hero) return null;
    const hp = heroPlan(world, { to: hero, skip });
    const step = { plans: [{ to: hero, plan: hp.plan }], fills: hp.holes.fills };
    return {
      hp, fills: hp.holes.fills, missing: { [hero]: hp.missing }, stamp, empty: !hp.plan.changes.length,
      // только сам герой (владелец, 2026-10-05): у кого забрали — не показываем, как и в команде
      lines: linesOf(world, advance(world, step), [hero], heroMoves(world, hero, step)).filter((l) => l.receiver),
    };
  }, [hero, world, skip, stamp]);

  const res = hres;
  const close = () => onClose(freeOf(opened, st));
  const done = () => {
    if (!hres || !hero) return;
    const r = applyHero(st, { to: hero, hp: hres.hp, stamp: hres.stamp });
    if (!r) { setStale(true); return; }
    if (r.st !== st) {
      gear.set(r.st);
      setLocked((x) => new Set([...x, hero]));
      // «Вернуть»: the hero is not re-dressed any more — he leaves the session
      const unlock = () => { if (alive.current) setLocked((x) => new Set([...x].filter((id) => id !== hero))); };
      onApplied(t.trade.savedHero(name(hero)), r.undo, unlock);
    }
    setHero(null);
    fresh();
  };
  const cancel = () => { setHero(null); fresh(); };
  const orderOf = (id: string) => orders[id] ?? STATS;
  // закреплённый (MODEL.md §7 item 1) — его закрепление, жёстко: «Закреплено: Speed ×4»
  const pinnedName = (id: string) => { const p = idx.CHAR[id] ? pinOf(idx.CHAR[id], st.pin?.[id]) : null; return p ? t.card.pinned(comboText(idx, p.combo)) : null; };
  const nameOfOrder = (id: string) => pinnedName(id) ?? orderName(ctx, idx.CHAR[id], orderOf(id), t.ui.byStats);
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;

  return (
    <Sheet title={t.trade.title} onClose={close} className="trade">
      <div className="trade-b">
        {locked.size > 0 && (
          <p className="muted small trade-session">
            <span>{t.trade.session}</span>
            <button type="button" className="btn" onClick={close}>{t.trade.finish}</button>
          </p>
        )}
        {!hero && (
          <HeroPicker ids={turnOrder(pickable, [...locked], (a, z) => compareChars(idx.CHAR[a], idx.CHAR[z]))} title={t.trade.pickHero} empty={pickable.length ? '' : t.trade.noHeroes}
            mark={markOf} onPick={(id) => { setHero(id); fresh(); }} />
        )}
        {res && (
          <TradePlan ctx={ctx} st={st} lines={res.lines} fills={res.fills} missing={res.missing} empty={res.empty} stale={stale}
            onSkip={(item, h) => setSkip((s) => new Set([...s, skipKey(item, h)]))}
            onDone={done} onCancel={cancel} orderName={nameOfOrder} onOrder={setOrderFor} />
        )}
      </div>
      {orderC && (
        <OrderSheet c={orderC} ctx={ctx} order={orderOf(orderC.id)} pinned={pinnedName(orderC.id)} onClose={() => setOrderFor(null)}
          onChoose={(o) => { setOrders((x) => ({ ...x, [orderC.id]: o })); setStale(false); setOrderFor(null); }} />
      )}
    </Sheet>
  );
}
