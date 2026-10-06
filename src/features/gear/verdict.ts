// Вердикт новой вещи по «статам + сетам» (.x/0085 FORMULA §4): для каждого героя ростера — что она ему даст, итог вещи —
// лучший из исходов по героям в порядке «Надень» → «Оставь» → материал (Breakthrough сейчас, запас) → «Спорно» →
// «Разобрать». Пул героя — features/gear/pool/info (§5). Тексты — screens/eval (useVerdictModel).
import { isArmor } from '@/game/data';
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { buildsOf, combosWith } from '@/game/build/builds';
import { partKey, profileOf, type Profile } from '@/game/build/profile';
import { scoreBuild, tempOk, uselessFor } from '@/game/build/score';
import { itemMains, subAllowed, subForms } from '@/game/item/mains';
import { dropSubs } from '@/game/item/subs';
import { sameForBt, type ItemInput } from '@/game/item/item';
import { armorBar } from '@/features/eval/verdict/bar';
import type { Piece } from './model/gear';
import { fit, wearable } from './model/vs';
import { better, bestLayout, NEW_ID, piecePoints, type Layout, type LayoutValue } from './layout';
import { eligibleIn, geq1, listedFor, needsT4, offBar, pieceBar, poolInfo, reserveKey, type PoolInfo } from './pool/info';

// вещь с формы как запись: id NEW_ID — новее всех записанных
export const formPiece = (x: ItemInput): Piece => ({
  id: NEW_ID, slot: x.slot, grade: x.grade, setId: x.setId, itemKey: x.itemKey, main: x.main,
  ...(x.unlisted ? { unlisted: true } : {}), yellow: x.subs, lit: x.subs, bt: x.bt ?? null, at: '',
});

// пул героя: вещи, надетое и что из них держится
export interface HeroPool { c: Char; P: Profile; pieces: Piece[]; wornIds: ReadonlySet<string>; info: PoolInfo }
// пул героя по id; у героя без билдов (профиля нет) — null
export type Pools = (charId: string) => HeroPool | null;
export function heroPool(ctx: Ctx, c: Char, pieces: Piece[], wornIds: ReadonlySet<string>): HeroPool | null {
  const P = profileOf(ctx, c);
  return P ? { c, P, pieces, wornIds, info: poolInfo(P, pieces, wornIds) } : null;
}

