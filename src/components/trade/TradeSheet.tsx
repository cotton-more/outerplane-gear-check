// Шторка «Обмен вещами» (.x/0040-trade/SPEC.md R4, R10.3–R10.6). Режим «Герой»: выбрать героя → план считается сразу;
// «Сделал» — и можно выбрать следующего (прежний закреплён, если не снял переключатель, R4.4). Режим «Команда»: четыре места
// ромбом (у члена — мерило «сменить ▾» и закрепление), «Посчитать» → «Считаю…» и «Отмена» (runTeam кусками), потом
// подсказка закреплённых — тоже кусками, после плана. «Не брать», «Взять», смена мерила или закрепления — пересчёт (R7.3).
// Строка «Закреплены» с ✕ (R3.6). «Сделал» — одна запись (logic/trade/apply), сообщение с «Вернуть» — у App (onApplied).
// Неподтверждённый план нигде не хранится (R4.5): закрыл шторку — плана нет.
import { useEffect, useMemo, useState } from 'react';
import type { Char } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { setAim } from '../../logic/aim';
import { isPinned, pinnedOf, setPinned, type GearStore } from '../../logic/gear';
import { isStats, type PoolView } from '../../logic/pool';
import { applyHero, applyTeam, stampOf } from '../../logic/trade/apply';
import { skipKey } from '../../logic/trade/cands';
import type { HoleFill } from '../../logic/trade/holes';
import { advance, heroMoves } from '../../logic/trade/moves';
import { heroPlan, pinnedHint } from '../../logic/trade/plan';
import { runChunks, runTeam, teamHintSteps, type TeamPlan } from '../../logic/trade/team';
import { linesOf, type HeroLine } from '../../logic/trade/view';
import { aimVariant, worldOf } from '../../logic/trade/world';
import type { GearApi } from '../../state/useGear';
import { AimSheet } from '../chars/AimSheet';
import { Icon, Img } from '../Img';
import { Sheet } from '../Sheet';
import { TeamPick } from './TeamPick';
import { TradePlan, type Hint } from './TradePlan';

type Undo = (st: GearStore) => GearStore | null;

interface Result { lines: HeroLine[]; fills: HoleFill[]; stamp: string; hint: Hint | null | undefined; empty: boolean }

