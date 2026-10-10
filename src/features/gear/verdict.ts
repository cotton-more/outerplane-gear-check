// Вердикт новой вещи по «статам + сетам» (MODEL.md §4): для каждого героя ростера — что она ему даст, итог вещи —
// лучший из исходов по героям в порядке «Надень» → «Оставь» → материал (Breakthrough сейчас, запас) → «Спорно» →
// «Разобрать». Пул героя — features/gear/pool/info (MODEL.md §5). Тексты — screens/eval (useVerdictModel).
import { CFG } from '@/game/config';
import { isArmor } from '@/game/data';
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { buildsOf, combosWith } from '@/game/build/builds';
import { partKey, profileFor, type Profile } from '@/game/build/profile';
import { scoreBuild, tempOk, uselessFor } from '@/game/build/score';
import { itemMains, subAllowed, subForms } from '@/game/item/mains';
import { dropSubs } from '@/game/item/subs';
import { sameForBt, type ItemInput } from '@/game/item/item';
import { armorBar } from '@/features/eval/verdict/bar';
import type { Piece } from './model/gear';
import { fit, wearable } from './model/vs';
import { better, bestLayout, epicToLegend, NEW_ID, piecePoints, type Layout, type LayoutValue } from './layout';
import { coversSlot, eligibleIn, geq1, listedFor, needsT4, offBar, pieceBar, poolInfo, reserveKey, type PoolInfo } from './pool/info';

// вещь с формы как запись: id NEW_ID — новее всех записанных
export const formPiece = (x: ItemInput): Piece => ({
  id: NEW_ID, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main,
  ...(x.unlisted ? { unlisted: true } : {}), yellow: x.subs, lit: x.subs, bt: x.bt ?? null, at: '',
});

// a reserve the new piece eats in its Breakthrough; of — whose it is when it's another hero's, null — the hero's own
export interface Fed { piece: Piece; of: Char | null }
// how many feeds a piece still takes to T4
const feedsLeft = (x: Pick<Piece, 'bt'>): number => Math.max(0, CFG.reservePerHero - (x.bt ?? 0));
// worth a Breakthrough (owner 2026-10-09): armor that passes the bar; a weapon or accessory only when it is «Оставить» —
// a Legendary from the hero's list with the right main. A weapon or accessory stopgap (any Epic, a Legendary off the list)
// gets replaced: the verdict says «не вкладывай», so nothing feeds it and its spare copies are dismantled. An Epic armor
// stopgap passes the bar and is fed (owner Q1, MODEL.md §4 item 3a): its T4 counts toward the set bonus
const btWorth = (P: Profile, p: Piece): boolean => (isArmor(p.slot) ? pieceBar(P, p).pass : pieceBar(P, p).keep);

// пул героя: вещи, надетое и что из них держится
export interface HeroPool { c: Char; P: Profile; pieces: Piece[]; wornIds: ReadonlySet<string>; info: PoolInfo }
// пул героя по id; у героя без билдов (профиля нет) — null
export type Pools = (charId: string) => HeroPool | null;
// pin — ключ закрепления героя (GearStore.pin): профиль закреплённого (MODEL.md §6)
export function heroPool(ctx: Ctx, c: Char, pieces: Piece[], wornIds: ReadonlySet<string>, pin?: string | null): HeroPool | null {
  const P = profileFor(ctx, c, pin);
  return P ? { c, P, pieces, wornIds, info: poolInfo(P, pieces, wornIds) } : null;
}

// половины частей меню, которые включаются и выключаются: «Speed ×2», «Speed ×4»
export interface PartChange { set: string; n: 2 | 4 }
export function partsDiff(a: LayoutValue, z: LayoutValue): { on: PartChange[]; off: PartChange[] } {
  const halves = (v: LayoutValue) => new Map(v.sets.map((s) => [s.set, s.halves]));
  const ha = halves(a), hz = halves(z);
  const on: PartChange[] = [], off: PartChange[] = [];
  for (const set of new Set([...ha.keys(), ...hz.keys()])) {
    const x = ha.get(set) ?? 0, y = hz.get(set) ?? 0;
    if (y > x) on.push({ set, n: y === 2 ? 4 : 2 });
    if (y < x) off.push({ set, n: x === 2 ? 4 : 2 });
  }
  return { on, off };
}

