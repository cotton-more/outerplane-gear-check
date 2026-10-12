// «Какую команду из гайда?» — a stage with several guide teams (guild raid: 4–6). A row per team: on each guide spot
// the hero «Собрать» would put (faded — the first alternative, nobody owned), «есть 2 из 4», who is missing. A team
// with nobody owned can't be picked.
import type { BossTeam } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { HeroFace } from '@/game/hero/HeroFace';
import { useT } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { fillFrom, type Fill } from '../model/boss';

export function GuideChoice({ teams, owned, onPick, onClose }: {
  teams: readonly BossTeam[]; owned: Pick<ReadonlySet<string>, 'has'>; onPick: (f: Fill) => void; onClose: () => void;
}) {
  const t = useT();
  const idx = useIndex();
  const name = (id: string) => idx.CHAR[id]?.name ?? id;
  return (
    <Sheet title={t.boss.chooseTeam} onClose={onClose} className="boss-choice">
      <ul className="boss-tc">
        {teams.map((team, i) => {
          const f = fillFrom(team, owned);
          return (
            <li key={i}>
              <button type="button" disabled={!f.have} onClick={() => onPick(f)}>
                <span className="boss-tf" aria-hidden="true">
                  {team.s.slice(0, 4).map((alts, j) => {
                    const id = f.team[j] ?? alts[0];
                    const c = id ? idx.CHAR[id] : undefined;
                    return c ? <span key={j} className={f.team[j] ? '' : 'no'}><HeroFace c={c} /></span> : <i key={j} />;
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
