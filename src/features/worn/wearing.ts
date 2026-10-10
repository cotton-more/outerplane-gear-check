// Данные карточки героя по «статам + сетам» (MODEL.md §3, §6; макет этапа 6.0, решения 1–5): вкладка «Надето» —
// слоты, включённые бонусы, «Переодеть» (лучшая раскладка из своих вещей против надетого, +1 очко по MODEL.md §3 item 3) и «Что
// искать» (наборы меню, где у героя 1–3 из 4, — по лучшей раскладке под набор, как при закреплении); варианты шторки
// закрепления. Только данные — вещи, числа, части; подписи делает интерфейс.
import { FLAT, SLOTS } from '@/game/data';
import type { ArmorSlot, Build, Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { pinnedProfile, pinOptions, profileOf, type Pin, type Profile } from '@/game/build/profile';
import { pointWeights } from '@/game/build/points';
import { comboSig } from '@/game/build/variants';
import { itemMains } from '@/game/item/mains';
import { bonusRows, type BonusRow } from '@/game/set/setBonus';
import { setValue } from '@/game/set/setValue';
import { pieceInput, type GearStore, type Piece } from '@/features/gear/model/gear';
import { better, bestLayout, epicToLegend, gearRank, layoutValue, type Layout, type LayoutValue } from '@/features/gear/layout';
import { milli, namedGain, THRESHOLD, type Fit } from '@/features/gear/model/vs';
import { eligibleIn } from '@/features/gear/pool/info';
import { partsDiff, type HeroPool, type PartChange } from '@/features/gear/verdict';
import { undoWear, wearFromPool, type WearResult } from '@/features/gear/pool';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];
const PASSIVE = ['weapon', 'accessory'] as const;

// та же вещь по содержимому: в игре две одинаковые записи — одна вещь, «надеть» одну вместо другой — не действие
const stuff = (p: Piece): string =>
  JSON.stringify([p.slot, p.grade, p.setId, p.itemKey, p.main, p.bt, Object.entries(p.lit).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0))]);
export const samePiece = (a: Piece, b: Piece): boolean => a.id === b.id || stuff(a) === stuff(b);

// сабстат вещи и засчитан ли он герою (PLAN Д1): 1 — целиком на любом месте цепочки, ½ или 0 — flat
export interface WornToken { key: string; lit: number; credit: number }
export const tokensOf = (ctx: Ctx, c: Char, P: Profile | null, p: Piece | null | undefined): WornToken[] =>
  chainTokens(ctx, c, P?.chain ?? null, p);
// the same against any chain of the hero (the second chain on «Надето»)
function chainTokens(ctx: Ctx, c: Char, chain: Build | null, p: Piece | null | undefined): WornToken[] {
  if (!p) return [];
  const W = chain ? pointWeights(ctx, c, chain, itemMains(ctx.idx, pieceInput(p))) : null;
  return Object.keys(p.lit).map((key) => ({ key, lit: p.lit[key], credit: W?.get(key)?.credit ?? 0 }));
}

