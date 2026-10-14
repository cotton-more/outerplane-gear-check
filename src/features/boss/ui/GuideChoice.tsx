// «Какую команду из гайда?» — a stage with several guide teams (guild raid: 4–6). A row per team: on each guide spot
// the hero «Собрать» would put (a Core Fusion for its base hero; faded — the first alternative, nobody owned), «есть 2 из 4», who is missing. A team
// with nobody owned can't be picked. A singularity pool team (HISTORY.md 0208): its name on top («Огонь», «Горение», «Mero»),
// the four «Собрать» would put from its groups, then the first heroes of the groups nobody owns (faded).
import type { BossTeam, BossTeamLabel } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { fillFrom, type Fill, type Own } from '../model/boss';

export function GuideChoice({ teams, own, onPick, onClose }: {
  teams: readonly BossTeam[]; own: Own; onPick: (f: Fill) => void; onClose: () => void;
}) {
  const t = useT();
  const idx = useIndex();
  const name = (id: string) => idx.CHAR[id]?.name ?? id;
  const label = (l: BossTeamLabel) => ('e' in l ? t.boss.teamEl[l.e] ?? l.e : 'x' in l ? t.team.status[l.x] ?? l.x : name(l.h));
  return (
    <Sheet title={t.boss.chooseTeam} onClose={onClose} className="boss-choice">
      <ul className="boss-tc">
        {teams.map((team, i) => {
          const f = fillFrom(team, own);
          // a pool fills the spots in order: the heroes it puts, then the groups nobody owns
          const shown = team.p ? [...f.team.slice(0, f.have), ...f.missing] : team.s.slice(0, 4).map((alts, j) => f.team[j] ?? alts[0]);
          return (
            <li key={i}>
              <button type="button" disabled={!f.have} onClick={() => onPick(f)}>
                {team.l && <b className="boss-tl">{label(team.l)}</b>}
                <span className="boss-tf" aria-hidden="true">
                  {shown.map((id, j) => {
                    const c = id ? idx.CHAR[id] : undefined;
                    const mine = team.p ? j < f.have : !!f.team[j];
                    return c ? <span key={j} className={mine ? '' : 'no'}><HeroFace c={c} /></span> : <i key={j} />;
                  })}
                </span>
                <span className="sr-only">{f.team.filter((id): id is string => !!id).map(name).join(', ')}</span>
                <span className={`boss-th${f.have === f.of ? ' full' : ''}`}>{t.boss.have(f.have, f.of)}</span>
                {f.missing.length > 0 && <span className="boss-tm">{t.boss.missing(f.missing.map(name).join(', '))}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
