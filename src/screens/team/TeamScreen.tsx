// «Команда» (.x/0170-team-synergy): up to four roster heroes with their transcend ★ → which skill conditions depend on a
// status nobody in the team gives, and who from the roster would give it (game/synergy checkTeam). The ★ come from the
// hero's card and are changed only there (owner 2026-10-12): a spot can try higher ★ («what if» — counted in the report,
// kept in the spot only, never saved), not lower than the card's; not set — the hero's minimum (game/hero/star).
// Picking a hero and setting ★ — sheets, like the other pickers in the app (owner 2026-10-11).
// A boss on top (.x/0200-boss stage C, owner Q2): the boss row → its sheet (stage, RES, immunities, guide); with a boss
// the guide's teams for the stage replace the general suggestions and «Собрать из гайда» fills the spots; Core Fusion X
// stands in for X, which the guides list; a spot's guide heroes come from the teams matching the rest of the team. The team is
// kept per boss and without one in 'ogc.boss' (owner D5; before — React state only, lost on reload).
// With a boss, under the team — «Ход против босса» (.x/0200-boss E1, BossTurn): the members and the boss in the order of
// the first turn (SPD the app knows, game/stat/spd), and each member's EFF vs its RES (stage D); a row's «Эфф из игры»
// opens «Эфф для X» — the same sheet as the card's, the typed value is the hero's (GearStore.eff). EFF counts the spot's ★
// (like the report) and what battle adds (the element quirk node, a teammate's transcend team row).
// The team trade (.x/0200-boss E2, owner 2026-10-13): under each spot the hero's build (OrderPill; kept with the team in
// 'ogc.boss' — orders; a pin wins), «Подобрать вещи» → TeamTradeSheet for the 2–4 members with builds (one — the one-hero
// trade, App), a hero without builds stays out with a line. Worn gear is never kept with the team: the store as it is now.
// With a boss the trade also raises the EFF of members who need it (.x/0200-boss E3): goals from the boss's RES and the spots;
// and the SPD of members who should move before the boss (E4): a turn-1 skill that works on it, a chance to get there.
import { useMemo, useState } from 'react';
import type { Char } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { checkTeam, type TeamMember } from '@/game/synergy/check';
import { suggest } from '@/game/synergy/suggest';
import { compareChars } from '@/features/roster/charFilter';
import { StarSheet } from '@/game/hero/Stars';
import { heroStar } from '@/game/hero/star';
import { TeamPicker } from '@/features/team/ui/TeamPicker';
import { TeamReport } from '@/features/team/ui/TeamReport';
import { TeamSlots } from '@/features/team/ui/TeamSlots';
import { bossOf, factsAt, fillFrom, fitStage, ownOf, spotAlternatives, teamsAt, uniq, type Fill } from '@/features/boss/model/boss';
import { NO_BOSS } from '@/features/boss/model/stored';
import { useBossStore } from '@/features/boss/useBossStore';
import { BossRow } from '@/features/boss/ui/BossRow';
import { BossSheet } from '@/features/boss/ui/BossSheet';
import { GuideChoice } from '@/features/boss/ui/GuideChoice';
import { BossTurn, type TurnHero } from '@/features/boss/ui/BossTurn';
import { effView } from '@/features/worn/wearing';
import { battleBonus, inBattle } from '@/game/stat/eff';
import { spdBonus, spdOf, spdReach } from '@/game/stat/spd';
import { anyChance, firstAt, reasonsAt } from '@/features/boss/model/turn';
import { wearable } from '@/features/gear/model/vs';
import { EffSheet } from '@/features/worn/EffSheet';
import { setEff } from '@/features/gear/model/gear';
import type { GearApi } from '@/features/gear/store/useGear';
import type { GearStore } from '@/features/gear/model/gear';
import { OrderPill, OrderSheet, orderName } from '@/features/trade/ui/OrderSheet';
import { TeamTradeSheet, pinnedOrder } from '@/features/trade/ui/TeamTradeSheet';
import { tradeSpdReach } from '@/features/trade/model/reach';
import { STATS, worldOf } from '@/features/trade/model/world';
import { combosOf, pinOf } from '@/game/build/profile';
import { comboSig } from '@/game/build/variants';
import { comboText } from '@/game/build/builds';
import { tour } from '@/tour/anchors';
import type { Ctx } from '@/game/context';
import { useT } from '@/i18n';
import { AlphaMark } from '@/shared/ui/AlphaMark';
import { Notice } from '@/shared/ui/Notice';
import { Sheet } from '@/shared/ui/Sheet';
import { Toast } from '@/shared/ui/Toast';
import { useTimed } from '@/shared/useTimed';