// «Переодеть»: вещи лучшей раскладки, которые не надеты (replaces — что сейчас в её слоте), прирост V и половины; rankUp —
// встаёт рекомендованное оружие или аксессуар (MODEL.md §3 item 3: ранг раньше очков) — тогда pts бывает и меньше нуля
export interface Redress { pts: number; rankUp: boolean; on: PartChange[]; off: PartChange[]; wear: { piece: Piece; replaces: Piece | null }[] }
// «Что искать»: набор, сколько его вещей в лучшей раскладке под него (k из n) и каких слотов не хватает — с сетом части
// (set null — в наборе из одного сета)
export interface Need { slot: ArmorSlot; set: string | null }
export interface Fill { pin: Pin; k: number; n: number; need: Need[] }
// A «Что искать» row with what completing the set is worth (owner 2026-10-10): the set's net gain in the Worn heading's points
// (the set part of V after the row is completed minus before) — the pieces keep their own stats, so the number is only what the
// set adds, net of the set bonus the replaced pieces give today
export interface SeekRow extends Fill { gain: number }
// What Breakthrough T4 on worn armor would add to a worn set (owner 2026-10-10): the smallest group of the set's worn pieces that
// are not T4 yet whose T4 reaches the set's full-T4 value (sets are independent in V, so each set is decided alone), the
// bonus rows that group turns on, and the gain in points. Only from 1 point. A piece with Breakthrough unknown counts as not T4
export interface T4Line { set: string; rows: BonusRow[]; gain: number; slots: ArmorSlot[] }
// The passive of a worn weapon or accessory (MODEL.md §3 item 3): its rank — recommended, stopgap or not from the builds. Not points
export interface Passive { slot: 'weapon' | 'accessory'; fit: Fit }
export interface WornSlot { slot: SlotId; piece: Piece | null; tokens: WornToken[] }
// The hero's chain with what the worn pieces give each stat (owner, 2026-10-07): the chain's own order (first — the most
// valuable), a stat — the sum of its segments over the worn pieces. A flat axis (ATK, HP, DEF) shows its forms side by
// side, % first: ATK% counts in full, flat ATK at ½ (a flat form that counts 0 is left out). seg 0 — nothing worn gives
// the stat: the UI draws it dashed. sep — before the stat: '›' next place, '=' same place, '/' another form of the axis.
export interface ChainSum { key: string; seg: number; credit: number; sep: '' | '›' | '=' | '/' }
// another chain of the hero's builds, for reference (owner, 2026-10-07): the first build with it names it
export interface AltChain { build: string; chain: ChainSum[] }
export interface WornView {
  count: number;           // надето слотов из 6
  slots: WornSlot[];       // все 6, порядок — SLOTS
  value: LayoutValue | null; // points of the worn gear (V: pieces + sets); null — hero without builds
  chain: ChainSum[];       // the chain with segment sums; empty — hero without builds
  build: string;           // the build the chain comes from — named on the card only next to another chain
  alt: AltChain[];         // the hero's other chains (Heatwave Cop Delta: DPS and Support), same sums, for reference
  bonuses: BonusRow[];     // включённые бонусы надетых сетов
  passive: Passive[];      // rank of the worn weapon and accessory (the budget's «Passive»); [] — a hero without builds
  t4: T4Line[];            // what T4 on worn armor would add to each set, from 1 point; [] — a hero without builds
  redress: Redress | null; // лучшая раскладка лучше надетой (MODEL.md §3 item 3)
  seek: SeekRow[];         // «Что искать»: 1–3 из 4, от ближнего, ничего не добавляющие скрыты; закреплён — только его набор
  pool: number;            // вещей в пуле героя
}

function wornOf(st: Pick<GearStore, 'worn'>, c: Char, pieces: readonly Piece[]): Layout {
  const out: Layout = {};
  for (const [slot, id] of Object.entries(st.worn?.[c.id] ?? {}) as [SlotId, string][]) {
    const p = pieces.find((x) => x.id === id);
    if (p) out[slot] = p;
  }
  return out;
}

// hp — пул героя (features/gear/verdict heroPool; у героя без билдов — null: только слоты, без цвета, «Переодеть» и наборов)
export function wornView(ctx: Ctx, c: Char, st: GearStore, hp: HeroPool | null): WornView {
  const pieces = hp?.pieces ?? (st.pools[c.id] ?? []).map((id) => st.pieces[id]).filter((p): p is Piece => !!p);
  const worn = wornOf(st, c, pieces);
  const P = hp?.P ?? null;
  const slots = SLOTS.map(({ id }) => ({ slot: id, piece: worn[id] ?? null, tokens: tokensOf(ctx, c, P, worn[id]) }));
  return {
    count: Object.keys(worn).length,
    slots,
    value: P ? layoutValue(P, worn) : null,
    chain: P ? chainSums(ctx, P.chain, slots.map((s) => s.tokens)) : [],
    build: P?.chain.name ?? '',
    alt: P ? altChains(ctx, c, P.chain, slots.map((s) => s.piece)) : [],
    bonuses: bonusRows(ctx.idx.SET, ARMOR.map((s) => worn[s]).filter((p): p is Piece => !!p)),
    passive: P ? PASSIVE.filter((s) => worn[s]).map((slot) => ({ slot, fit: gearRank(P, worn[slot]!) })) : [],
    t4: P ? t4Of(ctx, P, worn) : [],
    redress: hp ? redressOf(hp, worn) : null,
    seek: hp ? seekOf(hp, worn) : [],
    pool: pieces.length,
  };
}