export interface HeroRes {
  c: Char;
  kind: 'wear' | 'keep' | 'none';
  sub?: 'a' | 'b';               // «Оставь»: а — лучшая своего сета из меню, б — чужой сет, сильная по статам
  temp: boolean;                 // прошла порог только как временная (штамп «Временно», PLAN Д2)
  bar: boolean;
  pts: number;                   // очки вещи для героя
  dV: number;                    // V лучшей раскладки с ней − V нынешней
  margin: number;                // очки над лучшей держащейся вещью слота (порядок «Оставь», A10)
  slotEmpty: boolean;            // её слот пуст в нынешней раскладке
  replaced: Piece | null;        // «Надень»: вещь её слота, которую она сменит
  rankUp: boolean;               // «Надень» по рангу: оружие или аксессуар из рекомендованных его билдам (MODEL.md §3 item 3)
  alsoWear: Piece[];             // D11: вещи пула, что встают вместе с ней (в нынешней раскладке их в этом слоте не было)
  parts: { on: PartChange[]; off: PartChange[] };
  needT4: PartChange | null;     // «Оставь (а)»: сделай Breakthrough до T4 — без него эта часть не включится (A11)
  reserveBt: Fed[];              // reserves fed to the new piece (MODEL.md §4 item 3b): the hero's own first, then other heroes'
                                 // (verdictOf, feedFrom) — as many as it takes to T4
  layoutWith: Layout;            // лучшая раскладка с ней — что будет надето после «Надеть»
}

export function heroOutcome(hp: HeroPool, x: Piece): HeroRes {
  const { P, info, wornIds } = hp;
  const pool = hp.pieces.filter((p) => p.id !== x.id);
  const bar = pieceBar(P, x);
  const px = piecePoints(P, x);
  const heldHere = pool.filter((p) => p.slot === x.slot && info.strong.has(p.id));
  const top = heldHere.length ? Math.max(...heldHere.map((p) => piecePoints(P, p))) : 0;
  const withBest = bestLayout(P, [...pool, x], { eligible: eligibleIn(P, wornIds) });
  const uses = withBest.layout[x.slot]?.id === x.id;
  const own = btWorth(P, x) ? (info.reserve.get(reserveKey(x)) ?? []).map((id) => pool.find((p) => p.id === id))
    .filter((p): p is Piece => !!p && sameForBt(x, p)).slice(0, feedsLeft(x)) : [];
  const base: HeroRes = {
    c: hp.c, kind: 'none', temp: !bar.keep && bar.temp, bar: bar.pass, pts: px, dV: withBest.value.v - info.value.v, margin: px - top,
    slotEmpty: !info.layout[x.slot], replaced: null, rankUp: withBest.value.rank > info.value.rank,
    alsoWear: Object.values(withBest.layout).filter((p) => p.id !== x.id && !wornIds.has(p.id) && info.layout[p.slot]?.id !== p.id),
    parts: partsDiff(info.value, withBest.value), needT4: null,
    reserveBt: own.map((piece) => ({ piece, of: null })),
    layoutWith: withBest.layout,
  };
  // 1. «Надень» (вопросы 10, 11): прошла порог, встаёт в лучшую раскладку, и та лучше нынешней (MODEL.md §3 item 3)
  // Q7: a Legendary in place of the Epic of its slot needs no +1 — not worse by points is enough
  if (bar.pass && uses && better(withBest.value, info.value, epicToLegend(info.layout, withBest.layout))) return { ...base, kind: 'wear', replaced: info.layout[x.slot] ?? null };
  // 2. «Оставь» — только броня, порог прошла
  if (!bar.pass || !isArmor(x.slot)) return base;
  if (x.setId && P.pin && P.menuSets.has(x.setId)) {
    // а) a pinned set (owner 2026-10-08, (c): with no pin the hero is wanted by stats — every set goes by б): better by at least 1 point than the one held for the slot and set (a T4 piece — than the best at T4)
    const pair = heldHere.filter((p) => p.setId === x.setId && (x.bt !== 4 || p.bt === 4));
    const ref = pair.length ? Math.max(...pair.map((p) => piecePoints(P, p))) : null;
    if (ref === null || geq1(px, ref)) return { ...base, kind: 'keep', sub: 'a', needT4: (x.bt ?? 0) < 4 && needsT4(P, x.setId) ? menuPart(P, x.setId) : null };
    return base;
  }
  // б) сет не из меню: на 1 очко выше каждой держащейся вещи слота, вещам сетов меню +U/2 (A12)
  if (!heldHere.length || geq1(px, offBar(P, heldHere))) return { ...base, kind: 'keep', sub: 'b' };
  return base;
}

