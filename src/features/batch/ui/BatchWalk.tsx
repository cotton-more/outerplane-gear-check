// «Обход» (.x/0140-batch-walk §1 p. 4): the plan as steps to do in the game, four stages by game screen; each step has
// a ✓ (saved in the batch: the walk survives a reload). A piece the batch has no number for is named by its description.
// At the end — «Всё сделано — Записать план» with the same confirm as on the plan.
import { useState, type ReactNode } from 'react';
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
import { batchCaption, itemCaption } from '@/features/gear/ui/pieceText';
import { formPiece } from '@/features/gear/verdict';
import { inputOfPiece } from '@/features/batch/plan';

// the caption line of a weapon or accessory: «Noblewoman's Guile · HP%», «Steel Sword · ATK% · T4» (Q4); armor has none —
// the title says the slot and the hero, the grade and set are in the batch's title
const capOf = (ctx: Ctx, t: Texts, x: ItemInput): string => (isArmor(x.slot) ? '' : batchCaption(t, ctx.idx, formPiece(x)));

// a piece with no position: «Снятый шлем Caren (SPD 1, …)», «Отложенный шлем Caren (…)»
// a weapon or accessory adds what it is: «Снятое оружие Delta — Noblewoman's Guile · HP% (SPD 2, …)»
const desc = (ctx: Ctx, t: Texts, w: Exclude<Where, { n: number }>): string => {
  const what = isArmor(w.off.slot) ? '' : ` — ${capOf(ctx, t, inputOfPiece(w.off))}`;
  return w.was === 'stash' ? t.batch.offStash(w.off.slot, w.c.name + what, subsText(w.off.lit)) : `${t.batch.off(w.off.slot, w.c.name)}${what} (${subsText(w.off.lit)})`;
};

// a step: its title (with the hero to find, tagged), what the kept piece is and for whom, lines under it, and — for an
// equip and a lock — the substats as a column, line for line as the game's middle panel shows them (owner 2026-10-08)
interface StepText { title: string; hero: Char | null; kept?: { text: string; c: Char | null }; more: ReactNode[]; subs?: string[] }

// a piece of the dismantle or the feed (owner 2026-10-09): «Fire Grimoire · HP% · ATK% 2, DMG UP% 2, …» — name and main
// in the grade's colour (Epic blue, Legendary red), then the substats; no number, row or place: after the feed the
// game's list has moved, the piece is found by its stats (several identical — the first)
function PieceLine({ ctx, x }: { ctx: Ctx; x: ItemInput }) {
  const t4 = x.bt === 4;
  // armor: the substats alone («T4 · HP 1, EFF% 2»); a weapon or accessory: «Sublime Melody · HP% · T4 · DMG UP% 3, …»
  if (isArmor(x.slot)) return <>{t4 && <b>T4 · </b>}{subsText(x.subs)}</>;
  return <><span className={x.grade === 'unique' ? 'gname legend' : 'gname epic'}>{itemCaption(ctx.idx, x)}</span>{t4 && <b> · T4</b>} · {subsText(x.subs)}</>;
}

// «#21 Patience-перчатки — для Gnosis Domine», «… (запас)», «… — Спорно, отложено»
function keptText(ctx: Ctx, t: Texts, k: Kept): { text: string; c: Char | null } {
  const piece = capOf(ctx, t, k.input);
  if (k.why === 'maybe' || !k.c) return { text: t.batch.keptMaybe(k.n, piece), c: null };
  return { text: k.why === 'reserve' ? t.batch.keptReserve(k.n, piece, k.c.name) : t.batch.keptFor(k.n, piece, k.c.name), c: k.c };
}
function stepText(ctx: Ctx, t: Texts, s: Step): StepText {
  switch (s.stage) {
    case 1: return {
      title: s.k !== null && 'n' in s.where ? t.batch.equipStep(s.c.name, s.slot, s.k, s.where.n) : t.batch.equipStepAt(s.c.name, s.slot, 'n' in s.where ? `#${s.where.n}` : desc(ctx, t, s.where)),
      hero: s.c, more: [capOf(ctx, t, s.input)].filter(Boolean), subs: gameSubs(ctx.idx, s.subs),
    };
    case 2: {
      if (!('n' in s.where)) return { title: t.batch.lockStepAt(desc(ctx, t, s.where)), hero: s.where.c, more: [] };
      const { r, p } = rowOf(s.where.n);
      return { title: t.batch.lockStep(r, p), hero: null, kept: s.kept ? keptText(ctx, t, s.kept) : undefined, more: [],
        subs: s.kept ? gameSubs(ctx.idx, s.kept.input.subs) : undefined };
    }
    case 3: {
      const tg = s.target;
      // a worn target is «Шлем Caren»; any other is named like a set-aside piece — by its hero and stats, no position
      const where = 'worn' in tg ? t.batch.btWorn(tg.slot, tg.worn.name) : 'n' in tg.where ? `#${tg.where.n}` : desc(ctx, t, tg.where);
      const hero = 'worn' in tg ? tg.worn : 'n' in tg.where ? null : tg.where.c;
      // the item of a worn weapon or accessory (armor: the title says it all; a set-aside target names it in the title)
      const what = 'worn' in tg && s.piece && !isArmor(tg.slot) ? [capOf(ctx, t, s.piece)] : [];
      // the feed, piece by piece: «Noblewoman's Guile · HP% · HP 3, …»; a taken-off or set-aside one — its description
      const mats = s.mats.map(({ where: w, input: x }) => ('n' in w ? <PieceLine ctx={ctx} x={x} /> : desc(ctx, t, w)));
      return { title: t.batch.btStep(where, s.n), hero, more: [...what, ...(s.unlock ? [t.batch.btUnlock(s.unlock)] : []), t.batch.btFeed, ...mats] };
    }
    case 4: {
      // each piece on its own line, what it is — «Sublime Melody · HP% · SPD 1, CHC 2, …»; the locked ones first need unlocking
      const lines = s.where.map((w, i) => ('n' in w ? <PieceLine ctx={ctx} x={s.inputs[i]} /> : desc(ctx, t, w)));
      return { title: t.batch.junkTitle(s.where.length), hero: null, more: [...(s.unlock ? [t.batch.btUnlock(s.unlock)] : []), ...lines, ...(s.left ? [t.batch.dzLeft] : [])] };
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
            {st === 3 && <p className="muted small">{t.batch.btNote}</p>}
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
