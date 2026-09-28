// Сравнение вещи с формы с тем, что уже надето (logic/gear): у кого из тех, кому она подходит, в собираемых билдах
// этот слот пуст, хуже или лучше. Вердикт (штамп) не меняет — это отдельный раздел «Сейчас на персонажах».
// Ценность вещи для билда — полезные сегменты с весом места в цепочке, с учётом Reforge, которые ещё впереди:
// каждый добавляет сегмент случайному из четырёх сабстатов. Так прокачанная вещь честно сравнивается со свежей.
import { isArmor } from '../data';
import type { Build, Char, GearKind } from '../data/types';
import { CFG } from '../config';
import { combosWith, gearList, slotMains } from './builds';
import type { Ctx } from './context';
import { buildKey, MAX_LIT, pieceInput, REFORGES, reforgesDone, samePiece, type GearStore, type Piece } from './gear';
import { itemMains } from './mains';
import { scoreBuild, subWeights, type Row } from './score';
import { dropSubs, MAX_SUBS, type Subs } from './subs';
import { bestRow, type ItemInput, type Verdict } from './verdict';

export type VsKind = 'fill' | 'up' | 'eq' | 'down' | 'breaks' | 'worn';
export const VS_ORDER: VsKind[] = ['fill', 'up', 'eq', 'down', 'breaks', 'worn'];

export interface Vs {
  c: Char;
  b: Build;
  key: string;                   // buildKey
  kind: VsKind;
  worn: Piece | null;            // что сейчас в этом слоте билда
  delta: number | null;          // (новый − надетый) / надетый, по полезным сегментам после Reforge
  gained: { key: string; place: number }[]; // места цепочки, которые новый закрывает, а надетый — нет
  lost: { key: string; place: number }[];
  chains: { worn: Omit<Row, 'alt'>; next: Omit<Row, 'alt'> } | null;
  broken: string | null;         // 2+2: какой сет пропадёт (id)
  material: boolean;             // та же вещь, что надетая не на T4: годится ей на Breakthrough
  passive: boolean;              // оружие/аксессуар: у надетого другая пассивка — решает не только ролл
  // оружие/аксессуар: решила пассивка, а не сегменты — rec: новая рекомендованная против нерекомендованной (лучше),
  // stopgap: новая временная, а надета рекомендованная (хуже). Тогда чип — словом, процент — строкой с причиной
  why: 'rec' | 'stopgap' | null;
  wornEmpty: boolean;            // у надетой нет ни одного полезного сегмента: процент бессмыслен (деление на ноль)
  // «хуже», хотя мест новая не теряет: у надетой больше сегментов — стат, где она впереди сильнее всего
  ahead: { key: string; worn: number; next: number } | null;
}

// чем показать разницу: процент; «×N», когда больше +200% (иначе «+92250%» у почти пустой надетой); «полезных нет»
export type VsFigure = { kind: 'pct' | 'times'; n: number } | { kind: 'empty' };
export function vsFigure(vs: Pick<Vs, 'delta' | 'wornEmpty'>): VsFigure | null {
  if (vs.wornEmpty) return { kind: 'empty' };
  if (vs.delta == null) return null;
  const pct = Math.round(vs.delta * 100);
  return pct > 200 ? { kind: 'times', n: Math.round(vs.delta + 1) } : { kind: 'pct', n: pct };
}

export const MARGIN = 0.1;

// полезные сегменты вещи для билда: вес места × засчитывается (1, ½, 0) × сегменты сейчас + доля будущих Reforge
// segs — сколько сегментов у каждого полезного стата будет с Reforge впереди (для строки «у надетой больше сегментов»)
function value(ctx: Ctx, c: Char, b: Build, item: ItemInput, lit: Subs, done: number): { v: number; cover: Map<number, string>; segs: Map<string, number> } {
  const W = subWeights(ctx, b, c, itemMains(ctx.idx, item));
  const n = Object.keys(lit).length;
  // у Epic с тремя первый Reforge уйдёт на 4-й: его пока не знаем — считаем бесполезным
  const left = Math.max(0, REFORGES - done - (item.grade === 'rare' && n < dropSubs('unique') ? 1 : 0));
  const share = left / dropSubs('unique');
  let v = 0;
  const cover = new Map<number, string>();
  const segs = new Map<string, number>();
  for (const [k, seg] of Object.entries(lit)) {
    const w = W.get(k);
    if (!w || !w.credit) continue;
    segs.set(k, Math.min(MAX_LIT, seg + share));
    v += CFG.tierWeights[Math.min(w.tier, CFG.tierWeights.length - 1)] * w.credit * segs.get(k)!;
    if (!cover.has(w.tier)) cover.set(w.tier, k);
  }
  return { v, cover, segs };
}

