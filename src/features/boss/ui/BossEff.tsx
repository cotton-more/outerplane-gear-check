// EFF vs the boss's RES under the team (.x/0200-boss stage D, owner: variant A + the chance in the same row): each member
// who needs EFF (rule R) — their EFF in battle (v: the card's number from features/worn effView, «≈» when an estimate, plus
// the element quirk node and a teammate's transcend team row — owner F1/F4, game/stat/eff battleBonus), the gap to RES + 1
// (EFF must be above RES) or ✓, and the chance the boss doesn't resist (game/stat/eff landChance). A member whose EE gives
// EFF and who typed nothing gets the hint to type it (Q3 detail 1). A row opens «Эфф для X» (TeamScreen). Nothing to show —
// nothing rendered.
import type { Char } from '@/game/data/types';
import { landChance } from '@/game/stat/eff';
import { HeroFace } from '@/game/hero/HeroFace';
import { useT } from '@/i18n';
import { EffNum, effX } from '@/features/worn/EffSheet';
import type { WornEff } from '@/features/worn/wearing';

export interface EffRow { c: Char; eff: WornEff; v: number }

export function BossEff({ rows, res, onOpen }: { rows: readonly EffRow[]; res: number; onOpen: (id: string) => void }) {
  const t = useT();
  if (!rows.length) return null;
  return (
    <section className="boss-eff" aria-label={t.boss.effHead(res)}>
      <h4>{t.boss.effHead(res)}</h4>
      {rows.map(({ c, eff, v }) => {
        const ok = v > res;
        const ee = c.eff?.ee && !eff.cal ? effX(t, (1000 + c.eff.ee) / 1000) : null;
        return (
          <button key={c.id} type="button" className="be-row" onClick={() => onOpen(c.id)}>
            <HeroFace c={c} />
            <span className="be-n">{c.name}</span>
            <span className="be-v"><EffNum shown={{ ...eff.shown, v }} /></span>
            <span className={`be-d ${ok ? 'ok' : 'lack'}`}>{ok ? '✓' : `−${res + 1 - v}`}</span>
            <span className="be-p">{Math.floor(landChance(v, res) * 100)} %</span>
            {ee && <span className="be-hint">{t.boss.effHint(ee)} <span aria-hidden="true">▸</span></span>}
          </button>
        );
      })}
      <p className="be-foot">{t.boss.effChance}</p>
    </section>
  );
}
