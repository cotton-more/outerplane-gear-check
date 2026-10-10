// «Обход» (MODEL.md §8 item 7): the plan as steps to do in the game, four stages by game screen; each step has
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
import { Toggle } from '@/shared/ui/Toggle';
import type { Batch } from '@/features/batch/batch';
import type { Plan } from '@/features/batch/plan';
import { gameSubs, rowOf, type Kept, type Step, type Walk, type Where } from '@/features/batch/walk';
import { batchCaption, capLine, itemCaption } from '@/features/gear/ui/pieceText';
import { formPiece } from '@/features/gear/verdict';
import { inputOfPiece } from '@/features/batch/plan';
import { SubToken } from '@/game/item/SubToken';

// the caption line of a weapon or accessory: «Noblewoman's Guile · HP%», «Steel Sword · ATK% · T4» (Q4); armor has none —
// the title says the slot and the hero, the grade and set are in the batch's title (an equip with a position has its
// caption in the title, so this line is only for a taken-off or set-aside piece)
const capOf = (ctx: Ctx, t: Texts, x: ItemInput): string => capLine(t, ctx.idx, formPiece(x));

// a piece with no position, described once (no number to name it by): «Снятый шлем Caren (SPD 1, …)», «Отложенный шлем
// Caren (…)»; a weapon or accessory says what it is: «Снятое оружие Delta — Noblewoman's Guile · HP% (SPD 2, …)»
const desc = (ctx: Ctx, t: Texts, w: Exclude<Where, { n: number }>): string => {
  const what = capOf(ctx, t, inputOfPiece(w.off));
  return w.was === 'stash' ? t.batch.offStash(w.off.slot, w.c.name, subsText(w.off.lit), what) : `${t.batch.off(w.off.slot, w.c.name, what)} (${subsText(w.off.lit)})`;
};

// the same as a line of its own (the feed, the dismantle): the item's name and main in the grade's colour, like a PieceLine
// (owner 2026-10-10: «Снятый аксессуар Luna — Steel Necklace · HP%» — the item didn't stand out)
function DescLine({ ctx, t, w }: { ctx: Ctx; t: Texts; w: Exclude<Where, { n: number }> }) {
  const text = desc(ctx, t, w), what = capOf(ctx, t, inputOfPiece(w.off)), i = what ? text.indexOf(what) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<span className={w.off.grade === 'unique' ? 'gname legend' : 'gname epic'}>{what}</span>{text.slice(i + what.length)}</>;
}

// a step: its title (with the hero to find, tagged), the piece's caption at the end of the title in the grade's colour
// (`tail`, an equip of a piece with a position), the quiet position hint on the right of the title line (`no`), the
// caption line of a weapon or accessory, for whom the kept piece stays, lines under it, and — for an equip and a lock —
// the substats as a column, line for line as the game's middle panel shows them (owner 2026-10-08)
interface StepText { title: string; hero: Char | null; tail?: string; no?: string; cap?: string; grade?: ItemInput['grade']; kept?: { text: string; c: Char | null }; more: ReactNode[]; subs?: string[]; bt?: Bt }
// a Breakthrough step (owner 2026-10-10, «target card + pips»): the target as a card — its item, all its substats and how
// many tiers this feed adds (◆ per piece, «+2»; four always reach T4 — «T4»: the app knows only T4 or not, so no «T0 →»)
// — and the feed hanging under it
interface Bt { piece: ItemInput; n: number; mats: ReactNode[] }

const Chips = ({ x }: { x: ItemInput }) => <span className="bt-chips">{Object.entries(x.subs).map(([k, v]) => <SubToken key={k} stat={k} lit={v} />)}</span>;
// a piece of the feed: the item in the grade's colour (a weapon or accessory), then its substats as chips
function MatLine({ ctx, x }: { ctx: Ctx; x: ItemInput }) {
  return <>{!isArmor(x.slot) && <span className={x.grade === 'unique' ? 'gname legend' : 'gname epic'}>{itemCaption(ctx.idx, x)}{x.bt === 4 ? '\u00A0·\u00A0T4' : ''}</span>}<Chips x={x} /></>;
}
function BtCard({ ctx, t, bt }: { ctx: Ctx; t: Texts; bt: Bt }) {
  const x = bt.piece;
  const n = Math.min(4, bt.n), to = n >= 4 ? 'T4' : `+${n}`;
  const pips = <span className="bt-pips" aria-label={to}>{[1, 2, 3, 4].map((k) => <i key={k} className={k <= n ? 'gain' : ''} />)}{to}</span>;
  // armor has no item to name (the title says the slot): the pips go at the end of the substats' line
  return (
    <>
      <span className="bt-card">
        {isArmor(x.slot)
          ? <span className="bt-top"><Chips x={x} />{pips}</span>
          : <><span className="bt-top"><span className={`gname ${x.grade === 'unique' ? 'legend' : 'epic'}`}>{itemCaption(ctx.idx, x)}</span>{pips}</span><Chips x={x} /></>}
      </span>
      <span className="bt-feed" aria-label={t.batch.btFeed}>
        {bt.mats.map((m, i) => <span key={i} className="bt-mat">{m}</span>)}
      </span>
    </>
  );
}

