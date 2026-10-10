// The batch plan (MODEL.md §8 item 10): a line per entry in the entered order, a piece the plan takes off a hero
// right under its entry; «Не брать» on a line with a hero, «Это другой» on a look-alike of a set-aside piece.
// One way on: «Обход ▸» — recording happens at the walk's end, after the game (owner 2026-10-09: «Записать план» here
// invited recording before anything was done). «Спорно» lines get «Отложить» / «Разобрать» — decided before the walk
// (owner 2026-10-08); «Обход ▸» waits for them. Back to the list — «← К списку» above.
import type { ReactNode } from 'react';
import type { Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Texts } from '@/i18n';
import { useT } from '@/i18n';
import { subsText } from '@/game/text';
import { namedGain } from '@/features/gear/model/vs';
import { wornAtEnd, type Fate, type Line, type Off, type Plan } from '@/features/batch/plan';
import { BatchPiece } from './BatchList';
import { withHero } from '@/game/hero/HeroTag';
import { capLine, itemCaption, Painted } from '@/features/gear/ui/pieceText';
import type { ItemInput } from '@/game/item/item';
import { isArmor } from '@/game/data';

// what a reserve waits for (MODEL.md §4 items 3b, 3c): a weapon or accessory — the item with the mains the hero's builds
// want, as a caption («Spirit of Unification · PEN%», PEN%/ATK% for two); armor — a good piece of its set and slot
// («хороший шлем Speed»)
export function waitText(t: Texts, ctx: Ctx, c: Char, x: ItemInput): string {
  if (isArmor(x.slot)) return x.setId ? t.batch.waitArmor(ctx.idx.SET[x.setId]?.short ?? '', x.slot) : '';
  const mains = [...new Set(c.builds.flatMap((b) => (x.slot === 'weapon' ? b.weapons : b.amulets)).filter((g) => g.key === x.itemKey).flatMap((g) => g.mains))];
  return mains.length ? t.batch.waitItem(itemCaption(ctx.idx, { ...x, main: null }), mains) : '';
}

// a line with a hero and a reserve's wait: the hero tagged, the awaited item in the Legendary colour (owner 2026-10-10: a
// listed item is Legendary — «Token of the Supreme Witch · ATK%» red, not the line's green); armor's «хороший шлем Speed»
// has no grade — plain
export function withWait(text: string, c: Char | null, t: Texts, ctx: Ctx, x: ItemInput): ReactNode {
  const what = isArmor(x.slot) || !c ? '' : waitText(t, ctx, c, x), i = what ? text.indexOf(what) : -1;
  if (i < 0) return withHero(text, c);
  return <>{withHero(text.slice(0, i), c)}<span className="gname legend">{what}</span>{text.slice(i + what.length)}</>;
}

// the piece a «Корм для #n» line feeds, by its line: the hero who gets or keeps it and its slot (owner 2026-10-09: «Корм для
// #17» didn't say whose)
function targetOf(plan: Plan, n: number): { c: Char; slot: SlotId } | null {
  const l = plan.lines.find((x) => x.n === n && !x.off);
  const f = l?.fate;
  return l && f && (f.kind === 'wear' || f.kind === 'keep' || f.kind === 'reserve') ? { c: f.c, slot: l.input.slot } : null;
}

export function fateText(t: Texts, f: Fate, plan: Plan, ctx: Ctx, x: ItemInput): string {
  switch (f.kind) {
    case 'wear': {
      // a recommended Legendary that wins by its passive and loses points says what it costs, like the trade plan (Q6)
      const cost = f.rankUp && namedGain(-f.dV) ? ` · ${t.trade.itemPts(f.dV)}, ${t.trade.passive}` : '';
      return (f.instead ? t.batch.replace(f.c.name, f.instead.slot) : t.batch.wear(f.c.name)) + cost + (f.t4 ? t.batch.t4 : '');
    }
    case 'keep': return t.batch.keep(f.c.name) + (f.t4 ? t.batch.t4 : '');
    case 'reserve': return t.batch.reserve(f.c.name, waitText(t, ctx, f.c, x));
    case 'feed': {
      if ('entry' in f.to) { const g = targetOf(plan, f.to.entry); return t.batch.feedEntry(f.to.entry, g?.slot ?? null, g?.c.name ?? null); }
      return wornAtEnd(plan.st, f.to) ? t.batch.feedWorn(f.to.piece.slot, f.to.c.name) : t.batch.feedStash(f.to.piece.slot, f.to.c.name);
    }
    case 'same': return t.batch.same(f.same.piece.slot, f.same.c.name, t.fit.date(f.same.piece.at));
    case 'junk': return t.batch.junk;
    default: return t.batch.none;
  }
}

