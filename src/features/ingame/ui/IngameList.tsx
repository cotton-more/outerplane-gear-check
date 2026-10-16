// «Надеть в игре» (HISTORY.md 0230, TEXTS N): the promises «Надеть» recorded and the game doesn't have yet — by hero, a line
// per slot as the batch walk's equip step draws it (the slot, the piece, the game panel's substats), and under it what the
// game does with the piece it takes off. The whole line is a label of its tick: a tap = done in the game, the line goes
// (the page says it in a message with «Вернуть»). No lines — nothing drawn (no empty state).
import type { Ctx } from '@/game/context';
import { HeroFace } from '@/game/hero/HeroFace';
import { ClassIcon } from '@/game/icons/Img';
import { HeroName, heroName } from '@/game/hero/HeroName';
import { useT } from '@/i18n';
import { Toggle } from '@/shared/ui/Toggle';
import { tour } from '@/tour/anchors';
import { gameSubs, gradeTone, PieceName } from '@/features/gear/ui/pieceText';
import type { Section } from '../ingame';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// the sections, nothing around them: the desktop panel and the phone sheet both hold it
export function IngameBody({ ctx, sections, onTick }: { ctx: Ctx; sections: readonly Section[]; onTick: (id: string) => void }) {
  const t = useT();
  return (
    <div className="batch ig-body">
      {sections.map(({ hero, lines }) => {
        const c = ctx.idx.CHAR[hero];
        return (
          <section key={hero} className="bstage ig-hero" aria-label={heroName(ctx.idx, hero)}>
            <h4 className="parked-h">{c && <HeroFace c={c} />}{c ? <HeroName c={c} /> : <span>{hero}</span>}{c && <ClassIcon cls={c.class} el={c.element} />}</h4>
            <ol className="bgear-list">
              {lines.map(({ line, now }) => {
                const word = cap(t.ui.slotNom[line.slot]);
                const tone = gradeTone(now.grade);
                return (
                  <li key={line.id} className="bgear-row bstep">
                    <Toggle className="bstep-l" checked={false} label={`${t.ingame.tick}: ${word}`} onChange={() => onTick(line.id)}>
                      <span className="bstep-t">
                        <span className="bstep-h"><b>{word}</b></span>
                        <span className={`bstep-m gname ${tone} ig-piece`}><PieceName ctx={ctx} p={now} /></span>
                        <span className="bstep-subs">
                          {gameSubs(ctx.idx, now.lit).map((m) => {
                            const i = m.lastIndexOf(' ');
                            return <span key={m}><span>{m.slice(0, i)}</span>{' '}<span className="sv">{m.slice(i + 1)}</span></span>;
                          })}
                        </span>
                        {line.off && <span className="bstep-m ig-fate">{line.off === 'lock' ? t.ingame.lock : t.ingame.feed}</span>}
                        {line.fed?.map((f) => <span key={f.snap.id} className="bstep-m ig-fate">{t.ingame.fed(heroName(ctx.idx, f.hero))}</span>)}
                      </span>
                    </Toggle>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

// the desktop panel under the form (left column): heading N1 and the sections; n — the count
export function IngameList({ ctx, sections, n, onTick }: { ctx: Ctx; sections: readonly Section[]; n: number; onTick: (id: string) => void }) {
  const t = useT();
  if (!n) return null;
  return (
    <aside className="panel ig-panel" id="ingame" aria-label={t.ingame.title(n)} {...tour('ingame')}>
      <h3 className="ig-h">{t.ingame.title(n)}</h3>
      <IngameBody ctx={ctx} sections={sections} onTick={onTick} />
    </aside>
  );
}
