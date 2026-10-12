// «Команда» (.x/0170-team-synergy): up to four roster heroes with their transcend ★ → which skill conditions depend on a
// status nobody in the team gives, and who from the roster would give it (game/synergy checkTeam). The ★ come from the
// hero's card and are changed only there (owner 2026-10-12): a spot can try higher ★ («what if» — counted in the report,
// kept in the spot only, never saved), not lower than the card's; not set — the hero's minimum (game/hero/star).
// Picking a hero and setting ★ — sheets, like the other pickers in the app (owner 2026-10-11).
// A boss on top (.x/0200-boss stage C, owner Q2): the boss row → its sheet (stage, RES, immunities, guide); with a boss
// the guide's teams for the stage replace the general suggestions and «Собрать из гайда» fills the spots. The team is
// kept per boss and without one in 'ogc.boss' (owner D5; before — React state only, lost on reload).
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
import { bossOf, factsAt, fillFrom, fitStage, spotAlternatives, teamsAt, type Fill } from '@/features/boss/model/boss';
import { NO_BOSS } from '@/features/boss/model/stored';
import { useBossStore } from '@/features/boss/useBossStore';
import { BossRow } from '@/features/boss/ui/BossRow';
import { BossSheet } from '@/features/boss/ui/BossSheet';
import { GuideChoice } from '@/features/boss/ui/GuideChoice';
import { useT } from '@/i18n';
import { AlphaMark } from '@/shared/ui/AlphaMark';
import { Notice } from '@/shared/ui/Notice';
import { Sheet } from '@/shared/ui/Sheet';
import { Toast } from '@/shared/ui/Toast';
import { useTimed } from '@/shared/useTimed';

const RANK = ['S', 'A', 'B', 'C', 'D', 'E'];
const NONE: (string | null)[] = [null, null, null, null];
// a spot: the hero and the ★ tried here (none — the card's)
interface Spot { id: string; want?: number }
// the message after «Собрать из гайда»; undo — the team before it (none — nothing changed)
interface Filled { text: string; key: string; undo?: (string | null)[] }