// часть меню героя с этим сетом — меньшая («Penetration ×2»)
const menuPart = (P: Profile, set: string): PartChange => ({ set, n: P.parts.has(partKey(set, 2)) ? 2 : 4 });

// MODEL.md §4 item 3a: held good (btWorth) pieces of the hero of the same kind below T4 — the new one can give them Breakthrough; reserve and weak ones are not
// targets (A2). A piece at T4 is material too (owner 2026-10-09, was D6 «never»): it reaches this only when nobody wears or
// keeps it, and one Breakthrough step for a hero beats dismantling it (#62 Ether Blade T4 → Hilde's Ether Blade)
export interface Target { c: Char; piece: Piece; worn: boolean }
function materialTargets(hp: HeroPool, x: Piece): Target[] {
  return hp.pieces.filter((q) => q.id !== x.id && hp.info.strong.has(q.id) && (q.bt ?? 0) < 4 && sameForBt(x, q) && btWorth(hp.P, q))
    .map((piece) => ({ c: hp.c, piece, worn: hp.wornIds.has(piece.id) }));
}

// MODEL.md §4 items 3b, 3c: a reserve is weak (below the threshold) and not at T4. Armor: the set is started, the slot has none of it, fewer reserves of this kind than
// CFG.reservePerHero. Weapon and accessory: a Legendary the hero's builds recommend while the hero has no good copy
function reserveFor(hp: HeroPool, x: Piece, h: HeroRes): boolean {
  if (h.bar || x.bt === 4 || (hp.info.reserve.get(reserveKey(x))?.length ?? 0) >= CFG.reservePerHero) return false;
  const { info, pieces } = hp;
  if (!isArmor(x.slot)) return listedFor(hp.P, x) && !pieces.some((q) => q.id !== x.id && info.strong.has(q.id) && sameForBt(q, x));
  if (!x.setId || (hp.P.pin && !hp.P.menuSets.has(x.setId))) return false;
  const started = pieces.some((q) => q.setId === x.setId && info.strong.has(q.id));
  const slotHas = pieces.some((q) => info.strong.has(q.id) && coversSlot(q, x));
  return started && !slotHas;
}

// Legendary reserve while the hero holds a good Epic of that set and slot: wear the Epic until a good Legendary drops,
// then this one is its material (owner, 2026-10-07)
const overEpic = (hp: HeroPool, x: Piece): boolean =>
  x.grade === 'unique' && hp.pieces.some((q) => q.grade === 'rare' && q.slot === x.slot && q.setId === x.setId && hp.info.strong.has(q.id));

// «Спорно»: герои не из ростера, чьи билды берут этот сет (этот предмет) и кому вещь проходит порог — как в evaluate
export function maybeFor(ctx: Ctx, x: Piece): Char[] {
  const out = new Map<string, Char>();
  const input = { slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main, subs: x.lit };
  const im = itemMains(ctx.idx, input);
  if (isArmor(x.slot)) {
    if (!x.setId) return [];
    const bar = armorBar(ctx, input);
    for (const r of buildsOf(ctx.idx, (b) => combosWith(b, x.setId!).length)) {
      if (!ctx.outScope(r.c) || out.has(r.c.id)) continue;
      const sc = { ...r, ...scoreBuild(ctx, x.grade, r.c, r.b, x.lit, im) };
      if (bar.qualifies(sc) || bar.tempOk(sc)) out.set(r.c.id, r.c);
    }
  } else {
    for (const c of ctx.idx.D.chars) {
      if (!ctx.outScope(c)) continue;
      for (const b of c.builds) {
        const f = fit(ctx, c, b, input);
        if (f === 'rec' || (f === 'stopgap' && tempOk(x.grade, scoreBuild(ctx, x.grade, c, b, x.lit, im)))) { out.set(c.id, c); break; }
      }
    }
  }
  return [...out.values()];
}

