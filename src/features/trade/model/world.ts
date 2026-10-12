// Мост к приложению: мир обмена из хранилища и данных. Мерило героя — его заказ (MODEL.md §7 item 1): «По статам»,
// набор из его билдов или, у закреплённого, его закрепление (жёстко, MODEL.md §6); очки, ранг, порог «годная» и ценность сетов — теми же функциями, что лучшая раскладка
// (features/gear/layout, pool/info). Блокировки сеанса (MODEL.md §7 item 4) — из шторки обмена, не из хранилища.
import type { Ctx } from '@/game/context';
import type { Char, Combo } from '@/game/data/types';
import { combosOf, comboProfile, pinnedProfile, pinOf, profileOf, withNeed } from '@/game/build/profile';
import { comboSig } from '@/game/build/variants';
import { setValue } from '@/game/set/setValue';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { critBound, critLossOf, gearRank, nonChc, pieceCrit, piecePoints } from '@/features/gear/layout';
import { MAX_LIT } from '@/game/item/subs';
import { mainsStat } from '@/game/stat/total';
import { pieceBar } from '@/features/gear/pool/info';
import { numOf } from '@/features/gear/pool/base';
import { milli, wearable } from '@/features/gear/model/vs';
import { codeOf, heldOf, type CritGauge, type Gauge, type Hero, type Item, type Worth, type World } from './model';

// заказ «По статам»; набор — подпись связки (comboSig)
export const STATS = 'stats';

// chc — the piece's most crit (MODEL.md §12 item 6): its CHC main at +10 by tier and CHC substats; the same for every hero
export const itemOf = (p: Piece, ctx: Ctx): Item => ({
  id: p.id, slot: p.slot, code: codeOf(p), bt: p.bt, set: p.setId, t4: p.bt === 4, ord: numOf(p.id), grade: p.grade,
  chc: mainsStat(ctx, p, 'CHC') + Math.min(MAX_LIT, p.lit.CHC ?? 0) * (ctx.idx.SUB.CHC?.step ?? 3),
});

// набор заказа; «По статам» и подпись, которой у героя нет (данные обновились), — null
export const orderCombo = (c: Char, order: string): Combo | null =>
  (order === STATS ? null : combosOf(c).find((x) => comboSig(x) === order) ?? null);

export interface WorldOpts {
  locked?: ReadonlySet<string>;               // переодетые в этом окне (MODEL.md §7 item 4)
  orders?: Readonly<Record<string, string>>;  // герой → заказ; нет — «По статам»
}

// the crit part of a gauge (MODEL.md §12 item 6): the same curve and C₀ as layoutValue, over the kit's pieces; Po — the order's
// profile (its halves decide which crit set rows carry points), with the hero's N and chain
function critGauge(Po: Parameters<typeof critLossOf>[0], pieceOf: (id: string) => Piece | undefined): CritGauge {
  const of = (ids: readonly string[]) => ids.map(pieceOf).filter((p): p is Piece => !!p);
  const losses = new Map<string, number>(); // keyOf asks for the same kits many times (threshold, team orders)
  const b = critBound(Po);
  const setUp = new Map<string, number>();
  return {
    own: b.own,
    knee: b.knee,
    rowsMax: b.rows,
    setMax(set) { let r = setUp.get(set); if (r === undefined) setUp.set(set, (r = b.set(set))); return r; },
    loss(ids) {
      const k = ids.join(',');
      let r = losses.get(k);
      if (r === undefined) losses.set(k, (r = milli(critLossOf(Po, of(ids)))));
      return r;
    },
    facts(id) {
      const p = pieceOf(id);
      if (!p) return { w: 0, n: 0, main: 0, non: 0 };
      const k = pieceCrit(Po, p);
      return { w: k.w, n: k.n, main: k.main, non: milli(nonChc(Po, p)) };
    },
  };
}

// roster — порядок ростера (ogc.roster)
export function worldOf(ctx: Ctx, st: GearStore, roster: readonly string[], o: WorldOpts = {}): World {
  const place = (id: string) => { const i = roster.indexOf(id); return i < 0 ? roster.length : i; };
  const ids = Object.keys(st.pools).filter((id) => st.pools[id].length && ctx.idx.CHAR[id]);
  ids.sort((a, z) => place(a) - place(z));
  const heroes: Hero[] = ids.map((id, rank) => ({ id, rank, locked: !!o.locked?.has(id), worn: { ...(st.worn?.[id] ?? {}) }, pool: [...st.pools[id]] }));
  const items: Record<string, Item> = {};
  for (const p of Object.values(st.pieces)) items[p.id] = itemOf(p, ctx);
  const memo = new Map<string, Gauge | null>();
  const gauge = (heroId: string): Gauge | null => {
    if (memo.has(heroId)) return memo.get(heroId)!;
    const c = ctx.idx.CHAR[heroId];
    const base = c ? profileOf(ctx, c) : null;
    if (!c || !base) { memo.set(heroId, null); return null; }
    const P = withNeed(base, st.crit?.[heroId]); // the hero's N (MODEL.md §12 item 1)
    // закреплённый (MODEL.md §6, MODEL.md §7 item 1) — жёстко: его набор, цепочка его билда, броня других сетов не годна; заказ не меняется
    const pin = pinOf(c, st.pin?.[heroId]);
    const Pv = pin ? pinnedProfile(P, pin) : P;
    const combo = pin ? pin.combo : orderCombo(c, o.orders?.[heroId] ?? STATS);
    const Po = pin ? Pv : combo ? comboProfile(P, combo) : P;
    const vals = new Map<string, Worth | null>();
    const g: Gauge = {
      key: combo ? comboSig(combo) : STATS,
      parts: (combo ?? []).map((p) => ({ set: p.set, n: p.n })),
      value(itemId) {
        if (vals.has(itemId)) return vals.get(itemId)!;
        const p = st.pieces[itemId];
        const r = p && wearable(ctx, c, p) ? { v: milli(piecePoints(Pv, p)), fit: gearRank(Pv, p), ok: pieceBar(Pv, p).pass } : null;
        vals.set(itemId, r);
        return r;
      },
      bonus(set, n, n4) {
        const sv = setValue(Po, set, n, n4);
        return { v: milli(sv.value), halves: sv.halves, eff: sv.effect ? sv.halves : 0 };
      },
      ...(Po.critOn ? { crit: critGauge(Po, (id) => st.pieces[id]) } : {}),
    };
    memo.set(heroId, g);
    return g;
  };
  return { heroes, items, gauge, held: heldOf({ heroes }) };
}