// a taken-off piece's line: «Снятое оружие Ember — Steel Sword · ATK%», the caption in the grade's colour
function OffText({ ctx, t, off }: { ctx: Ctx; t: Texts; off: Off }) {
  const cap = capLine(t, ctx.idx, off.piece);
  const text = off.was === 'stash' ? t.batch.offStash(off.piece.slot, off.c.name, subsText(off.piece.lit), cap) : t.batch.off(off.piece.slot, off.c.name, cap);
  return <Painted text={text} what={cap} grade={off.piece.grade} />;
}

// the hero a fate sends the player to (tagged in the line: class icon, element colour)
function heroIn(plan: Plan, f: Fate): Char | null {
  switch (f.kind) {
    case 'wear': case 'keep': case 'reserve': return f.c;
    case 'feed': return 'entry' in f.to ? targetOf(plan, f.to.entry)?.c ?? null : f.to.c;
    case 'same': return f.same.c;
    default: return null;
  }
}

// whose line it is for «Не брать»: the hero who gets the piece, or whose piece it feeds
function heroOf(plan: Plan, l: Line): Char | null {
  const f = l.fate;
  if (f.kind === 'keep' && f.held) return null;
  if (f.kind === 'wear' || f.kind === 'keep' || f.kind === 'reserve') return f.c;
  if (f.kind !== 'feed') return null;
  if (!('entry' in f.to)) return f.to.c;
  const n = f.to.entry;
  const g = plan.lines.find((x) => x.n === n && !x.off)?.fate;
  return g && (g.kind === 'wear' || g.kind === 'keep') ? g.c : null;
}

export function BatchPlan({ ctx, plan, onSkip, onTwin, onWalk }: {
  ctx: Ctx; plan: Plan;
  onSkip: (line: string, hero: string) => void; onTwin: (n: number) => void; onWalk: () => void;
}) {
  const t = useT();
  const c = plan.counts;
  return (
    <div className="batch">
      <p className="batch-sum">{t.batch.summary(c.wear, c.keep, c.feed, c.junk)}</p>
      <ol className="bgear-list batch-plan">
        {plan.lines.map((l) => {
          const hero = heroOf(plan, l);
          return (
            <li key={l.id} className={`bgear-row brow b-${l.fate.kind}${l.off ? ' boff' : ''}`}>
              {l.off
                ? <span className="boff-n"><OffText ctx={ctx} t={t} off={l.off} /></span>
                : <BatchPiece ctx={ctx} n={l.n} x={l.input} />}
              <span className="bfate">{l.fate.kind === 'reserve'
                ? withWait(fateText(t, l.fate, plan, ctx, l.input), l.fate.c, t, ctx, l.input)
                : withHero(fateText(t, l.fate, plan, ctx, l.input), heroIn(plan, l.fate))}</span>
              {hero && <button type="button" className="linkbtn small tskip hit" onClick={() => onSkip(l.id, hero.id)}>{t.trade.skip}</button>}
              {l.fate.kind === 'same' && !l.off && <button type="button" className="linkbtn small btwin hit" onClick={() => onTwin(l.n)}>{t.fit.twin(l.input.slot)}</button>}
            </li>
          );
        })}
      </ol>
      {plan.wornFed && <p className="muted small">{t.batch.wornNote}</p>}
      <div className="batch-acts">
        <button type="button" className="btn primary" onClick={onWalk}>{t.batch.walk}</button>
      </div>
    </div>
  );
}