const RANK = ['S', 'A', 'B', 'C', 'D', 'E'];
const LACK = 4; // «нет в ростере» names at most this many heroes, then «и ещё N»
const NONE: (string | null)[] = [null, null, null, null];
const NO_ORDERS: Readonly<Record<string, string>> = {};
// a spot: the hero and the ★ tried here (none — the card's)
interface Spot { id: string; want?: number }
// the message after «Собрать из гайда»; undo — the team before it (none — nothing changed)
interface Filled { text: string; key: string; undo?: (string | null)[] }

// canTrade — the trade is available (not during a tour, not on a newer page's gear); onHeroTrade — the one-hero trade for a
// lone member (App's sheet); onApplied — «Сделал»'s message with «Вернуть» (App)
export function TeamScreen({ roster, off, stars, ctx, gear, onChars, canTrade = false, onHeroTrade, onApplied }: {
  roster: readonly string[]; off: Pick<ReadonlySet<string>, 'has'>; stars: Readonly<Record<string, number>>;
  ctx: Ctx; gear: GearApi; onChars: () => void; canTrade?: boolean; onHeroTrade?: (id: string) => void;
  onApplied?: (text: string, undo: (st: GearStore) => GearStore | null) => void;
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
  const [effFor, setEffFor] = useState<string | null>(null); // the member whose «Эфф для X» is open
  const [orderFor, setOrderFor] = useState<string | null>(null); // the member whose build sheet is open
  const [trading, setTrading] = useState(false); // «Обмен для команды» is open
  const [filled, setFilled] = useTimed<Filled>(6000);
  // the roster without heroes replaced by their Core Fusion
  const mine = useMemo(() => roster.filter((id) => idx.CHAR[id] && !off.has(id)), [roster, idx, off]);
  const mineSet = useMemo(() => new Set(mine), [mine]);
  // a guide's hero → who the player has for it: the hero, or his Core Fusion (owner 2026-10-12)
  const own = useMemo(() => ownOf(mineSet, idx.FUSED), [mineSet, idx]);

  const boss = B ? bossOf(B, store.boss) : null;
  const key = boss?.key ?? NO_BOSS;
  const stage = B && boss ? fitStage(B, boss, store.stage[boss.key]) : 0;
  const facts = B && boss ? factsAt(B, boss, stage) : null;
  const guideTeams = boss ? teamsAt(boss, stage) : [];
  // the stored team of this boss; a hero who left the roster (or became Core Fusion) leaves the spot empty
  const ids = (store.teams[key] ?? NONE).map((id) => (id && mineSet.has(id) ? id : null));
  // the builds kept with this team (E2): hero → comboSig; none — «По статам»; a pin is the hero's order (hard)
  const orders = store.orders?.[key] ?? NO_ORDERS;
  // the world of the team trade as it is now (the store, no goals): its candidates tell a member's SPD reach (E4 Q5); built
  // only with a boss — the timeline is the only reader
  const tradeWorld = useMemo(() => (boss ? worldOf(ctx, gear.store, roster, { orders }) : null), [boss, ctx, gear.store, roster, orders]);
  const team: (Spot | null)[] = ids.map((id, i) => (id ? { id, want: wants[`${key}|${i}|${id}`] } : null));

  // the hero's ★ on the card; the spot's — the card's or the higher one tried here
  const cardStar = (id: string) => heroStar(idx.CHAR[id] ?? { rarity: null }, stars[id]);
  const starOf = (m: Spot) => Math.max(cardStar(m.id), m.want ?? 0);
  const members: TeamMember[] = team.filter((m): m is Spot => !!m).map((m) => ({ id: m.id, star: starOf(m) }));
  const rank = (id: string) => { const r = RANK.indexOf(idx.CHAR[id]?.rank ?? ''); return r < 0 ? RANK.length : r; };
  const report = useMemo(() => (syn ? checkTeam(syn, members, mine, rank) : []), [syn, store, wants, stars, mine, idx]); // eslint-disable-line react-hooks/exhaustive-deps
  // the hero sheet: with a boss — the guide's heroes for this spot (from the stage's teams matching the rest of the team);
  // else (or when none of them is in the roster) who fits the rest of the team (the spot being picked does not count —
  // its hero is being replaced)
  const guide = useMemo(() => {
    if (picking === null || !guideTeams.length) return null;
    const alts = spotAlternatives(guideTeams, picking, ids, own).filter((id) => idx.CHAR[id]);
    const have = uniq(alts.flatMap((id) => own(id) ?? [])).filter((id) => !members.some((m) => m.id === id));
    const lack = alts.filter((id) => !own(id)).map((id) => idx.CHAR[id].name);
    const names = lack.length > LACK ? lack.slice(0, LACK).join(', ') + t.more(lack.length - LACK) : lack.join(', ');
    return have.length || lack.length ? { ids: have, note: lack.length ? t.boss.notOwned(names) : null } : null;
  }, [picking, store, own, idx, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const fits = useMemo(() => {
    if (picking === null || guide?.ids.length) return [];
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
  // several guide teams: a choice, unless nobody is owned in any of them (the same message as with one team)
  const onFill = () => {
    if (guideTeams.length === 1 || guideTeams.every((g) => !fillFrom(g, own).have)) fill(fillFrom(guideTeams[0], own));
    else setChoosing(true);
  };
  const undoFill = () => { if (filled?.undo) saveTeam(filled.key, filled.undo); setFilled(null); };

  // the turn timeline: every member with an SPD the app knows (worn pieces), in spot order; a member who needs EFF — EFF in
  // battle against this boss (the element quirk node, a teammate's transcend team row — game/stat/eff battleBonus, owner F1/F4)
  const effOfSpot = (m: Spot) => effView({ ...ctx, stars: { ...ctx.stars, [m.id]: starOf(m) } }, idx.CHAR[m.id], gear.store);
  const mates = members.map((m) => ({ c: idx.CHAR[m.id], star: m.star }));
  const wornOf = (id: string) => Object.values(gear.store.worn?.[id] ?? {}).flatMap((p) => (p && gear.store.pieces[p] ? [gear.store.pieces[p]] : []));
  // SPD in the turn order — the app's count + the allies' transcend bonus (E4 Q6); a member whose turn-1 skill works on this
  // boss (E4 Q1) also gets the most SPD a kit could give. With builds — from the trade's own candidates (the bar, no
  // one's spare, code copies, parked into an empty slot: `tradeSpdReach`, MODEL.md §13 item 12), so no chance here means no
  // SPD goal there. Without builds the trade offers nothing (no gauge): every piece he could wear — worn by anyone, his
  // pool, parked ones — tells what his gear could give
  const reachOf = (c: Char) => {
    if (tradeWorld && c.builds.length) return tradeSpdReach(ctx, c, tradeWorld, gear.store.pieces);
    const own = new Set([...(gear.store.pools[c.id] ?? []), ...(gear.store.park ?? []),
      ...Object.values(gear.store.worn ?? {}).flatMap((w) => Object.values(w ?? {}).filter((x): x is string => !!x))]);
    return spdReach(ctx, c, [...own].flatMap((id) => { const p = gear.store.pieces[id]; return p && wearable(ctx, c, p) ? [p] : []; }));
  };
  const turnHeroes: TurnHero[] = facts && boss ? team.flatMap((m) => {
    const c = m && idx.CHAR[m.id];
    const spd = c && spdOf(ctx, c, wornOf(c.id));
    if (!m || !c || !spd) return [];
    const eff = effOfSpot(m);
    const bonus = spdBonus(c, starOf(m), mates);
    const why = reasonsAt(c, facts.imm);
    const most = why.length ? reachOf(c) + bonus : 0;
    return [{ c, spd: spd.total + bonus, bonus, why, reach: why.length && !anyChance(most, facts.spd) ? most : null, eff,
      v: eff ? inBattle(eff.e, eff.shown.v, battleBonus(c, starOf(m), ctx.settings.quirks, boss.element, mates)) : 0 }];
  }) : [];
  // the sheet takes the card's ★, not the spot's: the number the player types is the game's, at the hero's real stars
  const effOpen = effFor && turnHeroes.some((r) => r.eff && r.c.id === effFor) ? effView(ctx, idx.CHAR[effFor], gear.store) : null;
  const saveEff = (id: string, cal: Parameters<typeof setEff>[2]) => {
    setEffFor(null);
    const next = setEff(gear.store, id, cal);
    if (next !== gear.store) gear.set(next);
  };

  const setOrder = (id: string, o: string) => update((s) => {
    const { [id]: _, ...rest } = s.orders?.[key] ?? {};
    return { ...s, orders: { ...s.orders, [key]: o === STATS ? rest : { ...rest, [id]: o } } };
  });
  const withBuilds = members.filter((m) => idx.CHAR[m.id]?.builds.length).map((m) => m.id);
  const noBuilds = members.filter((m) => !idx.CHAR[m.id]?.builds.length).map((m) => idx.CHAR[m.id]?.name ?? m.id);
  const pill = (_: number, id: string) => {
    const c = idx.CHAR[id];
    if (!c?.builds.length) return null;
    const pin = pinOf(c, gear.store.pin?.[id]);
    const combo = pin ? pin.combo : combosOf(c).find((x) => comboSig(x) === orders[id]) ?? null;
    const label = pin ? t.team.buildPinAria(c.name, comboText(idx, pin.combo)) : t.team.buildAria(c.name, orderName(ctx, c, orders[id] ?? STATS, t.ui.byStats));
    return <OrderPill ctx={ctx} combo={combo} pinned={!!pin} label={label} onClick={() => setOrderFor(id)} />;
  };
  const onTrade = () => (withBuilds.length === 1 ? onHeroTrade?.(withBuilds[0]) : setTrading(true));
  // with a boss the team trade raises the EFF of members who need it to RES + 1 (.x/0200-boss E3, MODEL.md §13): in the
  // timeline's number — the spot's ★, the battle bonus (owner Q2); the key names every input, so another boss, stage, ★ or
  // team is a new calculation and a new walk (owner Q7)
  const goals = Object.fromEntries(facts && boss ? members.filter((m) => idx.CHAR[m.id]?.eff?.d && withBuilds.includes(m.id)).map((m) => {
    const c = idx.CHAR[m.id];
    return [m.id, { t: facts.res + 1, star: m.star, bonus: battleBonus(c, m.star, ctx.settings.quirks, boss.element, mates) }];
  }) : []);
  // and the SPD of members who should move before the boss (E4): a turn-1 reason that works on it (Q1), some chance with the
  // fastest kit (Q5); the target — the SPD that surely moves first (Q2), held with the allies' transcend bonus (Q6)
  const spdGoals = Object.fromEntries(facts ? turnHeroes.filter((h) => h.why.length && h.reach === null && withBuilds.includes(h.c.id))
    .map((h) => [h.c.id, { t: firstAt(facts.spd), boss: facts.spd, bonus: h.bonus }]) : []);
  const goalKey = facts && boss ? `${boss.key}@${stage}|${members.map((m) => `${m.id}*${m.star}`).join(',')}` : '';
  const orderC = orderFor ? idx.CHAR[orderFor] : undefined;

  const pickable = mine.filter((id) => !members.some((m) => m.id === id))
    .sort((a, b) => compareChars(idx.CHAR[a], idx.CHAR[b]));
  const starred = starring === null ? null : team[starring];
  const shown = team.map((m) => m && { id: m.id, star: starOf(m) });
  return (
    <div className="panel tm">
      {B && <BossRow boss={boss} facts={facts} onOpen={() => setBossAt(Date.now())} />}
      <TeamSlots team={shown} onPick={setPicking} onStars={setStarring} onRemove={(i) => put(i, null)} below={canTrade ? pill : undefined} />
      {(guideTeams.length > 0 || (canTrade && withBuilds.length > 0)) && (
        <div className="tm-acts">
          {guideTeams.length > 0 && <button type="button" className="boss-fill" onClick={onFill}>{t.boss.fill}</button>}
          {canTrade && withBuilds.length > 0 && <button type="button" className="btn primary tm-go" onClick={onTrade} {...tour('teamTrade')}>{t.team.goTrade}</button>}
        </div>
      )}
      {canTrade && noBuilds.length > 0 && <p className="tm-nob">{t.team.noBuilds(noBuilds.join(', '), noBuilds.length)}</p>}
      {!members.length && !guideTeams.length && <p className="tm-hint muted">{t.team.hint}</p>}
      {/* a wide window: the team on the left, the turn timeline and the report on the right (one column on a phone) */}
      <div className="tm-side">
        {facts && boss && <BossTurn heroes={turnHeroes} boss={boss} spd={facts.spd} res={facts.res} onEff={gear.newer ? () => undefined : setEffFor} />}
        <TeamReport syn={syn} report={report} starOf={(id) => members.find((m) => m.id === id)?.star ?? cardStar(id)} />
      </div>
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
      {effOpen && effFor && <EffSheet c={idx.CHAR[effFor]} eff={effOpen} onClose={() => setEffFor(null)} onSave={(cal) => saveEff(effFor, cal)} />}
      {orderC && (
        <OrderSheet c={orderC} ctx={ctx} order={orders[orderC.id] ?? STATS} pinned={pinnedOrder(ctx, gear.store, orderC.id, t)} onClose={() => setOrderFor(null)}
          onChoose={(o) => { setOrder(orderC.id, o); setOrderFor(null); }} />
      )}
      {trading && canTrade && (
        <TeamTradeSheet ctx={ctx} gear={gear} roster={roster} team={withBuilds} orders={orders} goals={goals} spdGoals={spdGoals} goalKey={goalKey} onOrder={setOrder}
          onApplied={(text, undo) => onApplied?.(text, undo)} onClose={() => setTrading(false)} />
      )}
      {choosing && <GuideChoice teams={guideTeams} own={own} onPick={fill} onClose={() => setChoosing(false)} />}
      {filled && filled.key === key && <Toast className="boss-toast" text={filled.text} action={t.ui.undoAction} onAction={filled.undo ? undoFill : undefined} />}
    </div>
  );
}
