// The batch plan (.x/0110-batch/PLAN.md §1 p. 4): a line per entry in the entered order, a piece the plan takes off a hero
// right under its entry; «Не брать» on a line with a hero, «Это другой» on a look-alike of a set-aside piece.
// «Записать план» — record it all, only after a confirm: an accidental tap changes many heroes at once (owner, 2026-10-07).
// The button is outlined in the dismantle colour; back to the list — «Список ▸» on the strip. «Спорно» lines get
// «Отложить» / «Разобрать» — decided before the walk (owner 2026-10-08); «Обход ▸» waits for them.
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Texts } from '@/i18n';
import { useT } from '@/i18n';
import { subsText } from '@/game/text';
import type { Fate, Line, Plan } from '@/features/batch/plan';
import { BatchPiece } from './BatchList';
import { AskSheet } from '@/shared/ui/AskSheet';

export function fateText(t: Texts, f: Fate): string {
  switch (f.kind) {
    case 'wear': return (f.instead ? t.batch.replace(f.c.name, f.instead.slot) : t.batch.wear(f.c.name)) + (f.t4 ? t.batch.t4 : '');
    case 'keep': return t.batch.keep(f.c.name) + (f.t4 ? t.batch.t4 : '');
    case 'reserve': return t.batch.reserve(f.c.name);
    case 'feed': return 'entry' in f.to ? t.batch.feedEntry(f.to.entry) : t.batch.feedWorn(f.to.piece.slot, f.to.c.name);
    case 'same': return t.batch.same(f.same.piece.slot, f.same.c.name, t.fit.date(f.same.piece.at));
    case 'maybe': return t.batch.maybe(f.heroes.slice(0, 3).map((c) => c.name).join(', '));
    case 'junk': return t.batch.junk;
    default: return t.batch.none;
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

export function BatchPlan({ ctx, plan, choice, undecided, onSkip, onTwin, onChoose, onWalk, onDone }: {
  ctx: Ctx; plan: Plan; choice: Record<string, 'keep' | 'junk'>; undecided: number;
  onSkip: (line: string, hero: string) => void; onTwin: (n: number) => void; onChoose: (line: string, c: 'keep' | 'junk' | null) => void;
  onWalk: () => void; onDone: () => void;
}) {
  const t = useT();
  const c = plan.counts;
  const [asking, setAsking] = useState(false);
  return (
    <div className="batch">
      <p className="batch-sum">{t.batch.summary(c.wear, c.keep, c.feed, c.junk)}</p>
      <ol className="bgear-list batch-plan">
        {plan.lines.map((l) => {
          const hero = heroOf(plan, l);
          return (
            <li key={l.id} className={`bgear-row brow b-${l.fate.kind}${l.off ? ' boff' : ''}`}>
              {l.off
                ? <span className="boff-n">{l.off.was === 'stash'
                  ? t.batch.offStash(l.off.piece.slot, l.off.c.name, subsText(l.off.piece.lit))
                  : t.batch.off(l.off.piece.slot, l.off.c.name)}</span>
                : <BatchPiece ctx={ctx} n={l.n} x={l.input} />}
              <span className="bfate">{fateText(t, l.fate)}</span>
              {hero && <button type="button" className="linkbtn small tskip" onClick={() => onSkip(l.id, hero.id)}>{t.trade.skip}</button>}
              {l.fate.kind === 'same' && !l.off && <button type="button" className="linkbtn small" onClick={() => onTwin(l.n)}>{t.fit.twin(l.input.slot)}</button>}
              {l.fate.kind === 'maybe' && (
                <span className="bdecide">
                  <span className="muted">{t.batch.decide}</span>
                  {(['keep', 'junk'] as const).map((c) => (
                    <button key={c} type="button" className="chip" aria-pressed={choice[l.id] === c} onClick={() => onChoose(l.id, choice[l.id] === c ? null : c)}>
                      {c === 'keep' ? t.batch.keepIt : t.batch.junkIt}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {plan.wornFed && <p className="muted small">{t.batch.wornNote}</p>}
      <div className="batch-acts">
        <button type="button" className="btn primary" disabled={undecided > 0} onClick={onWalk}>{t.batch.walk}</button>
        {undecided > 0 && <span className="muted small">{t.batch.walkOff(undecided)}</span>}
        <button type="button" className="btn brec" onClick={() => setAsking(true)}>{t.batch.record}</button>
      </div>
      {asking && (
        <AskSheet title={t.batch.recordAsk} text={t.batch.recordText(c.wear, c.keep)} yes={t.batch.recordYes} kind="batch-ask"
          onYes={() => { setAsking(false); onDone(); }} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}