// подходит ли вещь этому билду: броня — сет есть в связках; Legendary с пассивкой — предмет из списка с нужным main;
// остальное (Epic, «нет в списке», другой main) — временная, если main этому билду нужен
type Fit = 'no' | 'rec' | 'stopgap';
function fit(ctx: Ctx, b: Build, item: ItemInput): Fit {
  if (isArmor(item.slot)) return item.setId && combosWith(b, item.setId).length ? 'rec' : 'no';
  const kind = item.slot as GearKind;
  const g = item.grade === 'unique' && item.itemKey ? gearList(b, kind).find((r) => r.key === item.itemKey) : undefined;
  if (g) return !g.mains.length || (item.main != null && g.mains.includes(item.main)) ? 'rec' : 'no';
  return ctx.settings.stage === 'grow' && item.main != null && slotMains(b, kind).has(item.main) ? 'stopgap' : 'no';
}

// подходит ли вещь билду хоть как-то — для «Взять из Speed» в карточке персонажа
export const fits = (ctx: Ctx, b: Build, item: ItemInput): boolean => fit(ctx, b, item) !== 'no';

// 2+2: замена в слоте ломает связку сетов, которая была собрана
function breaks(st: GearStore, key: string, b: Build, item: ItemInput): string | null {
  if (!isArmor(item.slot)) return null;
  const count = (swap: boolean) => {
    const n: Record<string, number> = {};
    for (const [slot, id] of Object.entries(st.builds[key]?.slots ?? {})) {
      const set = swap && slot === item.slot ? item.setId : st.pieces[id]?.setId;
      if (set && isArmor(slot as ItemInput['slot'])) n[set] = (n[set] ?? 0) + 1;
    }
    if (swap && !st.builds[key]?.slots[item.slot] && item.setId) n[item.setId] = (n[item.setId] ?? 0) + 1;
    return n;
  };
  const ok = (n: Record<string, number>) => b.sets.filter((combo) => combo.every((p) => (n[p.set] ?? 0) >= p.n));
  const before = ok(count(false)), after = ok(count(true));
  if (!before.length || after.length) return null;
  return before[0].find((p) => (count(true)[p.set] ?? 0) < p.n)?.set ?? null;
}

const rowOf = (ctx: Ctx, c: Char, b: Build, item: ItemInput, subs: Subs): Omit<Row, 'alt'> =>
  ({ c, b, i: c.builds.indexOf(b), ...scoreBuild(ctx, item.grade, c, b, subs, itemMains(ctx.idx, item)) });

export const inUse = (st: GearStore, c: Char): Build[] => c.builds.filter((b) => st.builds[buildKey(c.id, b.name)]);

