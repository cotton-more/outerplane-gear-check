// «Обход» (.x/0140-batch-walk §1 p. 4): the plan as steps to do in the game, four stages by game screen; each step has
// a ✓ (saved in the batch: the walk survives a reload). A piece the batch has no number for is named by its description.
// At the end — «Всё сделано — Записать план» with the same confirm as on the plan.
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import type { ItemInput } from '@/game/item/item';
import { withHero } from '@/game/hero/HeroTag';
import type { Ctx } from '@/game/context';
import { isArmor } from '@/game/data';
import { useT, type Texts } from '@/i18n';
import { subsText } from '@/game/text';
import { AskSheet } from '@/shared/ui/AskSheet';
import type { Batch } from '@/features/batch/batch';
import type { Plan } from '@/features/batch/plan';
import { gameSubs, rowOf, type Kept, type Step, type Walk, type Where } from '@/features/batch/walk';
import { pieceLabel } from '@/features/gear/ui/pieceText';
import { formPiece } from '@/features/gear/verdict';
import { inputOfPiece } from '@/features/batch/plan';

// the piece in a phrase: armor «Speed-шлем», a Legendary item «Noblewoman's Guile · HP%», an Epic one — its main
// (owner 2026-10-09: the item name and, for a weapon or accessory, the main in every step)
const nameOf = (ctx: Ctx, t: Texts, x: ItemInput): string => {
  const label = pieceLabel(t, ctx.idx)(formPiece(x));
  return !isArmor(x.slot) && x.itemKey && x.main ? `${label} · ${x.main}` : label;
};

// a piece with no position: «Снятый шлем Caren (SPD 1, …)», «Отложенный шлем Caren (…)»
// a weapon or accessory adds what it is: «Снятое оружие Delta — Noblewoman's Guile · HP% (SPD 2, …)»
const desc = (ctx: Ctx, t: Texts, w: Exclude<Where, { n: number }>): string => {
  const what = isArmor(w.off.slot) ? '' : ` — ${nameOf(ctx, t, inputOfPiece(w.off))}`;
  return w.was === 'stash' ? t.batch.offStash(w.off.slot, w.c.name + what, subsText(w.off.lit)) : `${t.batch.off(w.off.slot, w.c.name)}${what} (${subsText(w.off.lit)})`;
};

// a step: its title (with the hero to find, tagged), what the kept piece is and for whom, lines under it, and — for an
// equip and a lock — the substats as a column, line for line as the game's middle panel shows them (owner 2026-10-08)
interface StepText { title: string; hero: Char | null; kept?: { text: string; c: Char | null }; more: string[]; subs?: string[] }

