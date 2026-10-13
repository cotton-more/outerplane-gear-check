// The trade as a walk (MODEL.md §7 items 7 and 9; .x/0200-boss E2b, mockups and texts approved by the owner 2026-10-13).
// Per hero — his line as before (gain by his order, stats was → becomes, sets on and off, parts that can't be built,
// «Заказ: … ▾») and his steps: «Замок» on his old piece when it is needed later, the piece to wear (as the plan drew it:
// set or item, main, substats, T4, points against the worn one, where it is) with «Оставить как было», a slot kept as it
// was («вернуть»), an empty slot («Искать: …», «Ввести» / «Оставить»; entered — the piece, its points and what is off).
// Then «В конце — замены»: replacements («сними замок», «Оставить как было»), parking, the empty slots of givers. A step
// is ticked by its round button; «Сделал · ещё N» until every line is done; «Отмена» asks first (the ticks go).
import type { SlotId } from '@/game/data/types';
import { GRADE_NAME, subLabel } from '@/game/data';
import { useState } from 'react';
import { useT, type Texts } from '@/i18n';
import type { Ctx } from '@/game/context';
import { pieceInput, type GearStore, type Piece } from '@/features/gear/model/gear';
import { formPiece } from '@/features/gear/verdict';
import { itemMains } from '@/game/item/mains';
import { profileFor } from '@/game/build/profile';
import { subWeights } from '@/game/build/score';
import { adviceOf, keyOfHole, keyOfItem, type SearchKey } from '@/features/trade/model/hint';
import type { Source } from '@/features/trade/model/moves';
import type { Missing } from '@/features/trade/model/plan';
import { lineGain, tenths, type HeroLine } from '@/features/trade/model/view';
import type { Line, Walk } from '@/features/trade/model/walk';
import { isArmor } from '@/game/data';
import { Icon, SlotIcon } from '@/game/icons/Img';
import { pieceText } from '@/features/gear/ui/pieceText';
import { partText, setName } from '@/game/set/setName';
import { HeroFace } from '@/game/hero/HeroFace';
import { SubToken } from '@/game/item/SubToken';
import { heroName, HeroName } from '@/game/hero/HeroName';
import { AskSheet } from '@/shared/ui/AskSheet';
import { OrderButton } from './OrderSheet';
import { PieceRow } from './PieceRow';

type T = Texts;
const pts = (m: number) => m / 1000;

// what the player decides on a line
export type Decide =
  | { kind: 'tick'; key: string }
  | { kind: 'freeze' | 'unfreeze' | 'keep' | 'unkeep' | 'leave' | 'unleave' | 'enter' | 'unenter'; hero: string; slot: SlotId };

// no grade — nothing about it (owner 2026-10-13: «6★» says nothing, only the stats to look for help)
function keyText(t: T, ctx: Ctx, k: SearchKey): string {
  return [k.grade && GRADE_NAME[k.grade], k.set && setName(ctx.idx, k.set),
    k.main && subLabel(k.main), k.sub && t.trade.keySub(subLabel(k.sub)), k.t4 && 'T4'].filter(Boolean).join(' · ');
}

function gainText(t: T, l: HeroLine): { text: string; cls: string } {
  const n = lineGain(l);
  return { text: t.trade.gainPts(n), cls: n > 0 ? 'up' : n < 0 ? 'down' : '' };
}

