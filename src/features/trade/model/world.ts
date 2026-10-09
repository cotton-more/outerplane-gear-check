// Мост к приложению: мир обмена из хранилища и данных. Мерило героя — его заказ (.x/0085 FORMULA §7 п. 1): «По статам»,
// набор из его билдов или, у закреплённого, его закрепление (жёстко, §6); очки, ранг, порог «годная» и ценность сетов — теми же функциями, что лучшая раскладка
// (features/gear/layout, pool/info). Блокировки сеанса (§7 п. 4) — из шторки обмена, не из хранилища.
import type { Ctx } from '@/game/context';
import type { Char, Combo } from '@/game/data/types';
import { combosOf, comboProfile, pinnedProfile, pinOf, profileOf } from '@/game/build/profile';
import { comboSig } from '@/game/build/variants';
import { setValue } from '@/game/set/setValue';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { gearRank, piecePoints } from '@/features/gear/layout';
import { pieceBar } from '@/features/gear/pool/info';
import { numOf } from '@/features/gear/pool/base';
import { milli, wearable } from '@/features/gear/model/vs';
import { codeOf, type Gauge, type Hero, type Item, type Worth, type World } from './model';

// заказ «По статам»; набор — подпись связки (comboSig)
export const STATS = 'stats';

export const itemOf = (p: Piece): Item =>
  ({ id: p.id, slot: p.slot, code: codeOf(p), bt: p.bt, set: p.setId, t4: p.bt === 4, ord: numOf(p.id), grade: p.grade });

// набор заказа; «По статам» и подпись, которой у героя нет (данные обновились), — null
export const orderCombo = (c: Char, order: string): Combo | null =>
  (order === STATS ? null : combosOf(c).find((x) => comboSig(x) === order) ?? null);

export interface WorldOpts {
  locked?: ReadonlySet<string>;               // переодетые в этом окне (§7 п. 4)
  orders?: Readonly<Record<string, string>>;  // герой → заказ; нет — «По статам»
}

// roster — порядок ростера (ogc.roster)
export function worldOf(ctx: Ctx, st: GearStore, roster: readonly string[], o: WorldOpts = {}): World {
  const place = (id: string) => { const i = roster.indexOf(id); return i < 0 ? roster.length : i; };
  const ids = Object.keys(st.pools).filter((id) => st.pools[id].length && ctx.idx.CHAR[id]);
  ids.sort((a, z) => place(a) - place(z));
  const heroes: Hero[] = ids.map((id, rank) => ({ id, rank, locked: !!o.locked?.has(id), worn: { ...(st.worn?.[id] ?? {}) }, pool: [...st.pools[id]] }));
  const items: Record<string, Item> = {};
  for (const p of Object.values(st.pieces)) items[p.id] = itemOf(p);
  const memo = new Map<string, Gauge | null>();
  const gauge = (heroId: string): Gauge | null => {
    if (memo.has(heroId)) return memo.get(heroId)!;
    const c = ctx.idx.CHAR[heroId];
    const P = c ? profileOf(ctx, c) : null;
    if (!c || !P) { memo.set(heroId, null); return null; }
    // закреплённый (§6, §7 п. 1) — жёстко: его набор, цепочка его билда, броня других сетов не годна; заказ не меняется
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
    };
    memo.set(heroId, g);
    return g;
  };
  return { heroes, items, gauge };
}