// «#21 Patience-перчатки — для Gnosis Domine», «… (запас)», «… — Спорно, отложено»
function keptText(ctx: Ctx, t: Texts, k: Kept): { text: string; c: Char | null } {
  const piece = nameOf(ctx, t, k.input);
  if (k.why === 'maybe' || !k.c) return { text: t.batch.keptMaybe(k.n, piece), c: null };
  return { text: k.why === 'reserve' ? t.batch.keptReserve(k.n, piece, k.c.name) : t.batch.keptFor(k.n, piece, k.c.name), c: k.c };
}
function stepText(ctx: Ctx, t: Texts, s: Step): StepText {
  switch (s.stage) {
    case 1: return {
      title: s.k !== null && 'n' in s.where ? t.batch.equipStep(s.c.name, s.slot, s.k, s.where.n) : t.batch.equipStepAt(s.c.name, s.slot, 'n' in s.where ? `#${s.where.n}` : desc(ctx, t, s.where)),
      hero: s.c, more: [nameOf(ctx, t, s.input)], subs: gameSubs(ctx.idx, s.subs),
    };
    case 2: {
      if (!('n' in s.where)) return { title: t.batch.lockStepAt(desc(ctx, t, s.where)), hero: s.where.c, more: [] };
      const { r, p } = rowOf(s.where.n);
      return { title: t.batch.lockStep(r, p), hero: null, kept: s.kept ? keptText(ctx, t, s.kept) : undefined, more: [],
        subs: s.kept ? gameSubs(ctx.idx, s.kept.input.subs) : undefined };
    }
    case 3: {
      // each piece on its own line: where it is, then what it is — «ряд 2, 8-й · #18 Epic · ATK% · SPD 1, CHC 2, …»
      const lines = s.where.map((w, i) => {
        if (!('n' in w)) return desc(ctx, t, w);
        const { r, p } = rowOf(w.n);
        const x = s.inputs[i];
        return x ? t.batch.pieceAt(r, p, w.n, nameOf(ctx, t, x), subsText(x.subs)) : t.batch.btAt(r, p);
      });
      return { title: t.batch.junkTitle(s.where.length), hero: null, more: lines };
    }
    case 4: {
      const where = 'worn' in s.target ? t.batch.btWorn(s.target.slot, s.target.worn.name)
        : 'n' in s.target.where ? t.batch.btAt(rowOf(s.target.where.n).r, rowOf(s.target.where.n).p) : desc(ctx, t, s.target.where);
      const hero = 'worn' in s.target ? s.target.worn : 'n' in s.target.where ? null : s.target.where.c;
      const kept = 'kept' in s.target && s.target.kept ? keptText(ctx, t, s.target.kept) : undefined;
      const label = (x: ItemInput) => nameOf(ctx, t, x);
      // the feed, piece by piece: «ряд 1, 9-й · #9 Noblewoman's Guile · HP% 3, …»; a taken-off or set-aside one — its description
      const mats = s.mats.map(({ where: w, input: x }) => ('n' in w ? t.batch.pieceAt(rowOf(w.n).r, rowOf(w.n).p, w.n, label(x), subsText(x.subs)) : desc(ctx, t, w)));
      return { title: t.batch.btStep(where, s.n), hero, kept, more: [...(s.piece && !kept ? [t.batch.btPiece(label(s.piece))] : []), ...(s.unlock ? [t.batch.btUnlock(s.unlock)] : []), t.batch.btFeed, ...mats] };
    }
  }
}

export function BatchWalk({ ctx, batch, plan, walk, onTick, onDone }: {
  ctx: Ctx; batch: Batch; plan: Plan; walk: Walk; onTick: (step: string) => void; onDone: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const c = plan.counts;
  const stages = [1, 2, 3, 4] as const;
  return (
    <div className="batch bwalk">
      <p className="muted small">{t.batch.walkNote}</p>
      {stages.map((st) => {
        const steps = walk.steps.filter((s) => s.stage === st);
        if (!steps.length) return null;
        return (
          <section key={st} className="bstage">
            <h4>{t.batch.stages[st - 1]}</h4>
            <ol className="bgear-list">
              {steps.map((s) => {
                const { title, hero, kept, more, subs } = stepText(ctx, t, s);
                const done = batch.done.includes(s.key);
                return (
                  <li key={s.key} className={`bgear-row bstep${done ? ' done' : ''}`}>
                    <button type="button" className="bcheck" role="checkbox" aria-checked={done} aria-label={title} onClick={() => onTick(s.key)}>{done ? '✓' : ''}</button>
                    <span className="bstep-t">
                      <b>{withHero(title, hero)}</b>
                      {kept && <span className="bstep-k">{withHero(kept.text, kept.c)}</span>}
                      {more.map((m, i) => <span key={i} className="bstep-m">{m}</span>)}
                      {subs && <span className="bstep-subs">{subs.map((m) => <span key={m}>{m}</span>)}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      <div className="batch-acts">
        <button type="button" className="btn brec" onClick={() => setAsking(true)}>{t.batch.walkEnd}</button>
      </div>
      {asking && (
        <AskSheet title={t.batch.recordAsk} text={t.batch.recordText(c.wear, c.keep)} yes={t.batch.recordYes} kind="batch-ask"
          onYes={() => { setAsking(false); onDone(); }} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}