// Тихая строка (вопрос 12): слабая вещь (порог не прошла) дала бы герою прирост V ≥ 1. stats — что искать: первые два
// стата его цепочки, которые бывают сабстатом на этой вещи
export interface Quiet { c: Char; dV: number; slotEmpty: boolean; stats: string[] }
function quietOf(pools: HeroPool[], x: Piece, heroes: HeroRes[]): Quiet | null {
  let top: Quiet | null = null;
  for (const hp of pools) {
    const h = heroes.find((r) => r.c === hp.c)!;
    if (h.bar) continue;
    const forced = bestLayout(hp.P, [...hp.pieces.filter((p) => p.id !== x.id), x], { eligible: (p) => p.id === x.id || eligibleIn(hp.P, hp.wornIds)(p) });
    if (forced.layout[x.slot]?.id !== x.id) continue;
    const dV = forced.value.v - hp.info.value.v;
    if (!geq1(forced.value.v, hp.info.value.v) || (top && dV <= top.dV)) continue;
    top = { c: hp.c, dV, slotEmpty: h.slotEmpty, stats: lookFor(hp.P, x) };
  }
  return top;
}
function lookFor(P: Profile, x: Piece): string[] {
  const input = { slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main };
  const useless = uselessFor(P.ctx, P.c);
  const out: string[] = [];
  for (const tok of P.chain.subs.flat()) {
    const k = subForms(tok.trim()).sort((a, z) => Number(z.endsWith('%')) - Number(a.endsWith('%'))).find((f) => P.ctx.idx.SUB[f] && subAllowed(P.ctx.idx, input, f) && !useless.includes(f));
    if (k && !out.includes(k)) out.push(k);
    if (out.length === 2) break;
  }
  return out;
}

// Та же вещь, отложенная раньше (решение владельца 2026-10-06): у героя ростера ненадетая запись с тем же сетом или
// item, slot, grade, main and all substats at the same levels. The verdict is computed without it, and the line says:
// «похоже, это она — ничего не делай». Substats are compared in the order typed — the form keeps it, Help asks for the
// game's order, and the same stats in another order are another piece (owner, 2026-10-07)
export interface Same { c: Char; piece: Piece }
const samePiece = (p: Piece, x: Piece): boolean => {
  const a = Object.entries(p.lit), b = Object.entries(x.lit);
  return p.slot === x.slot && p.grade === x.grade && p.setId === x.setId && p.itemKey === x.itemKey && p.main === x.main
    && a.length === b.length && a.every(([k, n], i) => b[i][0] === k && b[i][1] === n);
};
function sameOf(hps: HeroPool[], x: Piece): Same | null {
  for (const hp of hps) {
    const piece = hp.pieces.find((p) => !hp.wornIds.has(p.id) && samePiece(p, x));
    if (piece) return { c: hp.c, piece };
  }
  return null;
}

export type Kind = 'wear' | 'keep' | 'material' | 'maybe' | 'junk';
export interface Result {
  kind: Kind;
  sub?: 'a' | 'b' | 'now' | 'reserve';
  heroes: HeroRes[];          // все герои ростера с билдами
  named: HeroRes[];           // A10: герой с наибольшей пользой первым, ещё до двух
  now: Target[];              // материал сейчас (MODEL.md §4 item 3a), лучшие цели первыми
  reserve: Char[];            // reserve (items 3b, 3c)
  overEpic?: boolean;         // reserve: reserve[0] holds a good Epic of this set and slot, this Legendary waits for a good Legendary
  maybe: Char[];              // «Спорно»
  quiet: Quiet | null;        // тихая строка у материала, запаса и «Разобрать»
  same: Same | null;          // похоже, это отложенная раньше вещь (её запись в расчёт не входит)
}

// герои ростера, которым вещь можно оценить: с билдами и не заменённые своим Core Fusion
export const rosterChars = (ctx: Ctx): Char[] =>
  [...ctx.roster].map((id) => ctx.idx.CHAR[id]).filter((c): c is Char => !!c && c.builds.length > 0 && !ctx.off.has(c.id));

