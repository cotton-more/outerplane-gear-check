// «Ход против босса» under the team (.x/0200-boss E1, owner 2026-10-13: one column instead of «Эфф против RES»): a turn
// line on the left with a stopwatch on top; the team and the boss in the order of the first turn (model/turn: the start
// gauge with its hidden head start — above the boss surely first, dashed — luck with its chance, grey — after; only the
// first turn). A row: face, name, SPD (the Speed Set's icon; game/stat/spd — what the app knows) and, for a hero who needs
// EFF (rule R), EFF in battle and the chance the debuff lands (game/stat/eff landChance; ✓ above RES). A tap expands the
// row: EFF short of RES + 1, the SPD that surely moves first, «Эфф из игры» → the EFF sheet (TeamScreen), with the EE hint
// until the game's number is typed (Q3 detail 1). The boss — a red row in its place with SPD and RES.
// E4 (owner 2026-10-13): SPD counts the allies' transcend bonus (Q6; «(+10 трансценд союзников)» in the expanded row); the
// expanded row says SPD first, then — for a member whose turn-1 skill acts on the boss or shields the team — why moving first
// matters and the SPD for it (Q1, Q7), and «не догнать» when even the fastest kit from the gear gives no chance (Q5); the
// others get the state alone, no «нужно …».
import { useState } from 'react';
import type { Boss, Char, TurnReason } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { ElementIcon, Icon, SetIcon, StatIcon } from '@/game/icons/Img';
import { HeroFace } from '@/game/hero/HeroFace';
import { landChance } from '@/game/stat/eff';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import { effX } from '@/features/worn/EffSheet';
import type { WornEff } from '@/features/worn/wearing';
import { luckPct, timeline, type TurnRow } from '../model/turn';

// a member: SPD in the turn order (the app's count + bonus, the allies' transcend); why — the turn-1 reasons that work on this
// boss (none — no reason to move first); reach — the most SPD a kit gives (+ bonus) when it gives no chance, else null: with
// builds from the team trade's own candidates, without — from every piece he could wear (the screen decides); eff — null for
// a hero who doesn't need EFF; v — EFF in battle against this boss
export interface TurnHero { c: Char; spd: number; bonus: number; why: readonly TurnReason[]; reach: number | null; eff: WornEff | null; v: number }

export function BossTurn({ heroes, boss, spd, res, onEff }: {
  heroes: readonly TurnHero[]; boss: Boss; spd: number; res: number; onEff: (id: string) => void;
}) {
  const t = useT();
  const idx = useIndex();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  if (!heroes.length) return null;
  const speed = Object.values(idx.SET).find((s) => s.short === 'Speed');
  const line = timeline(heroes.map((h) => ({ hero: h, spd: h.spd })), spd);
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (!n.delete(id)) n.add(id); return n; });
  const luck = [...line.before, ...line.after].some((r) => r.turn.state === 'luck');
  const debuff = heroes.some((h) => h.eff);

  const spdText = (h: TurnHero, turn: TurnRow<TurnHero>['turn']) => {
    const s = t.boss.turnSpd(h.spd, h.bonus);
    if (turn.state === 'first') return t.boss.turnSpdFirst(s);
    if (!h.why.length) return turn.state === 'luck' ? t.boss.turnSpdLuckOther(s) : t.boss.turnSpdAfterOther(s);
    return turn.state === 'luck' ? t.boss.turnSpdLuck(s, h.spd, turn.need) : t.boss.turnSpdAfter(s, h.spd, turn.need);
  };
  const row = ({ hero: h, turn }: TurnRow<TurnHero>) => {
    const { c, eff, v } = h;
    const on = open.has(c.id);
    const lands = eff ? Math.floor(landChance(v, res) * 100) : 0;
    const shown = eff ? `${eff.shown.approx ? '≈ ' : ''}${v}` : '';
    const ee = eff && c.eff?.ee && !eff.cal ? effX(t, (1000 + c.eff.ee) / 1000) : null;
    return (
      <li key={c.id} className={`bt-li ${turn.state}`}>
        <button type="button" className="bt-row" aria-expanded={on} onClick={() => toggle(c.id)}>
          <HeroFace c={c} />
          <span className="bt-n">{c.name}</span>
          <span className="bt-st">
            <span className="bt-s"><SetIcon set={speed} />{h.spd}</span>
            {eff && <span className="bt-s"><StatIcon stat="EFF" />{shown}</span>}
          </span>
          <span className="bt-bd">
            {turn.state === 'luck' && (
              <span className="bt-b lack" aria-label={t.boss.turnFirstAria(luckPct(turn.p))}><Icon name="stopwatch" /><span className="bt-bw">{t.boss.turnFirstWord} </span>{luckPct(turn.p)}%</span>
            )}
            {eff && (
              <span className={`bt-b ${v > res ? 'ok' : 'lack'}`} aria-label={t.boss.turnDebAria(lands)}>
                <StatIcon stat="EFF" />{v > res ? '✓ ' : ''}{lands}%
              </span>
            )}
          </span>
        </button>
        {on && (
          <div className="bt-x">
            <p>{spdText(h, turn)}</p>
            {h.why.length > 0 && <p className="bt-why">{t.boss.turnWhy(h.why.slice(0, 2).map((r) => `${r.s.toUpperCase()} ${t.boss.turnReason[r.k]}`).join(', '))}</p>}
            {h.reach !== null && <p className="bt-far">{t.boss.turnFar(h.reach)}</p>}
            {eff && <p>{v > res ? t.boss.turnEffOk(shown) : t.boss.turnEffShort(shown, res + 1 - v)}</p>}
            {eff && (
              <button type="button" className="linkbtn bt-eff" onClick={() => onEff(c.id)}>
                {ee ? t.boss.effHint(ee) : t.boss.turnEffOpen} <span aria-hidden="true">▸</span>
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section className="boss-turn" aria-labelledby="bt-head" {...tour('teamTurn')}>
      <h4 className="bt-h" id="bt-head"><Icon name="stopwatch" />{t.boss.turnHead}</h4>
      <ol className="bt-list">
        {line.before.map(row)}
        <li className="bt-li boss">
          <span className="sr-only">{t.boss.turnBossAria(boss.name, spd, res)}</span>
          <div className="bt-row" aria-hidden="true">
            <ElementIcon el={boss.element} />
            <span className="bt-n">{boss.name}</span>
            <span className="bt-st">
              <span className="bt-s"><SetIcon set={speed} />{spd}</span>
              <span className="bt-s"><StatIcon stat="RES" />RES {res}</span>
            </span>
          </div>
        </li>
        {line.after.map(row)}
      </ol>
      <p className="bt-foot">
        {t.boss.turnFootOrder}
        {luck && <> <Icon name="stopwatch" /> {t.boss.turnFootLuck}</>}
        {debuff && <> <StatIcon stat="EFF" /> {t.boss.turnFootDeb}</>}
      </p>
    </section>
  );
}
