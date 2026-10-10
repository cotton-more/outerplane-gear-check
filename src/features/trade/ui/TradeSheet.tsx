// Шторка «Обмен вещами» (.x/0040-trade/SPEC.md R4, R10.3–R10.6; сеанс и заказ — MODEL.md §7). Режим «Герой»:
// выбрать героя → план считается сразу; «Сделал» — и можно выбрать следующего, а надетое переодетого следующие не берут,
// пока шторка открыта (сеанс, строка о нём над выбором). Режим «Команда»: четыре места ромбом (у члена — плитка и заказ
// «Заказ: … ▾»), «Посчитать» → «Считаю…» и «Отмена» (runTeam кусками). «Не брать» и смена заказа — пересчёт (R7.3).
// «Сделал» — одна запись (features/trade/model/apply), сообщение с «Вернуть» — у App (onApplied).
// Неподтверждённый план, заказы и сеанс нигде не хранятся (R4.5): закрыл шторку — их нет.
import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { applyHero, applyTeam, stampOf } from '@/features/trade/model/apply';
import { skipKey } from '@/features/trade/model/cands';
import type { HoleFill } from '@/features/trade/model/holes';
import { advance, heroMoves } from '@/features/trade/model/moves';
import { heroPlan, type Missing } from '@/features/trade/model/plan';
import { runTeam, type TeamPlan } from '@/features/trade/model/team';
import { linesOf, type HeroLine } from '@/features/trade/model/view';
import { STATS, worldOf } from '@/features/trade/model/world';
import type { GearApi } from '@/features/gear/store/useGear';
import { Sheet } from '@/shared/ui/Sheet';
import { TeamPick } from './TeamPick';
import { TradePlan } from './TradePlan';
import { OrderSheet, orderName } from './OrderSheet';
import { pinOf } from '@/game/build/profile';
import { comboText } from '@/game/build/builds';
import { HeroFace } from '@/game/hero/HeroFace';
import { heroName, HeroName } from '@/game/hero/HeroName';

type Undo = (st: GearStore) => GearStore | null;

interface Result { lines: HeroLine[]; fills: HoleFill[]; missing: Record<string, Missing[]>; stamp: string; empty: boolean }