// A weak reserve piece feeds whoever gets a good piece of its set, slot and grade first, not only its holder (owner,
// 2026-10-07): after the hero's own reserves, other roster heroes' reserves of that kind fill the feeds up to T4.
// Reserves of one kind are interchangeable (owner, 2026-10-08: any locked one in the game)
function feedFrom(hps: HeroPool[], x: Piece, h: HeroRes): HeroRes {
  let left = feedsLeft(x) - h.reserveBt.length;
  if (!h.bar || (!isArmor(x.slot) && h.temp) || left <= 0) return h; // a stopgap weapon or accessory isn't fed
  const fed = [...h.reserveBt];
  for (const hp of hps) {
    if (hp.c === h.c) continue;
    for (const id of hp.info.reserve.get(reserveKey(x)) ?? []) {
      const p = hp.pieces.find((q) => q.id === id);
      if (!p || !sameForBt(x, p) || left <= 0) continue;
      fed.push({ piece: p, of: hp.c });
      left--;
    }
  }
  return fed.length === h.reserveBt.length ? h : { ...h, reserveBt: fed };
}

// reserves of the piece's kind over all heroes — the ceiling CFG.reserveMax (owner, 2026-10-08)
const reservesOf = (hps: HeroPool[], x: Piece): number => hps.reduce((n, hp) => n + (hp.info.reserve.get(reserveKey(x))?.length ?? 0), 0);

// Вердикт по ростеру; null — не считается: ростера нет («только мои» выключено или он пуст — по порогам, A21), введены
// не все сабстаты (A20), предмета нет в данных outerpedia (его пассивки и рекомендаций не знаем — как прежде, по
// thresholds). pools — the hero's pool (for Core Fusion X with X — the one that will be after the transition sheet). twin — the player said
// «Это другой»: the look-alike set-aside record is another piece, so it stays in its pool and there is no same.
// Batch plan (features/batch): skip — heroes left out for this piece («Не брать»); full — material targets that already
// get four pieces in the plan
export interface VerdictOpts { twin?: boolean; skip?: ReadonlySet<string>; full?: ReadonlySet<string> }
export function verdictOf(ctx: Ctx, pools: Pools, input: ItemInput, opts: VerdictOpts = {}): Result | null {
  if (!ctx.scoped || input.unlisted || Object.keys(input.subs).length < dropSubs(input.grade)) return null;
  const x = formPiece(input);
  const all = rosterChars(ctx).filter((c) => wearable(ctx, c, x) && !opts.skip?.has(c.id)).map((c) => pools(c.id)).filter((h): h is HeroPool => !!h);
  const same = opts.twin ? null : sameOf(all, x);
  const hps = same ? all.map((hp) => (hp.c === same.c ? heroPool(ctx, hp.c, hp.pieces.filter((p) => p !== same.piece), hp.wornIds, hp.P.pin?.key)! : hp)) : all;
  const heroes = hps.map((hp) => feedFrom(hps, x, heroOutcome(hp, x)));
  const res = (kind: Kind, more: Partial<Result> = {}): Result =>
    ({ kind, heroes, named: [], now: [], reserve: [], maybe: [], quiet: null, same, ...more });
  const wear = heroes.filter((h) => h.kind === 'wear').sort((a, z) => z.dV - a.dV || z.margin - a.margin);
  if (wear.length) return res('wear', { named: wear.slice(0, 3) });
  const keep = heroes.filter((h) => h.kind === 'keep').sort((a, z) => z.margin - a.margin);
  if (keep.length) return res('keep', { sub: keep[0].sub, named: keep.slice(0, 3) });
  const quiet = quietOf(hps, x, heroes);
  const ptsOf = (t: Target) => piecePoints(hps.find((hp) => hp.c === t.c)!.P, t.piece);
  const now = hps.flatMap((hp) => materialTargets(hp, x)).filter((n) => !opts.full?.has(n.piece.id)).sort((a, z) => ptsOf(z) - ptsOf(a));
  if (now.length) return res('material', { sub: 'now', now, quiet });
  // a Legendary reserve no longer waits behind an Epic one (grade-aware reserveKey): В1а «пусть лежит» is gone
  // the hero who already has it set aside goes first: the title names them
  const rh = reservesOf(hps, x) >= CFG.reserveMax ? [] : hps.filter((hp, i) => reserveFor(hp, x, heroes[i])).sort((a, z) => Number(z.c === same?.c) - Number(a.c === same?.c));
  if (rh.length) return res('material', { sub: 'reserve', reserve: rh.map((hp) => hp.c), overEpic: overEpic(rh[0], x), quiet });
  const maybe = maybeFor(ctx, x);
  if (maybe.length) return res('maybe', { maybe, quiet });
  return res('junk', { quiet });
}
