// The hero sheet of a team spot (.x/0171-team-suggest): first who fits the team — recommended together with its heroes in
// outerpedia's teams, and whose skills start working (owner 2026-10-11: outerpedia first); with an empty team — who is
// most often in outerpedia's teams. Below — everyone else by name. One name search for both.
import { useState } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import type { Synergy } from '@/game/data/types';
import type { Suggestion } from '@/game/synergy/suggest';
import { HeroPicker, heroMatches } from '@/features/roster/HeroPicker';
import { useT } from '@/i18n';
import { effectText } from './TeamReport';

const SHOWN = 6;

export function TeamPicker({ syn, fits, rest, emptyTeam, search, onPick }: {
  syn: Synergy; fits: Suggestion[]; rest: readonly string[]; emptyTeam: boolean; search: string; onPick: (id: string) => void;
}) {
  const t = useT();
  const idx = useIndex();
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const name = (id: string) => idx.CHAR[id]?.name ?? id;
  const found = fits.filter((f) => heroMatches(idx.CHAR[f.id], q));
  const shown = all || q ? found : found.slice(0, SHOWN);
  // a hero shown in «Подойдут» is not repeated below; one behind «ещё N» stays in the plain list
  const others = rest.filter((id) => !shown.some((f) => f.id === id) && heroMatches(idx.CHAR[id], q));
  const fixText = (f: Suggestion['fixes'][number]) => {
    const need = syn.heroes[f.hero]?.need?.find((x) => x.st === f.st);
    return t.team.fixLine(name(f.hero), effectText(t, [f.slot], need?.fx));
  };
  return (
    <div className="tm-pick">
      <input className="pick-q" type="search" value={q} placeholder={search} aria-label={search} onChange={(e) => setQ(e.target.value)} />
      {found.length > 0 && (
        <>
          <p className="tm-ph">{emptyTeam ? t.team.popularHead : t.team.fitHead}</p>
          <ul className="tm-fits">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" className="tm-fit" onClick={() => onPick(f.id)}>
                  <HeroFace c={idx.CHAR[f.id]} />
                  <span className="tm-fn"><HeroName c={idx.CHAR[f.id]} /></span>
                  {f.fixes.map((x) => <span key={x.hero + x.st} className="tm-fr fix">{fixText(x)}</span>)}
                  {f.with.length > 0 && <span className="tm-fr">{t.team.together(f.with.map((w) => t.team.togetherWith(name(w.id), w.n)).join(', '))}</span>}
                  {f.teams > 0 && <span className="tm-fr">{t.team.inTeams(f.teams)}</span>}
                </button>
              </li>
            ))}
          </ul>
          {!all && !q && found.length > SHOWN && (
            <button type="button" className="tm-more hit" onClick={() => setAll(true)}>{t.team.more(found.length - SHOWN)}</button>
          )}
          {others.length > 0 && <p className="tm-ph">{t.team.restHead}</p>}
        </>
      )}
      <HeroPicker ids={others} empty="" onPick={onPick} />
    </div>
  );
}