export function TeamScreen({ roster, off, stars, onChars }: {
  roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>; stars: Readonly<Record<string, number>>;
  onChars: () => void;
}) {
  const t = useT();
  const idx = useIndex();
  const syn = idx.D.synergy;
  const B = idx.D.bosses;
  const [store, update] = useBossStore();
  const [wants, setWants] = useState<Record<string, number>>({}); // «key|spot|hero» → ★ tried there (this session)
  const [picking, setPicking] = useState<number | null>(null); // spot whose hero list is open
  const [starring, setStarring] = useState<number | null>(null); // spot whose stars sheet is open
  const [bossAt, setBossAt] = useState<number | null>(null); // the boss sheet is open (when it was opened — «идёт сейчас»)
  const [choosing, setChoosing] = useState(false); // «Какую команду из гайда?»
  const [filled, setFilled] = useTimed<Filled>(6000);
  // the roster without heroes replaced by their Core Fusion
  const mine = useMemo(() => roster.filter((id) => idx.CHAR[id] && !off.has(id)), [roster, idx, off]);
  const mineSet = useMemo(() => new Set(mine), [mine]);

  const boss = B ? bossOf(B, store.boss) : null;
  const key = boss?.key ?? NO_BOSS;
  const stage = B && boss ? fitStage(B, boss, store.stage[boss.key]) : 0;
  const facts = B && boss ? factsAt(B, boss, stage) : null;
  const guideTeams = boss ? teamsAt(boss, stage) : [];
  // the stored team of this boss; a hero who left the roster (or became Core Fusion) leaves the spot empty
  const ids = (store.teams[key] ?? NONE).map((id) => (id && mineSet.has(id) ? id : null));
  const team: (Spot | null)[] = ids.map((id, i) => (id ? { id, want: wants[`${key}|${i}|${id}`] } : null));

  // the hero's ★ on the card; the spot's — the card's or the higher one tried here
  const cardStar = (id: string) => heroStar(idx.CHAR[id] ?? { rarity: null }, stars[id]);
  const starOf = (m: Spot) => Math.max(cardStar(m.id), m.want ?? 0);
  const members: TeamMember[] = team.filter((m): m is Spot => !!m).map((m) => ({ id: m.id, star: starOf(m) }));
  const rank = (id: string) => { const r = RANK.indexOf(idx.CHAR[id]?.rank ?? ''); return r < 0 ? RANK.length : r; };
  const report = useMemo(() => (syn ? checkTeam(syn, members, mine, rank) : []), [syn, store, wants, stars, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  // the hero sheet: with a boss — the guide's heroes for this spot; else (or none for it) who fits the rest of the team
  // (the spot being picked does not count — its hero is being replaced)
  const guide = useMemo(() => {
    if (picking === null || !guideTeams.length) return null;
    const alts = spotAlternatives(guideTeams, picking).filter((id) => idx.CHAR[id]);
    const own = alts.filter((id) => mineSet.has(id) && !members.some((m) => m.id === id));
    const lack = alts.filter((id) => !mineSet.has(id)).map((id) => idx.CHAR[id].name);
    return own.length || lack.length ? { ids: own, note: lack.length ? t.boss.notOwned(lack.join(', ')) : null } : null;
  }, [picking, store, mineSet, idx, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const fits = useMemo(() => {
    if (picking === null || guide) return [];
    const others = members.filter((m) => m.id !== team[picking]?.id);
    return suggest(syn, idx.D.teams, others, mine.filter((id) => !members.some((m) => m.id === id)), rank, cardStar);
  }, [picking, guide, store, wants, stars, syn, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!syn) return <div className="panel tm"><p className="muted">{t.team.noData}</p></div>;
  if (!mine.length) return <div className="panel tm"><Notice text={t.team.empty} action={t.team.emptyGo} onAction={onChars} /></div>;

  const saveTeam = (k: string, next: (string | null)[]) => update((s) => ({ ...s, teams: { ...s.teams, [k]: next } }));
  // a spot gets another hero or none: the ★ tried there go (the next hero enters with the card's)
  const put = (i: number, id: string | null) => {
    setWants((w) => Object.fromEntries(Object.entries(w).filter(([k]) => !k.startsWith(`${key}|${i}|`))));
    saveTeam(key, ids.map((x, j) => (j === i ? id : x)));
  };
  const fill = (f: Fill) => {
    setChoosing(false);
    if (!f.have) { setFilled({ text: t.boss.noneOwned, key }); return; }
    setFilled({ text: t.boss.filled(f.have, f.of), key, undo: ids });
    saveTeam(key, f.team);
  };
  const onFill = () => (guideTeams.length > 1 ? setChoosing(true) : fill(fillFrom(guideTeams[0], mineSet)));
  const undoFill = () => { if (filled?.undo) saveTeam(filled.key, filled.undo); setFilled(null); };

  const pickable = mine.filter((id) => !members.some((m) => m.id === id))
    .sort((a, b) => compareChars(idx.CHAR[a], idx.CHAR[b]));
  const starred = starring === null ? null : team[starring];
  const shown = team.map((m) => m && { id: m.id, star: starOf(m) });
  return (
    <div className="panel tm">
      {B && <BossRow boss={boss} facts={facts} onOpen={() => setBossAt(Date.now())} />}
      <TeamSlots team={shown} onPick={setPicking} onStars={setStarring} onRemove={(i) => put(i, null)} />
      {guideTeams.length > 0 && <button type="button" className="boss-fill" onClick={onFill}>{t.boss.fill}</button>}
      {!members.length && !guideTeams.length && <p className="tm-hint muted">{t.team.hint}</p>}
      <TeamReport syn={syn} report={report} starOf={(id) => members.find((m) => m.id === id)?.star ?? cardStar(id)} />
      <p className="tm-alpha muted small"><AlphaMark /> {t.team.alphaHint}</p>
      {picking !== null && (
        <Sheet title={t.team.pick} onClose={() => setPicking(null)} className="tm-sheet">
          <TeamPicker syn={syn} fits={fits} guide={guide && { head: t.boss.fromGuide, ...guide }} rest={pickable}
            emptyTeam={!members.some((m) => m.id !== team[picking]?.id)} search={t.team.search}
            onPick={(id) => { put(picking, id); setPicking(null); }} />
        </Sheet>
      )}
      {starring !== null && starred && (
        <StarSheet c={idx.CHAR[starred.id]} star={starOf(starred)} min={cardStar(starred.id)} onClose={() => setStarring(null)}
          onStar={(n) => { setWants((w) => ({ ...w, [`${key}|${starring}|${starred.id}`]: n })); setStarring(null); }} />
      )}
      {B && bossAt !== null && (
        <BossSheet B={B} boss={boss} stage={stage} now={bossAt} onClose={() => setBossAt(null)}
          onPick={(k) => update((s) => ({ ...s, boss: k }))}
          onStage={(i) => boss && update((s) => ({ ...s, stage: { ...s.stage, [boss.key]: i } }))}
          onClear={() => { update((s) => ({ ...s, boss: null })); setBossAt(null); }} />
      )}
      {choosing && <GuideChoice teams={guideTeams} owned={mineSet} onPick={fill} onClose={() => setChoosing(false)} />}
      {filled && <Toast className="boss-toast" text={filled.text} action={t.ui.undoAction} onAction={filled.undo ? undoFill : undefined} />}
    </div>
  );
}
