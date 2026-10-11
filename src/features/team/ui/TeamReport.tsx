// The team check's report (game/synergy checkTeam): only heroes with something to say (owner OK 2026-10-11, "less on
// screen"). Ok from an ally — one quiet line; ok from her own skill in time — nothing. ⚠ — the sentence and «Дадут:»
// heroes (HeroTag, «с ★N»), six shown, the rest behind «ещё N».
import { useState } from 'react';
import type { SkillSlot, Synergy } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroTag } from '@/game/hero/HeroTag';
import type { HeroReport, NeedReport } from '@/game/synergy/check';
import { useT, type Texts } from '@/i18n';
import { Rich } from '@/shared/ui/Rich';
import { MiniStars } from './Stars';

const FIX_SHOWN = 6;

// status name: ours (ru/en lists), else the game's English one from the data — never empty
export const statusName = (t: Texts, syn: Synergy, st: string) => t.team.status[st] ?? syn.statuses[st]?.en ?? st;

function skills(t: Texts, slots: readonly SkillSlot[]): string {
  const n = slots.map((s) => t.team.slot[s]);
  return n.length > 1 ? t.team.and(n.slice(0, -1).join(', '), n[n.length - 1]) : n[0];
}

// the ⚠ sentence of a need that is not ok
export function warnText(t: Texts, syn: Synergy, n: NeedReport): string {
  const s = statusName(t, syn, n.st), k = skills(t, n.slots);
  if (n.verdict === 'none') return n.on === 'enemy' ? t.team.noneEnemy(s, k) : t.team.none(s, k);
  return n.own!.slot === 'burst' ? t.team.selfBurst(s, k) : t.team.selfOnly(s, k, t.team.slot[n.own!.slot], n.own!.cd);
}

function Warn({ syn, n }: { syn: Synergy; n: NeedReport }) {
  const t = useT();
  const idx = useIndex();
  const [all, setAll] = useState(false);
  const fix = all ? n.fix : n.fix.slice(0, FIX_SHOWN);
  return (
    <div className="tm-warn">
      <p><span className="tm-w" aria-hidden="true">⚠</span> <Rich text={warnText(t, syn, n)} /></p>
      {fix.length > 0 && (
        <p className="tm-fix">
          <span className="muted">{t.team.fixHead}</span>
          {fix.map((f) => (
            <span key={f.id} className="tm-fx"><HeroTag c={idx.CHAR[f.id]} />{f.star > 1 && <> <span className="tm-from">{t.team.from(f.star)}</span></>}</span>
          ))}
          {!all && n.fix.length > FIX_SHOWN && (
            <button type="button" className="tm-more hit" onClick={() => setAll(true)}>{t.team.more(n.fix.length - FIX_SHOWN)}</button>
          )}
        </p>
      )}
    </div>
  );
}

export function TeamReport({ syn, report, starOf }: { syn: Synergy; report: HeroReport[]; starOf: (id: string) => number }) {
  const t = useT();
  const idx = useIndex();
  const heroes = report
    .map((h) => ({ ...h, needs: h.needs.filter((n) => n.verdict !== 'ok' || n.by.length > 0) }))
    .filter((h) => h.needs.length > 0);
  if (!heroes.length) return null;
  return (
    <div className="tm-rep">
      {heroes.map((h) => {
        const c = idx.CHAR[h.id];
        return (
          <section key={h.id} className="tm-hero">
            <h3><HeroFace c={c} /><span>{c.name}</span><MiniStars n={starOf(h.id)} /></h3>
            {h.needs.map((n) => (n.verdict === 'ok'
              ? <p key={n.on + n.st} className="tm-ok">✓ {t.team.ok(statusName(t, syn, n.st), n.by.map((id) => idx.CHAR[id]?.name ?? id).join(', '))}</p>
              : <Warn key={n.on + n.st} syn={syn} n={n} />))}
          </section>
        );
      })}
    </div>
  );
}
