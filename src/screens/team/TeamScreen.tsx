// «Команда» (.x/0170-team-synergy): up to four roster heroes with their transcend ★ → which skill conditions depend on a
// status nobody in the team gives, and who from the roster would give it (game/synergy checkTeam). Nothing is saved
// (owner decision 5): the team lives while the page is open — the tab is hidden, not unmounted; a reload forgets it.
import { useMemo, useState } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { checkTeam, type TeamMember } from '@/game/synergy/check';
import { compareChars } from '@/features/roster/charFilter';
import { HeroPicker } from '@/features/roster/HeroPicker';
import { StarPick } from '@/features/team/ui/Stars';
import { TeamReport } from '@/features/team/ui/TeamReport';
import { TeamSlots } from '@/features/team/ui/TeamSlots';
import { useT } from '@/i18n';
import { Notice } from '@/shared/ui/Notice';

const RANK = ['S', 'A', 'B', 'C', 'D', 'E'];
const STAR0 = 6; // a picked hero starts at ★6 (owner decision 3)

export function TeamScreen({ roster, off, onChars }: { roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>; onChars: () => void }) {
  const t = useT();
  const idx = useIndex();
  const syn = idx.D.synergy;
  const [team, setTeam] = useState<(TeamMember | null)[]>([null, null, null, null]);
  const [sel, setSel] = useState<number | null>(null);
  // the roster without heroes replaced by their Core Fusion
  const mine = useMemo(() => roster.filter((id) => idx.CHAR[id] && !off.has(id)), [roster, idx, off]);
  const members = team.filter((m): m is TeamMember => !!m);
  const report = useMemo(() => {
    if (!syn) return [];
    const rank = (id: string) => { const r = RANK.indexOf(idx.CHAR[id]?.rank ?? ''); return r < 0 ? RANK.length : r; };
    return checkTeam(syn, members, mine, rank);
  }, [syn, team, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!syn) return <div className="panel tm"><p className="muted">{t.team.noData}</p></div>;
  if (!mine.length) return <div className="panel tm"><Notice text={t.team.empty} action={t.team.emptyGo} onAction={onChars} /></div>;

  const cur = sel === null ? null : team[sel];
  const put = (i: number, m: TeamMember | null) => setTeam((x) => x.map((y, j) => (j === i ? m : y)));
  const pickable = mine.filter((id) => !members.some((m) => m.id === id))
    .sort((a, b) => compareChars(idx.CHAR[a], idx.CHAR[b]));
  return (
    <div className="panel tm">
      <TeamSlots team={team} sel={sel} onSlot={(i) => setSel(sel === i ? null : i)} />
      {sel !== null && cur && (
        <StarPick name={idx.CHAR[cur.id].name} star={cur.star} onStar={(n) => put(sel, { ...cur, star: n })}
          onRemove={() => { put(sel, null); setSel(null); }} />
      )}
      {sel !== null && !cur && (
        <HeroPicker ids={pickable} title={t.team.pick} empty="" search={t.team.search} onPick={(id) => put(sel, { id, star: STAR0 })} />
      )}
      {!members.length && sel === null && <p className="tm-hint muted">{t.team.hint}</p>}
      <TeamReport syn={syn} report={report} starOf={(id) => members.find((m) => m.id === id)?.star ?? STAR0} />
    </div>
  );
}