export function TradeWalk({ ctx, st, walk, lines, missing, ticks, left, recount, resumed, stale, onDecide, onDone, onCancel, orderName, onOrder }: {
  ctx: Ctx; st: GearStore; walk: Walk; lines: readonly HeroLine[]; missing: Readonly<Record<string, readonly Missing[]>>;
  ticks: ReadonlySet<string>; left: number; recount: number; resumed: [number, number] | null; stale: boolean;
  onDecide: (d: Decide) => void; onDone: () => void; onCancel: () => void;
  orderName: (id: string) => string; onOrder: (id: string) => void;
}) {
  const t = useT();
  const { idx } = ctx;
  const [asking, setAsking] = useState(false);
  const name = (id: string) => heroName(idx, id);
  // у закреплённого — цепочка его билда (MODEL.md §0)
  const profile = (id: string) => (idx.CHAR[id] ? profileFor(ctx, idx.CHAR[id], st.pin?.[id]) : null);
  const byHero = new Map(lines.map((l) => [l.hero, l]));
  const from = (s: Source) => (s.kind === 'worn' ? t.trade.fromWorn(name(s.hero)) : s.kind === 'stock' ? t.trade.fromStock(name(s.hero))
    : s.kind === 'parked' ? t.trade.fromParked(name(s.hero)) : t.trade.fromInventory);
  const empty = !walk.heroes.length && !walk.end.length;

  // the piece with its chips coloured by the hero's chain; Secondary ↓ for a weapon or accessory (R9.1)
  const piece = (p: Piece, hero: string, meta?: React.ReactNode, action?: React.ReactNode) => {
    const P = profile(hero);
    const W = P ? subWeights(ctx, P.chain, P.c, itemMains(idx, pieceInput(p))) : null;
    const sort = P && !isArmor(p.slot) ? keyOfItem(P, p).sub : null;
    return (
      <PieceRow ctx={ctx} p={p} action={action} meta={meta}
        sub={(k, lit) => <SubToken key={k} stat={k} lit={lit} credit={W?.get(k)?.credit ?? 0} sort={k === sort} title={k === sort ? t.trade.sortTitle : undefined} />} />
    );
  };
  const tick = (l: Line, done: boolean, off = false) => (
    <button type="button" className={`ttick hit${done ? ' on' : ''}${off ? ' off' : ''}`} aria-pressed={done} aria-label={t.trade.tickAria}
      disabled={off} onClick={() => onDecide({ kind: 'tick', key: l.key })}>
      <Icon name="check" />
    </button>
  );
  const keep = (onClick: () => void) => <button type="button" className="linkbtn small tkeep" onClick={onClick}>{t.trade.keep}</button>;
  const undo = (onClick: () => void) => <button type="button" className="linkbtn small tundo" onClick={onClick}><Icon name="arrow-back-up" />{t.trade.undo}</button>;

  const lineOf = (l: Line) => {
    const done = ticks.has(l.key);
    switch (l.kind) {
      case 'lock':
        return (
          <li key={l.key} className={`tstep tlock${done ? ' done' : ''}`}>
            {tick(l, done)}
            <div className="tstep-b">
              <p className="tstep-h"><Icon name="lock" /><span>{t.trade.lock(l.slot, name(l.hero))}</span></p>
              <p className="tstep-s">{l.to.kind === 'park' ? t.trade.lockPark : l.to.kind === 'repl' ? t.trade.lockTo(name(l.to.hero)) : t.trade.lockNext(name(l.to.hero))}</p>
            </div>
          </li>
        );
      case 'equip': {
        const p = st.pieces[l.item];
        if (!p) return null;
        const v = byHero.get(l.hero)?.worth[l.slot];
        const n = v ? tenths(v.d) : null;
        const meta = <>{n !== null && <span className={`tpts${n > 0 ? ' up' : n < 0 ? ' down' : ''}`}>{[t.trade.itemPts(n), v?.passive && t.trade.passive].filter(Boolean).join(' · ')}</span>}<span className="tsrc">{from(l.from)}</span></>;
        return (
          <li key={l.key} className={`tstep${done ? ' done' : ''}`}>
            {tick(l, done)}
            <div className="tstep-b">{piece(p, l.hero, meta, l.receiver ? keep(() => onDecide({ kind: 'freeze', hero: l.hero, slot: l.slot })) : undefined)}</div>
          </li>
        );
      }
      case 'kept':
        return (
          <li key={l.key} className="tstep tdecl done">
            {tick(l, true, true)}
            <div className="tstep-b tstep-r">
              <p className="tstep-h"><SlotIcon slot={l.slot} /><span>{t.trade.kept(l.slot)}</span></p>
              {undo(() => onDecide({ kind: 'unfreeze', hero: l.hero, slot: l.slot }))}
            </div>
          </li>
        );
      case 'hole': {
        const P = profile(l.hero);
        const title = l.receiver ? t.trade.emptySlot(l.slot) : t.trade.holeOf(name(l.hero), l.slot);
        if (l.entered) {
          const p = formPiece({ ...l.entered, slot: l.slot });
          const a = P ? adviceOf(P, p) : null;
          const n = a ? Math.round(a.pts * 10) / 10 : null;
          return (
            <li key={l.key} className="tstep tentered done">
              {tick(l, true, true)}
              <div className="tstep-b">
                <p className="tstep-h"><SlotIcon slot={l.slot} /><span>{l.receiver ? t.trade.entered(l.slot) : title}</span></p>
                {piece(p, l.hero, n !== null ? <span className="tpts up">{t.trade.itemPts(n)}</span> : undefined)}
                {a?.main && <p className="tadv">{t.trade.advMain(name(l.hero), a.main.map(subLabel).join('/'))}</p>}
                {a?.look && <p className="tadv">{t.trade.advNone(a.look.map(subLabel).join(', '))}</p>}
                <p className="tstep-a">
                  <button type="button" className="linkbtn small" onClick={() => onDecide({ kind: 'enter', hero: l.hero, slot: l.slot })}>{t.trade.change}</button>
                  {' · '}
                  <button type="button" className="linkbtn small" onClick={() => onDecide({ kind: 'unenter', hero: l.hero, slot: l.slot })}>{t.trade.drop}</button>
                </p>
              </div>
            </li>
          );
        }
        if (l.left) {
          return (
            <li key={l.key} className="tstep tdecl done">
              {tick(l, true, true)}
              <div className="tstep-b tstep-r">
                <p className="tstep-h"><SlotIcon slot={l.slot} /><span>{l.receiver ? t.trade.left(l.slot) : title}</span></p>
                {undo(() => onDecide({ kind: 'unleave', hero: l.hero, slot: l.slot }))}
              </div>
            </li>
          );
        }
        return (
          <li key={l.key} className="tstep thole">
            <span className="ttick open" aria-hidden="true" />
            <div className="tstep-b">
              <p className="tstep-h"><SlotIcon slot={l.slot} /><span>{title}</span></p>
              {P && <p className="tkey">{t.trade.search} {keyText(t, ctx, keyOfHole(P, l.slot, l.breaks))}</p>}
              <div className="tpair">
                <button type="button" className="tpill go" onClick={() => onDecide({ kind: 'enter', hero: l.hero, slot: l.slot })}>{t.trade.enter}</button>
                <button type="button" className="tpill" onClick={() => onDecide({ kind: 'leave', hero: l.hero, slot: l.slot })}>{t.trade.leave}</button>
              </div>
            </div>
          </li>
        );
      }
      case 'repl': {
        const p = st.pieces[l.item];
        const title = <p className="tstep-h"><SlotIcon slot={l.slot} /><span>{t.trade.repl(name(l.hero), l.slot, name(l.from))}{!l.kept && <span className="tsub"> · {t.trade.unlock}</span>}</span></p>;
        if (l.kept) {
          return (
            <li key={l.key} className="tstep tdecl done">
              {tick(l, true, true)}
              <div className="tstep-b tstep-r">{title}{undo(() => onDecide({ kind: 'unkeep', hero: l.hero, slot: l.slot }))}</div>
            </li>
          );
        }
        return (
          <li key={l.key} className={`tstep${done ? ' done' : ''}`}>
            {tick(l, done)}
            <div className="tstep-b">
              {title}
              {p && piece(p, l.hero)}
              <p className="tstep-a">{keep(() => onDecide({ kind: 'keep', hero: l.hero, slot: l.slot }))}</p>
            </div>
          </li>
        );
      }
      case 'park': {
        const p = st.pieces[l.item];
        return (
          <li key={l.key} className={`tstep${done ? ' done' : ''}`}>
            {tick(l, done)}
            <div className="tstep-b">
              <p className="tstep-h"><span className="tpk" aria-hidden="true">P</span><span>{t.trade.park(p ? pieceText(ctx, p) : '')}</span></p>
              <p className="tstep-s">{l.why === 'class' && l.giver ? t.trade.parkWhy(name(l.giver), name(l.hero)) : t.trade.parkKept(name(l.hero))}</p>
            </div>
          </li>
        );
      }
    }
  };

  return (
    <div className="tplan twalk">
      {stale && <p className="tstale" role="status">{t.trade.stale}</p>}
      {empty && <p className="tnothing">{t.trade.nothing}</p>}
      {resumed && <p className="tnote" role="status">{t.trade.resumed(resumed[0], resumed[1])}</p>}
      {recount > 0 && <p className="tnote" role="status">{t.trade.recount(recount)}</p>}
      {walk.heroes.map(({ hero, lines: steps }) => {
        const l = byHero.get(hero);
        const c = idx.CHAR[hero];
        const g = l ? gainText(t, l) : null;
        const sets = l ? [...l.on.map((p) => t.trade.setOn(setName(idx, p.set), p.n)), ...l.off.map((p) => t.trade.setOff(setName(idx, p.set), p.n))] : [];
        const drop = l ? tenths(l.ptsBefore - l.ptsAfter) > 0 : false;
        // the extra crit, when it changes in tenths (decision 14): stats + sets − crit = the gain
        const crit = l && tenths(l.critBefore) !== tenths(l.critAfter) ? t.trade.critPart(pts(l.critBefore), pts(l.critAfter)) : null;
        return (
          <section key={hero} className="tline to">
            <h4 className="tline-h">
              {c && <HeroFace c={c} />}
              <span className="tline-n">{c ? <HeroName c={c} /> : name(hero)}</span>
              <OrderButton name={orderName(hero)} onClick={() => onOrder(hero)} />
              {g && <span className={`tgain ${g.cls}`}>{g.text}</span>}
              {l && (
                <span className="tline-s">
                  <span className={drop ? 'down' : undefined}>
                    {drop ? t.trade.weaker(pts(l.ptsBefore - l.ptsAfter), !!crit) : t.trade.stats(pts(l.ptsBefore), pts(l.ptsAfter))}
                  </span>
                  {crit && ` · ${crit}`}
                </span>
              )}
              {sets.length > 0 && <span className="tline-s">{sets.join(', ')}</span>}
            </h4>
            {(missing[hero] ?? []).map((m) => (
              <p key={m.part.set} className="tmiss">{m.t4 ? t.trade.needT4(partText(idx, m.part))
                : t.trade.missing(partText(idx, m.part), setName(idx, m.part.set), m.slots.map((s) => t.ui.slotNom[s]).join(', '))}</p>
            ))}
            <ul className="tsteps">{steps.map(lineOf)}</ul>
            {l?.gone.map((id) => st.pieces[id] && <p key={id} className="muted small">{t.trade.gone(pieceText(ctx, st.pieces[id]))}</p>)}
          </section>
        );
      })}
      {walk.end.length > 0 && (
        <section className="tline tend">
          <h4 className="tend-h">{t.trade.endTitle} <small>{t.trade.endNote}</small></h4>
          <ul className="tsteps">{walk.end.map(lineOf)}</ul>
        </section>
      )}
      <div className="tact">
        {empty
          ? <button type="button" className="btn primary" onClick={onDone}>{t.trade.ok}</button>
          : <>
            <button type="button" className={`btn primary tdone${left ? ' wait' : ''}`} aria-disabled={left > 0 || undefined} onClick={() => { if (!left) onDone(); }}>
              {t.trade.done}{left > 0 && <> · <b>{t.trade.doneLeft(left)}</b></>}
            </button>
            <button type="button" className="btn" onClick={() => setAsking(true)}>{t.trade.cancel}</button>
          </>}
      </div>
      {asking && (
        <AskSheet title={t.trade.cancelAsk} text={t.trade.cancelText} yes={t.trade.cancelYes} kind="trade-ask"
          onYes={() => { setAsking(false); onCancel(); }} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}