// половины частей меню, которые включаются и выключаются: «Speed ×2», «Speed ×4»
export interface PartChange { set: string; n: 2 | 4 }
function partsDiff(a: LayoutValue, z: LayoutValue): { on: PartChange[]; off: PartChange[] } {
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
  rankUp: boolean;               // «Надень» по рангу: оружие или аксессуар из рекомендованных его билдам (§3 п. 3)
  alsoWear: Piece[];             // D11: вещи пула, что встают вместе с ней
  parts: { on: PartChange[]; off: PartChange[] };
  needT4: PartChange | null;     // «Оставь (а)»: сделай Breakthrough до T4 — без него эта часть не включится (A11)
  reserveBt: Piece | null;       // запасная из пула героя — в Breakthrough новой (§4 п. 3б)
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
  const rid = info.reserve.get(reserveKey(x));
  const rp = rid ? pool.find((p) => p.id === rid) ?? null : null;
  const base: HeroRes = {
    c: hp.c, kind: 'none', temp: !bar.keep && bar.temp, bar: bar.pass, pts: px, dV: withBest.value.v - info.value.v, margin: px - top,
    slotEmpty: !info.layout[x.slot], replaced: null, rankUp: withBest.value.rank > info.value.rank,
    alsoWear: Object.values(withBest.layout).filter((p) => p.id !== x.id && !wornIds.has(p.id)),
    parts: partsDiff(info.value, withBest.value), needT4: null,
    reserveBt: rp && bar.pass && (x.bt ?? 0) < 4 && sameForBt(x, rp) ? rp : null,
    layoutWith: withBest.layout,
  };
  // 1. «Надень» (вопросы 10, 11): прошла порог, встаёт в лучшую раскладку, и та лучше нынешней (§3 п. 3)
  if (bar.pass && uses && better(withBest.value, info.value)) return { ...base, kind: 'wear', replaced: info.layout[x.slot] ?? null };
  // 2. «Оставь» — только броня, порог прошла
  if (!bar.pass || !isArmor(x.slot)) return base;
  if (x.setId && P.menuSets.has(x.setId)) {
    // а) сет из меню: лучше хотя бы на 1 очко той, что держится для слота и сета (T4-вещь — лучшей на T4)
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

// §4 п. 3а: держащиеся годные вещи героя того же вида ниже T4 — новой можно сделать им Breakthrough. Вещь на T4 материалом
// не бывает (D6); запас и слабые — не цели (A2)
export interface Target { c: Char; piece: Piece }
function materialTargets(hp: HeroPool, x: Piece): Target[] {
  if (x.bt === 4) return [];
  return hp.pieces.filter((q) => q.id !== x.id && hp.info.strong.has(q.id) && (q.bt ?? 0) < 4 && sameForBt(x, q) && pieceBar(hp.P, q).pass)
    .map((piece) => ({ c: hp.c, piece }));
}

// §4 п. 3б, 3в: запас — слабая (не прошла порог) и не на T4. Броня: сет начат, в слоте его нет, запаса ещё нет. Оружие и
// аксессуар: Legendary, который рекомендуют билды героя, а у него этого предмета нет ни с каким main
function reserveFor(hp: HeroPool, x: Piece, h: HeroRes): boolean {
  if (h.bar || x.bt === 4 || hp.info.reserve.has(reserveKey(x))) return false;
  const { info, pieces } = hp;
  if (!isArmor(x.slot)) return listedFor(hp.P, x) && !pieces.some((q) => q.id !== x.id && sameForBt(q, x));
  if (!x.setId) return false;
  const started = pieces.some((q) => q.setId === x.setId && info.strong.has(q.id));
  const slotHas = pieces.some((q) => q.slot === x.slot && q.setId === x.setId && info.strong.has(q.id));
  return started && !slotHas;
}

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

export type Kind = 'wear' | 'keep' | 'material' | 'maybe' | 'junk';
export interface Result {
  kind: Kind;
  sub?: 'a' | 'b' | 'now' | 'reserve';
  heroes: HeroRes[];          // все герои ростера с билдами
  named: HeroRes[];           // A10: герой с наибольшей пользой первым, ещё до двух
  now: Target[];              // материал сейчас (§4 п. 3а), лучшие цели первыми
  reserve: Char[];            // запас (п. 3б, 3в)
  maybe: Char[];              // «Спорно»
  quiet: Quiet | null;        // тихая строка у материала, запаса и «Разобрать»
}

// герои ростера, которым вещь можно оценить: с билдами и не заменённые своим Core Fusion
export const rosterChars = (ctx: Ctx): Char[] =>
  [...ctx.roster].map((id) => ctx.idx.CHAR[id]).filter((c): c is Char => !!c && c.builds.length > 0 && !ctx.off.has(c.id));

// Вердикт по ростеру; null — не считается: ростера нет («только мои» выключено или он пуст — по порогам, A21), введены
// не все сабстаты (A20), предмета нет в данных outerpedia (его пассивки и рекомендаций не знаем — как прежде, по
// порогам). pools — пул героя (у Core Fusion X при X — тот, что будет после окна перехода)
export function verdictOf(ctx: Ctx, pools: Pools, input: ItemInput): Result | null {
  if (!ctx.scoped || input.unlisted || Object.keys(input.subs).length < dropSubs(input.grade)) return null;
  const x = formPiece(input);
  const hps = rosterChars(ctx).filter((c) => wearable(ctx, c, x)).map((c) => pools(c.id)).filter((h): h is HeroPool => !!h);
  const heroes = hps.map((hp) => heroOutcome(hp, x));
  const res = (kind: Kind, more: Partial<Result> = {}): Result =>
    ({ kind, heroes, named: [], now: [], reserve: [], maybe: [], quiet: null, ...more });
  const wear = heroes.filter((h) => h.kind === 'wear').sort((a, z) => z.dV - a.dV || z.margin - a.margin);
  if (wear.length) return res('wear', { named: wear.slice(0, 3) });
  const keep = heroes.filter((h) => h.kind === 'keep').sort((a, z) => z.margin - a.margin);
  if (keep.length) return res('keep', { sub: keep[0].sub, named: keep.slice(0, 3) });
  const quiet = quietOf(hps, x, heroes);
  const now = hps.flatMap((hp) => materialTargets(hp, x)).sort((a, z) => piecePoints(profileOf(ctx, z.c)!, z.piece) - piecePoints(profileOf(ctx, a.c)!, a.piece));
  if (now.length) return res('material', { sub: 'now', now, quiet });
  const reserve = hps.filter((hp, i) => reserveFor(hp, x, heroes[i])).map((hp) => hp.c);
  if (reserve.length) return res('material', { sub: 'reserve', reserve, quiet });
  const maybe = maybeFor(ctx, x);
  if (maybe.length) return res('maybe', { maybe, quiet });
  return res('junk', { quiet });
}