export function TradeSheet({ ctx, view, gear, roster, off, start, onApplied, onClose }: {
  ctx: Ctx; view: PoolView; gear: GearApi; roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>;
  start: string | null; onApplied: (text: string, undo: Undo) => void; onClose: () => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const st = gear.store;
  const name = (id: string) => idx.CHAR[id]?.name ?? id;
  const [mode, setMode] = useState<'hero' | 'team'>('hero');
  const [hero, setHero] = useState<string | null>(start);
  const [team, setTeam] = useState<(string | null)[]>([null, null, null, null]);
  const [place, setPlace] = useState<number | null>(null);
  const [go, setGo] = useState(false);
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [allow, setAllow] = useState<ReadonlySet<string>>(new Set());
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const [stale, setStale] = useState(false);
  const [aimFor, setAimFor] = useState<string | null>(null);
  // кого можно выбрать: герои ростера с билдами (R2.7, R10.3), X при Core Fusion X — нет
  const pickable = useMemo(() => roster.filter((id) => idx.CHAR[id]?.builds.length && !off.has(id)), [roster, idx, off]);
  const world = useMemo(() => worldOf(ctx, st, roster), [ctx, st, roster]);
  const stamp = useMemo(() => stampOf(st), [st]);
  const members = team.filter((x): x is string => !!x);
  const pinOf = (id: string) => pins[id] ?? true;
  const fresh = () => { setSkip(new Set()); setAllow(new Set()); setPins({}); setStale(false); };

  // план героя — синхронно (R11.1: до 50 мс)
  const hres = useMemo((): (Result & { hp: ReturnType<typeof heroPlan> }) | null => {
    if (mode !== 'hero' || !hero) return null;
    const inp = { to: hero, skip, allow };
    const hp = heroPlan(world, inp);
    const step = { plans: [{ to: hero, plan: hp.plan }], fills: hp.holes.fills };
    const h = pinnedHint(world, inp);
    return {
      hp, fills: hp.holes.fills, stamp, empty: !hp.plan.changes.length,
      lines: linesOf(world, advance(world, step), [hero], heroMoves(world, hero, step)),
      hint: h && { heroes: h.heroes, gain: h.gain },
    };
  }, [mode, hero, world, skip, allow, stamp]);

  // план команды — кусками; подсказка закреплённых — после плана, тоже кусками (на 56 героях до 1,5 с)
  const [tres, setTres] = useState<(Result & { tp: TeamPlan }) | null>(null);
  const teamKey = members.join();
  useEffect(() => {
    setTres(null);
    if (mode !== 'team' || !go || members.length !== team.length) return;
    const ac = new AbortController();
    const inp = { team: members, skip, allow };
    runTeam(world, inp, ac.signal).then((tp) => {
      if (!tp || ac.signal.aborted) return;
      const w1 = tp.steps.reduce(advance, world);
      setTres({ tp, lines: linesOf(world, w1, tp.order, tp.moves), fills: tp.steps.flatMap((s) => s.fills), stamp, hint: undefined, empty: !tp.moves.moves.length });
      return runChunks(teamHintSteps(world, inp, tp), ac.signal).then((h) => {
        if (!ac.signal.aborted) setTres((r) => (r && r.tp === tp ? { ...r, hint: h && { heroes: h.heroes, gain: h.gain } } : r));
      });
    }).catch((e) => console.error(e));
    return () => ac.abort();
  }, [mode, go, teamKey, world, skip, allow, stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = mode === 'hero' ? hres : tres;
  const done = () => {
    if (mode === 'hero' && hres && hero) {
      const r = applyHero(st, { to: hero, hp: hres.hp, pin: pinOf(hero), stamp: hres.stamp });
      if (!r) { setStale(true); return; }
      if (r.st !== st) {
        gear.set(r.st);
        onApplied(hres.empty ? t.trade.savedPin(name(hero), pinOf(hero)) : t.trade.savedHero(name(hero)), r.undo);
      }
      setHero(null);
      fresh();
      return;
    }
    if (mode === 'team' && tres) {
      const r = applyTeam(st, { tp: tres.tp, pin: Object.fromEntries(tres.tp.order.map((id) => [id, pinOf(id)])), stamp: tres.stamp });
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
  const togglePin = (id: string) => gear.set(setPinned(st, id, !isPinned(st, id)));
  const pinned = pinnedOf(st, roster);
  const aimC: Char | undefined = aimFor ? idx.CHAR[aimFor] : undefined;
  const aimCp = aimFor ? view.of(aimFor) : null;
  const gaugeName = (id: string) => {
    const v = aimVariant(ctx, view, st, id);
    return !v || isStats(v) ? t.ui.byStats : v.name;
  };

  const picker = (exclude: readonly string[], onPick: (id: string) => void, title: string) => (
    <div className="trade-pick">
      <p className="trade-q">{title}</p>
      {pickable.length ? (
        <ul className="trade-heroes">
          {pickable.filter((id) => !exclude.includes(id)).map((id) => (
            <li key={id}>
              <button type="button" className="trade-hero" onClick={() => onPick(id)}>
                <Img k={'face:' + idx.CHAR[id].icon} className="face" />
                <span className="trade-hn">{name(id)}</span>
                {isPinned(st, id) && <span className="trade-pin" title={t.trade.pinTile(name(id))}><Icon name="pin" /><span className="sr-only">{t.trade.pinTile(name(id))}</span></span>}
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
        {pinned.length > 0 && (
          <p className="trade-pinned">
            <span>{t.trade.pinned}</span>
            {pinned.map((id) => (
              <span key={id} className="trade-chip">
                {name(id)}
                <button type="button" className="tour-x" aria-label={t.trade.unpin(name(id))} onClick={() => gear.set(setPinned(st, id, false))}>✕</button>
              </span>
            ))}
          </p>
        )}
        {mode === 'team' && (
          <>
            <p className="muted small">{t.trade.teamHint}</p>
            <TeamPick team={team} ctx={ctx} st={st} place={place} gaugeName={gaugeName}
              onPlace={(i) => { setPlace(place === i ? null : i); }} onRemove={(i) => { setTeam((tm) => tm.map((x, j) => (j === i ? null : x))); setGo(false); fresh(); }}
              onAim={setAimFor} onPin={togglePin} />
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
          <TradePlan ctx={ctx} view={view} st={st} lines={res.lines} fills={res.fills} hint={res.hint} empty={res.empty} stale={stale}
            pinOf={pinOf} onPin={(id, on) => setPins((p) => ({ ...p, [id]: on }))}
            onSkip={(item, h) => setSkip((s) => new Set([...s, skipKey(item, h)]))}
            onTake={(heroes) => setAllow((a) => new Set([...a, ...heroes]))}
            onDone={done} onCancel={cancel} />
        )}
      </div>
      {aimC && aimCp && (
        <AimSheet c={aimC} ctx={ctx} st={st} cp={aimCp} onClose={() => setAimFor(null)}
          onChoose={(key) => { const r = setAim(st, aimC.id, key); if (r.st !== st) gear.set(r.st); setAimFor(null); }} />
      )}
    </Sheet>
  );
}