// a piece of the dismantle or the feed (owner 2026-10-09): «Fire Grimoire · HP% · ATK% 2, DMG UP% 2, …» — name and main
// in the grade's colour (Epic blue, Legendary red), then the substats; no number, row or place: after the feed the
// game's list has moved, the piece is found by its stats (several identical — the first)
function PieceLine({ ctx, x }: { ctx: Ctx; x: ItemInput }) {
  const t4 = x.bt === 4;
  // armor: the substats alone («T4 · HP 1, EFF% 2»); a weapon or accessory: «Sublime Melody · HP% · T4 · DMG UP% 3, …»
  if (isArmor(x.slot)) return <>{t4 && <b>T4 · </b>}{subsText(x.subs)}</>;
  return <><span className={x.grade === 'unique' ? 'gname legend' : 'gname epic'}>{itemCaption(ctx.idx, x)}</span>{t4 && <b>{'\u00A0·\u00A0T4'}</b>} · {subsText(x.subs)}</>;
}

// for whom a kept piece stays: «для Gnosis Domine», «для Valentine · запас»; the piece is in the title (row, place, #n)
// and, for a weapon or accessory, in the caption line above
function keptText(t: Texts, k: Kept): { text: string; c: Char | null } {
  return { text: k.why === 'reserve' ? t.batch.keptReserve(k.c.name) : t.batch.keptFor(k.c.name), c: k.c };
}
function stepText(ctx: Ctx, t: Texts, s: Step): StepText {
  switch (s.stage) {
    case 1: {
      // «Lambda → Steel Sword · ATK%», «Eliza → броня» (owner 2026-10-10, variant B): the piece's caption ends the title,
      // the position in the hero's slot list is a quiet hint on the right; a piece with no position (taken off another
      // hero, set aside) is named by its hero, then its caption line
      const w = s.where;
      if ('n' in w) {
        const what = batchCaption(t, ctx.idx, formPiece(s.input));
        return { title: t.batch.equipTo(s.c.name, what), hero: s.c, tail: what, no: s.k === null ? undefined : t.batch.equipNo(s.k), grade: s.input.grade, more: [], subs: gameSubs(ctx.idx, s.subs) };
      }
      return { title: t.batch.equipTo(s.c.name, t.batch.offAt(w.off.slot, w.c.name, w.was === 'stash')), hero: s.c, cap: capOf(ctx, t, s.input), grade: s.input.grade, more: [], subs: gameSubs(ctx.idx, s.subs) };
    }
    case 2: {
      if (!('n' in s.where)) return { title: t.batch.lockStepAt(desc(ctx, t, s.where)), hero: s.where.c, more: [] };
      const { r, p } = rowOf(s.where.n);
      return { title: t.batch.lockStep(r, p, s.where.n), hero: null, cap: s.kept ? capOf(ctx, t, s.kept.input) : undefined, grade: s.kept?.input.grade, kept: s.kept ? keptText(t, s.kept) : undefined,
        more: [], subs: s.kept ? gameSubs(ctx.idx, s.kept.input.subs) : undefined };
    }
    case 3: {
      const tg = s.target;
      // a worn target is «Шлем Caren»; any other is named like a set-aside piece — by its hero and stats, no position
      const where = 'worn' in tg ? t.batch.btWorn(tg.slot, tg.worn.name) : desc(ctx, t, tg.where);
      const hero = 'worn' in tg ? tg.worn : tg.where.c;
      // the item of a worn weapon or accessory (armor: the title says it all; a set-aside target names it in the title)
      const cap = 'worn' in tg && s.piece ? capOf(ctx, t, s.piece) : '';
      // the feed, piece by piece: «Noblewoman's Guile · HP% · HP 3, …»; a taken-off or set-aside one — its description
      const mats = s.mats.map(({ where: w, input: x }) => ('n' in w ? <MatLine ctx={ctx} x={x} /> : <DescLine ctx={ctx} t={t} w={w} />));
      const unlock = s.unlock ? [t.batch.btUnlock(s.unlock)] : [];
      if (s.piece) return { title: t.batch.btStep(where, s.n), hero, more: unlock, bt: { piece: s.piece, n: s.n, mats } };
      return { title: t.batch.btStep(where, s.n), hero, cap, grade: undefined, more: [...unlock, t.batch.btFeed, ...mats.map((m, i) => <span key={i}>{m}</span>)] };
    }
    case 4: {
      // each piece on its own line, what it is — «Sublime Melody · HP% · SPD 1, CHC 2, …»; the locked ones first need unlocking
      const lines = s.where.map((w, i) => ('n' in w ? <PieceLine ctx={ctx} x={s.inputs[i]} /> : <DescLine ctx={ctx} t={t} w={w} />));
      return { title: t.batch.junkTitle(s.where.length), hero: null, more: [...(s.unlock ? [t.batch.btUnlock(s.unlock)] : []), ...lines, ...(s.left ? [t.batch.dzLeft] : [])] };
    }
  }
}