export function compare(ctx: Ctx, st: GearStore, c: Char, b: Build, item: ItemInput): Vs | null {
  const f = fit(ctx, b, item);
  if (f === 'no') return null;
  const key = buildKey(c.id, b.name);
  const wornId = st.builds[key]?.slots[item.slot];
  const worn = wornId ? st.pieces[wornId] ?? null : null;
  const base: Vs = { c, b, key, kind: 'fill', worn, delta: null, gained: [], lost: [], chains: null, broken: null, material: false, passive: false, why: null, wornEmpty: false, ahead: null };
  if (!worn) return base; // пустой слот связку не ломает — только дополняет
  if (samePiece(item, worn)) return { ...base, kind: 'worn' };
  const wi = pieceInput(worn);
  // Epic с 4 сабстатами в форме уже прошла первый Reforge (он дал 4-й) — как у записанной вещи (reforgesDone)
  const X = value(ctx, c, b, item, item.subs, item.grade === 'rare' && Object.keys(item.subs).length >= MAX_SUBS ? 1 : 0);
  const E = value(ctx, c, b, wi, worn.lit, reforgesDone(worn));
  const delta = (X.v - E.v) / Math.max(E.v, 0.01);
  let kind: VsKind = delta >= MARGIN ? 'up' : delta <= -MARGIN ? 'down' : 'eq';
  let why: Vs['why'] = null;
  if (!isArmor(item.slot)) {
    const wf = fit(ctx, b, wi);
    if (f === 'stopgap' && wf === 'rec') { kind = 'down'; why = 'stopgap'; }
    else if (f === 'rec' && wf !== 'rec') { kind = 'up'; why = 'rec'; }
  }
  const broken = breaks(st, key, b, item);
  if (broken) kind = 'breaks';
  const place = (cover: Map<number, string>, other: Map<number, string>) =>
    [...cover].filter(([p]) => !other.has(p)).map(([p, k]) => ({ key: k, place: p + 1 })).sort((a, z) => a.place - z.place);
  const sameType = isArmor(item.slot)
    ? worn.setId === item.setId && worn.grade === item.grade
    : !!item.itemKey && worn.itemKey === item.itemKey;
  const lost = place(E.cover, X.cover);
  const ahead = kind === 'down' && !why && !lost.length
    ? [...E.segs].map(([k, w]) => ({ key: k, worn: w, next: X.segs.get(k) ?? 0 })).filter((x) => x.worn > x.next)
      .sort((a, z) => z.worn - z.next - (a.worn - a.next))[0] ?? null
    : null;
  return {
    ...base, kind, delta, why, broken, wornEmpty: E.v === 0 && X.v > 0, ahead,
    gained: place(X.cover, E.cover), lost,
    chains: { worn: rowOf(ctx, c, b, wi, worn.lit), next: rowOf(ctx, c, b, item, item.subs) },
    material: sameType && worn.bt !== null && worn.bt < 4,
    passive: !isArmor(item.slot) && !!worn.itemKey && !!item.itemKey && worn.itemKey !== item.itemKey,
  };
}

// кому сравнивать: тем, кому вещь подходит по вердикту (первая открытая секция из ростера), в собираемых билдах
export function compareAll(ctx: Ctx, st: GearStore, item: ItemInput, res: Verdict): Vs[] {
  if (!Object.keys(st.builds).length || res.v === 'idle') return [];
  const top = bestRow(res);
  if (!top) return [];
  const sec = res.sections.find((x) => x.rows[0] === top.row)!;
  const out: Vs[] = [];
  for (const r of sec.rows) for (const b of inUse(st, r.c)) {
    const vs = compare(ctx, st, r.c, b, item);
    if (vs) out.push(vs);
  }
  return out.sort((a, z) => VS_ORDER.indexOf(a.kind) - VS_ORDER.indexOf(z.kind) || (z.delta ?? 0) - (a.delta ?? 0));
}

// в окне «Надеть на…»: билды, в которые вещь можно надеть. Сначала сравнение (собираемые билды), потом
// подходящие билды остальных; all — и не по билду (вещь на замену, что реально на персонаже сейчас)
export function equipTargets(ctx: Ctx, st: GearStore, item: ItemInput, chars: Char[], all: boolean): { c: Char; b: Build; vs: Vs | null }[] {
  const out: { c: Char; b: Build; vs: Vs | null }[] = [];
  for (const c of chars) for (const b of c.builds) {
    const vs = compare(ctx, st, c, b, item);
    if (vs || all) out.push({ c, b, vs });
  }
  const rank = (x: { vs: Vs | null; c: Char; b: Build }) => (x.vs ? (st.builds[x.vs.key] ? 0 : 1) : 2);
  return out.sort((a, z) => rank(a) - rank(z) || (a.vs && z.vs ? VS_ORDER.indexOf(a.vs.kind) - VS_ORDER.indexOf(z.vs.kind) : 0) || a.c.name.localeCompare(z.c.name));
}