function t4Of(ctx: Ctx, P: Profile, worn: Layout): T4Line[] {
  const out: T4Line[] = [];
  for (const { set, n } of layoutValue(P, worn).sets) {
    const mine = ARMOR.filter((s) => worn[s]?.setId === set);
    const n4 = mine.filter((s) => worn[s]!.bt === 4).length;
    const cands = mine.filter((s) => worn[s]!.bt !== 4);
    if (!cands.length) continue;
    const now = setValue(P, set, n, n4).value, full = setValue(P, set, n, n).value;
    if (milli(full - now) < THRESHOLD) continue;
    let k = 1;
    while (setValue(P, set, n, n4 + k).value < full - 1e-9) k++;
    const slots = cands.slice(0, k);
    const pieces = (up: readonly ArmorSlot[]) => mine.map((s) => ({ setId: set, bt: up.includes(s) ? 4 : worn[s]!.bt }));
    const was = bonusRows(ctx.idx.SET, pieces([]));
    const rows = bonusRows(ctx.idx.SET, pieces(slots)).filter((r) => !was.some((w) => w.n === r.n && w.tier === r.tier));
    if (rows.length) out.push({ set, rows, gain: full - now, slots });
  }
  return out;
}

// chains of the hero's builds other than the one points use, each once, in outerpedia order
function altChains(ctx: Ctx, c: Char, main: Build, worn: readonly (Piece | null)[]): AltChain[] {
  const seen = new Set([JSON.stringify(main.subs)]);
  const out: AltChain[] = [];
  for (const b of c.builds) {
    const sig = JSON.stringify(b.subs);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ build: b.name, chain: chainSums(ctx, b, worn.map((p) => chainTokens(ctx, c, b, p))) });
  }
  return out;
}

export function chainSums(ctx: Ctx, chain: Pick<Build, 'subs'>, tokens: readonly WornToken[][]): ChainSum[] {
  const got = new Map<string, { seg: number; credit: number }>();
  for (const ts of tokens) for (const k of ts) {
    if (!k.credit) continue;
    const x = got.get(k.key) ?? { seg: 0, credit: k.credit };
    x.seg += k.lit;
    got.set(k.key, x);
  }
  const out: ChainSum[] = [];
  const used = new Set<string>();
  chain.subs.forEach((tier) => {
    let first = true;
    for (const raw of tier) {
      const tok = raw.trim(), axis = tok.replace(/%$/, ''), flat = FLAT.has(axis);
      if (!flat && !ctx.idx.SUB[tok]) continue; // not a substat
      const forms = (flat ? [axis + '%', axis] : [tok]).filter((k) => !used.has(k));
      if (!forms.length) continue;
      forms.forEach((k) => used.add(k));
      const sep = !out.length ? '' : first ? '›' : '=';
      first = false;
      const hits = forms.filter((k) => got.has(k));
      if (!hits.length) out.push({ key: forms[0], seg: 0, credit: 0, sep });
      hits.forEach((k, j) => out.push({ key: k, ...got.get(k)!, sep: j ? '/' : sep }));
    }
  });
  return out;
}

// лучшая раскладка (нынешняя, D3) против надетого: лучше по MODEL.md §3 item 3 — что надеть
export function redressOf(hp: HeroPool, worn: Layout): Redress | null {
  const best = hp.info.layout, vb = hp.info.value, vw = layoutValue(hp.P, worn);
  if (!better(vb, vw, epicToLegend(worn, best))) return null; // Q7: Legendary in place of Epic — no +1
  const wear = SLOTS.map(({ id }) => ({ piece: best[id], replaces: worn[id] ?? null }))
    .filter((x): x is { piece: Piece; replaces: Piece | null } => !!x.piece && !(x.replaces && samePiece(x.replaces, x.piece)));
  return wear.length ? { pts: vb.v - vw.v, rankUp: vb.rank > vw.rank, ...partsDiff(vw, vb), wear } : null;
}