export function BatchWalk({ ctx, batch, plan, walk, what, onTick, onDone }: {
  ctx: Ctx; batch: Batch; plan: Plan; walk: Walk; what: string; onTick: (step: string) => void; onDone: () => void;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const c = plan.counts;
  const stages = [1, 2, 3, 4] as const;
  // the confirm: how many steps are not ticked (only when some are), what will be recorded, the undo hint — one paragraph
  const keys = new Set(walk.steps.map((x) => x.key));
  const open = walk.steps.length - batch.done.filter((k) => keys.has(k)).length;
  const ask = [open > 0 ? t.batch.recordUnticked(open, walk.steps.length) : '', t.batch.recordText(c.wear, c.keep), t.batch.recordUndo].filter(Boolean).join(' ');
  return (
    <div className="batch bwalk">
      <p className="muted small">{t.batch.walkNote(what)}</p>
      {stages.map((st) => {
        const steps = walk.steps.filter((s) => s.stage === st);
        if (!steps.length) return null;
        return (
          <section key={st} className="bstage">
            <h4>{t.batch.stages[st - 1]}</h4>
            {st === 3 && <p className="muted small">{t.batch.btNote}</p>}
            <ol className="bgear-list">
              {steps.map((s) => {
                const { title, hero, tail, no, cap, grade, kept, more, subs, bt } = stepText(ctx, t, s);
                const done = batch.done.includes(s.key);
                return (
                  <li key={s.key} className={`bgear-row bstep${done ? ' done' : ''}`}>
                    {/* the whole card is the checkbox's label: a tap anywhere ticks the step (a phone, a thumb) */}
                    <Toggle className="bstep-l" checked={done} label={title} onChange={() => onTick(s.key)}>
                      <span className="bstep-t">
                        <span className="bstep-h">
                          {no && <span className="bstep-no">{no}</span>}
                          <b>{tail ? <>{withHero(title.slice(0, title.length - tail.length), hero)}<span className={`gname ${grade === 'unique' ? 'legend' : 'epic'}`}>{tail}</span></> : withHero(title, hero)}</b>
                        </span>
                        {cap && <span className={`bstep-m gname ${grade === 'unique' ? 'legend' : 'epic'}`}>{cap}</span>}
                        {kept && <span className="bstep-k">{withHero(kept.text, kept.c)}</span>}
                        {more.map((m, i) => <span key={i} className="bstep-m">{m}</span>)}
                        {bt && <BtCard ctx={ctx} t={t} bt={bt} />}
                        {subs && <span className="bstep-subs">{subs.map((m) => <span key={m}>{m}</span>)}</span>}
                      </span>
                    </Toggle>
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
        <AskSheet title={t.batch.recordAsk} text={ask} yes={t.batch.recordYes} kind="batch-ask"
          onYes={() => { setAsking(false); onDone(); }} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}
