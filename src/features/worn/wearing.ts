// Данные карточки героя по «статам + сетам» (.x/0085 FORMULA §3, §6; макет этапа 6.0, решения 1–5): вкладка «Надето» —
// слоты, включённые бонусы, «Переодеть» (лучшая раскладка из своих вещей против надетого, +1 очко по §3 п. 3) и «Что
// искать» (наборы меню, где у героя 1–3 из 4, — по лучшей раскладке под набор, как при закреплении); варианты шторки
// закрепления. Только данные — вещи, числа, части; подписи делает интерфейс.
import { SLOTS } from '@/game/data';
import type { ArmorSlot, Char, SlotId } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { pinnedProfile, pinOptions, profileOf, type Pin, type Profile } from '@/game/build/profile';
import { pointWeights } from '@/game/build/points';
import { comboSig } from '@/game/build/variants';
import { itemMains } from '@/game/item/mains';
import { bonusRows, type BonusRow } from '@/game/set/setBonus';
import { pieceInput, type GearStore, type Piece } from '@/features/gear/model/gear';
import { better, bestLayout, layoutValue, type Layout } from '@/features/gear/layout';
import { eligibleIn } from '@/features/gear/pool/info';
import { partsDiff, type HeroPool, type PartChange } from '@/features/gear/verdict';
import { undoWear, wearFromPool, type WearResult } from '@/features/gear/pool';

const ARMOR: ArmorSlot[] = ['helmet', 'armor', 'gloves', 'shoes'];

// та же вещь по содержимому: в игре две одинаковые записи — одна вещь, «надеть» одну вместо другой — не действие
const stuff = (p: Piece): string =>
  JSON.stringify([p.slot, p.grade, p.setId, p.itemKey, p.main, p.bt, Object.entries(p.lit).sort(([a], [z]) => (a < z ? -1 : a > z ? 1 : 0))]);
export const samePiece = (a: Piece, b: Piece): boolean => a.id === b.id || stuff(a) === stuff(b);

// сабстат вещи и засчитан ли он герою (PLAN Д1): 1 — целиком на любом месте цепочки, ½ или 0 — flat
export interface WornToken { key: string; lit: number; credit: number }
export function tokensOf(ctx: Ctx, c: Char, P: Profile | null, p: Piece | null | undefined): WornToken[] {
  if (!p) return [];
  const W = P ? pointWeights(ctx, c, P.chain, itemMains(ctx.idx, pieceInput(p))) : null;
  return Object.keys(p.lit).map((key) => ({ key, lit: p.lit[key], credit: W?.get(key)?.credit ?? 0 }));
}

// «Переодеть»: вещи лучшей раскладки, которые не надеты (replaces — что сейчас в её слоте), прирост V и половины; rankUp —
// встаёт рекомендованное оружие или аксессуар (§3 п. 3: ранг раньше очков) — тогда pts бывает и меньше нуля
export interface Redress { pts: number; rankUp: boolean; on: PartChange[]; off: PartChange[]; wear: { piece: Piece; replaces: Piece | null }[] }
// «Что искать»: набор, сколько его вещей в лучшей раскладке под него (k из n) и каких слотов не хватает — с сетом части
// (set null — в наборе из одного сета)
export interface Need { slot: ArmorSlot; set: string | null }
export interface Fill { pin: Pin; k: number; n: number; need: Need[] }
export interface WornSlot { slot: SlotId; piece: Piece | null; tokens: WornToken[] }
export interface WornView {
  count: number;           // надето слотов из 6
  slots: WornSlot[];       // все 6, порядок — SLOTS
  bonuses: BonusRow[];     // включённые бонусы надетых сетов
  redress: Redress | null; // лучшая раскладка лучше надетой (§3 п. 3)
  seek: Fill[];            // «Что искать»: 1–3 из 4, от ближнего; закреплён — только его набор
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
  return {
    count: Object.keys(worn).length,
    slots: SLOTS.map(({ id }) => ({ slot: id, piece: worn[id] ?? null, tokens: tokensOf(ctx, c, P, worn[id]) })),
    bonuses: bonusRows(ctx.idx.SET, ARMOR.map((s) => worn[s]).filter((p): p is Piece => !!p)),
    redress: hp ? redressOf(hp, worn) : null,
    seek: hp ? seekOf(hp) : [],
    pool: pieces.length,
  };
}

// лучшая раскладка (нынешняя, D3) против надетого: лучше по §3 п. 3 — что надеть
export function redressOf(hp: HeroPool, worn: Layout): Redress | null {
  const best = hp.info.layout, vb = hp.info.value, vw = layoutValue(hp.P, worn);
  if (!better(vb, vw)) return null;
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

// «Что искать» (решение макета 4): закреплён — только его набор; иначе наборы меню (тот же набор у двух ролей — один раз)
function seekOf(hp: HeroPool): Fill[] {
  const seen = new Set<string>();
  const pins = hp.P.pin ? [hp.P.pin] : pinOptions(hp.c).filter((p) => !seen.has(comboSig(p.combo)) && !!seen.add(comboSig(p.combo)));
  return pins.map((pin) => fillOf(hp, pin)).filter((f) => f.k > 0 && f.k < f.n).sort((a, z) => z.k - a.k);
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