// лучшая раскладка брони под набор (как при закреплении: цепочка его билда, броня только его сетов, надетое остаётся):
// k — вещей набора в ней (по части не больше n), недостающее — в слоты, где вещь набора не засчитана
export function fillOf(hp: HeroPool, pin: Pin): Fill {
  const base = hp.P.pin ? profileOf(hp.P.ctx, hp.c)! : hp.P;
  const Pc = pinnedProfile(base, pin);
  const { layout } = bestLayout(Pc, hp.pieces, { eligible: eligibleIn(Pc, hp.wornIds), armorOnly: true });
  const counted = new Set<ArmorSlot>();
  const short: { set: string; d: number }[] = [];
  let k = 0;
  for (const part of pin.combo) {
    const mine = ARMOR.filter((s) => layout[s]?.setId === part.set && !counted.has(s)).slice(0, part.n);
    mine.forEach((s) => counted.add(s));
    k += mine.length;
    if (mine.length < part.n) short.push({ set: part.set, d: part.n - mine.length });
  }
  const free = ARMOR.filter((s) => !counted.has(s));
  const need: Need[] = [];
  for (const { set, d } of short) for (let i = 0; i < d && free.length; i++) need.push({ slot: free.shift()!, set: pin.combo.length > 1 ? set : null });
  return { pin, k, n: pin.combo.reduce((x, p) => x + p.n, 0), need };
}

// варианты шторки закрепления: наборы героя (pinOptions) с заполнением, от ближнего; ничья — порядок outerpedia
export const pinChoices = (hp: HeroPool): Fill[] => pinOptions(hp.c).map((pin) => fillOf(hp, pin)).sort((a, z) => z.k - a.k);

// What completing a row is worth: the set part of V of the worn layout where the needed slots carry the row's sets (a worn
// piece is cloned into the set, an empty slot gets a bare stub — nothing but the set effect is measured; no target piece, no
// roll assumed) minus the same part today. Exact; under the profile the card's points use
function seekGain(hp: HeroPool, worn: Layout, f: Fill): number {
  const swapped: Layout = { ...worn };
  for (const nd of f.need) {
    const cur = worn[nd.slot], setId = nd.set ?? f.pin.combo[0].set;
    swapped[nd.slot] = cur ? { ...cur, setId }
      : { id: 'stub', slot: nd.slot, grade: 'unique', setId, itemKey: null, main: null, yellow: {}, lit: {}, bt: 0, at: '' };
  }
  return layoutValue(hp.P, swapped).setSum - layoutValue(hp.P, worn).setSum;
}

// «Что искать» (решение макета 4): закреплён — только его набор; иначе наборы меню (тот же набор у двух ролей — один раз).
// A row that adds nothing to the worn sets (or costs the set already worn) is left out — except on a pinned hero, whose row is
// his intent: it stays, and the UI prints no number for it. Closest first, then the bigger gain, then outerpedia's order
function seekOf(hp: HeroPool, worn: Layout): SeekRow[] {
  const seen = new Set<string>();
  const pins = hp.P.pin ? [hp.P.pin] : pinOptions(hp.c).filter((p) => !seen.has(comboSig(p.combo)) && !!seen.add(comboSig(p.combo)));
  return pins.map((pin) => fillOf(hp, pin)).filter((f) => f.k > 0 && f.k < f.n)
    .map((f): SeekRow => ({ ...f, gain: seekGain(hp, worn, f) }))
    .filter((f) => !!hp.P.pin || namedGain(f.gain))
    .sort((a, z) => z.k - a.k || z.gain - a.gain);
}

// «Надеть все N» в «Переодеть»: вещи по очереди (каждая — wearFromPool: прежняя надетая слота уходит, если её не держит
// пул). Не надето ничего — null. results — по порядку, для «Вернуть» (undoWearMany — с конца)
export interface WearManyResult { st: GearStore; results: WearResult[] }
export function wearMany(ctx: Ctx, st: GearStore, charId: string, ids: readonly string[]): WearManyResult | null {
  const results: WearResult[] = [];
  let cur = st;
  for (const id of ids) {
    const r = wearFromPool(ctx, cur, charId, id);
    if (!r) continue;
    results.push(r);
    cur = r.st;
  }
  return results.length ? { st: cur, results } : null;
}
export const undoWearMany = (st: GearStore, charId: string, r: Pick<WearManyResult, 'results'>): GearStore =>
  [...r.results].reverse().reduce((x, one) => undoWear(x, charId, one), st);
