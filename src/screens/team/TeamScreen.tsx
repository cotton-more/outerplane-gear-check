// «Команда» (.x/0170-team-synergy): up to four roster heroes with their transcend ★ → which skill conditions depend on a
// status nobody in the team gives, and who from the roster would give it (game/synergy checkTeam). The team itself is not
// saved (owner decision 5): it lives while the page is open — the tab is hidden, not unmounted; a reload forgets it. The ★
// come from the hero's card and are changed only there (owner 2026-10-12): a spot can try higher ★ («what if» — counted in
// the report, kept in the spot only, never saved), not lower than the card's; not set — the hero's minimum (game/hero/star).
// Picking a hero and setting ★ — sheets, like the other pickers in the app (owner 2026-10-11).
import { useMemo, useState } from 'react';
import { useIndex } from '@/game/data/IndexContext';
import { checkTeam, type TeamMember } from '@/game/synergy/check';
import { suggest } from '@/game/synergy/suggest';
import { compareChars } from '@/features/roster/charFilter';
import { StarSheet } from '@/game/hero/Stars';
import { heroStar } from '@/game/hero/star';
import { TeamPicker } from '@/features/team/ui/TeamPicker';
import { TeamReport } from '@/features/team/ui/TeamReport';
import { TeamSlots } from '@/features/team/ui/TeamSlots';
import { useT } from '@/i18n';
import { AlphaMark } from '@/shared/ui/AlphaMark';
import { Notice } from '@/shared/ui/Notice';
import { Sheet } from '@/shared/ui/Sheet';

const RANK = ['S', 'A', 'B', 'C', 'D', 'E'];
// a spot: the hero and the ★ tried here (none — the card's)
interface Spot { id: string; want?: number }

export function TeamScreen({ roster, off, stars, onChars }: {
  roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>; stars: Readonly<Record<string, number>>;
  onChars: () => void;
}) {
  const t = useT();
  const idx = useIndex();
  const syn = idx.D.synergy;
  const [team, setTeam] = useState<(Spot | null)[]>([null, null, null, null]);
  const [picking, setPicking] = useState<number | null>(null); // spot whose hero list is open
  const [starring, setStarring] = useState<number | null>(null); // spot whose stars sheet is open
  // the roster without heroes replaced by their Core Fusion
  const mine = useMemo(() => roster.filter((id) => idx.CHAR[id] && !off.has(id)), [roster, idx, off]);
  // the hero's ★ on the card; the spot's — the card's or the higher one tried here
  const cardStar = (id: string) => heroStar(idx.CHAR[id] ?? { rarity: null }, stars[id]);
  const starOf = (m: Spot) => Math.max(cardStar(m.id), m.want ?? 0);
  const members: TeamMember[] = team.filter((m): m is Spot => !!m).map((m) => ({ id: m.id, star: starOf(m) }));
  const rank = (id: string) => { const r = RANK.indexOf(idx.CHAR[id]?.rank ?? ''); return r < 0 ? RANK.length : r; };
  const report = useMemo(() => (syn ? checkTeam(syn, members, mine, rank) : []), [syn, team, stars, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  // the hero sheet: who fits the rest of the team (the spot being picked does not count — its hero is being replaced)
  const fits = useMemo(() => {
    if (picking === null) return [];
    const others = members.filter((m) => m.id !== team[picking]?.id);
    return suggest(syn, idx.D.teams, others, mine.filter((id) => !members.some((m) => m.id === id)), rank, cardStar);
  }, [picking, team, stars, syn, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!syn) return <div className="panel tm"><p className="muted">{t.team.noData}</p></div>;
  if (!mine.length) return <div className="panel tm"><Notice text={t.team.empty} action={t.team.emptyGo} onAction={onChars} /></div>;

  const put = (i: number, m: Spot | null) => setTeam((x) => x.map((y, j) => (j === i ? m : y)));
  const pickable = mine.filter((id) => !members.some((m) => m.id === id))
    .sort((a, b) => compareChars(idx.CHAR[a], idx.CHAR[b]));
  const starred = starring === null ? null : team[starring];
  const shown = team.map((m) => m && { id: m.id, star: starOf(m) });
  return (
    <div className="panel tm">
      <TeamSlots team={shown} onPick={setPicking} onStars={setStarring} onRemove={(i) => put(i, null)} />
      {!members.length && <p className="tm-hint muted">{t.team.hint}</p>}
      <TeamReport syn={syn} report={report} starOf={(id) => members.find((m) => m.id === id)?.star ?? cardStar(id)} />
      <p className="tm-alpha muted small"><AlphaMark /> {t.team.alphaHint}</p>
      {picking !== null && (
        <Sheet title={t.team.pick} onClose={() => setPicking(null)} className="tm-sheet">
          <TeamPicker syn={syn} fits={fits} rest={pickable} emptyTeam={!members.some((m) => m !== team[picking])} search={t.team.search}
            onPick={(id) => { put(picking, { id }); setPicking(null); }} />
        </Sheet>
      )}
      {starring !== null && starred && (
        <StarSheet c={idx.CHAR[starred.id]} star={starOf(starred)} min={cardStar(starred.id)} onClose={() => setStarring(null)}
          onStar={(n) => { put(starring, { ...starred, want: n }); setStarring(null); }} />
      )}
    </div>
  );
}