// start — герой с карточки «К обмену ▸» (сразу его план); team — открыта «Обменом для команды» (кнопка «Обмен» над списком, «Ещё» на телефоне): сразу «Команда»
export function TradeSheet({ ctx, gear, roster, off, start, team: teamFirst, onApplied, onClose }: {
  ctx: Ctx; gear: GearApi; roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>;
  start: string | null; team?: boolean; onApplied: (text: string, undo: Undo) => void; onClose: () => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const name = (id: string) => heroName(idx, id);
  const [mode, setMode] = useState<'hero' | 'team'>(teamFirst ? 'team' : 'hero');
  const [hero, setHero] = useState<string | null>(start);
  const [team, setTeam] = useState<(string | null)[]>([null, null, null, null]);
  const [place, setPlace] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [orders, setOrders] = useState<Record<string, string>>({});
  const [locked, setLocked] = useState<ReadonlySet<string>>(new Set()); // переодетые в этом окне (сеанс)
  const [stale, setStale] = useState(false);
  const [orderFor, setOrderFor] = useState<string | null>(null);
  // кого можно выбрать: герои ростера с билдами (R2.7, R10.3), X при Core Fusion X — нет
  const pickable = useMemo(() => roster.filter((id) => idx.CHAR[id]?.builds.length && !off.has(id)), [roster, idx, off]);
  const world = useMemo(() => worldOf(ctx, st, roster, { locked, orders }), [ctx, st, roster, locked, orders]);
  const stamp = useMemo(() => stampOf(st), [st]);
  const members = team.filter((x): x is string => !!x);
  const fresh = () => { setSkip(new Set()); setStale(false); };

  // план героя — синхронно (R11.1: до 50 мс)
  const hres = useMemo((): (Result & { hp: ReturnType<typeof heroPlan> }) | null => {
    if (mode !== 'hero' || !hero) return null;
    const hp = heroPlan(world, { to: hero, skip });
    const step = { plans: [{ to: hero, plan: hp.plan }], fills: hp.holes.fills };
    return {
      hp, fills: hp.holes.fills, missing: { [hero]: hp.missing }, stamp, empty: !hp.plan.changes.length,
      // только сам герой (владелец, 2026-10-05): у кого забрали — не показываем, как и в команде
      lines: linesOf(world, advance(world, step), [hero], heroMoves(world, hero, step)).filter((l) => l.receiver),
    };
  }, [mode, hero, world, skip, stamp]);

  // план команды — кусками
  const [tres, setTres] = useState<(Result & { tp: TeamPlan }) | null>(null);
  const teamKey = members.join();
  useEffect(() => {
    setTres(null);
    if (mode !== 'team' || !go || members.length !== team.length) return;
    const ac = new AbortController();
    runTeam(world, { team: members, skip }, ac.signal).then((tp) => {
      if (!tp || ac.signal.aborted) return;
      const w1 = tp.steps.reduce(advance, world);
      // команда — только её члены (владелец, 2026-10-04): потери и дыры других героев не показываем
      setTres({
        tp, lines: linesOf(world, w1, tp.order, tp.moves).filter((l) => l.receiver), fills: tp.steps.flatMap((s) => s.fills),
        missing: Object.fromEntries(tp.members.map((m) => [m.to, m.missing])), stamp, empty: !tp.moves.moves.length,
      });
    }).catch((e) => console.error(e));
    return () => ac.abort();
  }, [mode, go, teamKey, world, skip, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = mode === 'hero' ? hres : tres;
  const done = () => {
    if (mode === 'hero' && hres && hero) {
      const r = applyHero(st, { to: hero, hp: hres.hp, stamp: hres.stamp });
      if (!r) { setStale(true); return; }
      if (r.st !== st) {
        gear.set(r.st);
        setLocked((x) => new Set([...x, hero]));
        onApplied(t.trade.savedHero(name(hero)), r.undo);
      }
      setHero(null);
      fresh();
      return;
    }
    if (mode === 'team' && tres) {
      const r = applyTeam(st, { tp: tres.tp, stamp: tres.stamp });
      if (!r) { setStale(true); return; }
      if (r.st !== st) { gear.set(r.st); onApplied(t.trade.savedTeam, r.undo); }
      onClose();
    }
  };
  const cancel = () => {
    if (mode === 'hero') setHero(null); else setGo(false);
    fresh();
  };
  const switchMode = (m: 'hero' | 'team') => { setMode(m); setGo(false); setPlace(null); fresh(); };
  const pickMember = (id: string) => {
    if (place === null) return;
    setTeam((tm) => tm.map((x, i) => (i === place ? id : x === id ? null : x)));
    setPlace(null);
    setGo(false);
    fresh();
  };
  // «Убрать из команды» — под ромбом, когда выбрано занятое место
  const removeMember = () => {
    setTeam((tm) => tm.map((x, i) => (i === place ? null : x)));
    setPlace(null);
    setGo(false);
    fresh();
  };
  const orderOf = (id: string) => orders[id] ?? STATS;
  // закреплённый (MODEL.md §7 item 1) — его закрепление, жёстко: «Закреплено: Speed ×4»
  const pinnedName = (id: string) => { const p = idx.CHAR[id] ? pinOf(idx.CHAR[id], st.pin?.[id]) : null; return p ? t.card.pinned(comboText(idx, p.combo)) : null; };
  const nameOfOrder = (id: string) => pinnedName(id) ?? orderName(ctx, idx.CHAR[id], orderOf(id), t.ui.byStats);
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;

  const picker = (exclude: readonly string[], onPick: (id: string) => void, title: string) => (
    <div className="trade-pick">
      <p className="trade-q">{title}</p>
      {pickable.length ? (
        <ul className="trade-heroes">
          {pickable.filter((id) => !exclude.includes(id)).map((id) => (
            <li key={id}>
              <button type="button" className="trade-hero" onClick={() => onPick(id)}>
                <HeroFace c={idx.CHAR[id]} />
                <span className="trade-hn"><HeroName c={idx.CHAR[id]} /></span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">{t.trade.noHeroes}</p>}
    </div>
  );

  return (
    <Sheet title={t.trade.title} onClose={onClose} className="trade">
      <div className="trade-b">
        <div className="trade-mode" role="tablist" aria-label={t.trade.title}>
          <button type="button" role="tab" aria-selected={mode === 'hero'} onClick={() => switchMode('hero')}>{t.trade.modeHero}</button>
          <button type="button" role="tab" aria-selected={mode === 'team'} onClick={() => switchMode('team')}>{t.trade.modeTeam}</button>
        </div>
        {locked.size > 0 && <p className="muted small trade-session">{t.trade.session}</p>}
        {mode === 'team' && (
          <>
            <p className="muted small">{t.trade.teamHint}</p>
            <TeamPick team={team} ctx={ctx} st={st} place={place} orderName={nameOfOrder}
              onPlace={(i) => { setPlace(place === i ? null : i); }} onOrder={setOrderFor} />
            {place !== null && team[place] && (
              <button type="button" className="linkbtn small trade-out" onClick={removeMember}>{t.trade.removeMember(name(team[place]!))}</button>
            )}
            {place !== null && picker(members, pickMember, t.trade.pickMember)}
            {members.length === team.length && !go && place === null && (
              <button type="button" className="btn primary trade-count" onClick={() => { setGo(true); setStale(false); }}>{t.trade.count}</button>
            )}
            {go && !tres && (
              <p className="trade-busy" role="status">
                <span>{t.trade.counting}</span>
                <button type="button" className="btn" onClick={() => setGo(false)}>{t.trade.cancel}</button>
              </p>
            )}
          </>
        )}
        {mode === 'hero' && !hero && picker([], (id) => { setHero(id); fresh(); }, t.trade.pickHero)}
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
