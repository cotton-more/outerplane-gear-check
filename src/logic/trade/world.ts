// Мост к приложению: мир обмена из хранилища и данных. Мерило героя — билд, который показывает «Надето» (aimOf, R2.1);
// ценность вещи, рекомендованность, бонусы сетов и конвертируемость — теми же функциями, что сборка (logic/pool).
import type { Ctx } from '../context';
import { aimOf } from '../aim';
import { pieceInput, type GearStore, type Piece } from '../gear';
import { poolView } from '../pool';
import { bonusRows, bonusValue, bonusWeights, convertible } from '../setBonus';
import { fit, pieceValue, wearable } from '../vs';
import { codeOf, milli, type Gauge, type Hero, type Item, type SetGain, type World } from './model';

// номер записи из id («p12» → 12), как в logic/pool
const numOf = (id: string) => { const n = Number(id.replace(/^\D+/, '')); return Number.isFinite(n) ? n : 0; };

export const itemOf = (p: Piece): Item =>
  ({ id: p.id, slot: p.slot, code: codeOf(p), bt: p.bt, set: p.setId, t4: p.bt === 4, ord: numOf(p.id) });

// roster — порядок ростера (ogc.roster); pinned — закреплённые (R3), по умолчанию — из хранилища
export function worldOf(ctx: Ctx, st: GearStore, roster: readonly string[], pinned: ReadonlySet<string> = new Set(st.pinned ?? [])): World {
  const place = (id: string) => { const i = roster.indexOf(id); return i < 0 ? roster.length : i; };
  const ids = Object.keys(st.pools).filter((id) => st.pools[id].length && ctx.idx.CHAR[id]);
  ids.sort((a, z) => place(a) - place(z));
  const heroes: Hero[] = ids.map((id, rank) => ({ id, rank, pinned: pinned.has(id), worn: { ...(st.worn?.[id] ?? {}) }, pool: [...st.pools[id]] }));
  const items: Record<string, Item> = {};
  for (const p of Object.values(st.pieces)) items[p.id] = itemOf(p);
  const view = poolView(ctx, st);
  const memo = new Map<string, Gauge | null>();
  const gauge = (heroId: string): Gauge | null => {
    if (memo.has(heroId)) return memo.get(heroId)!;
    const c = ctx.idx.CHAR[heroId];
    const cp = c?.builds.length ? view.of(heroId) : null;
    const variant = cp ? cp.variants.find((v) => v.key === aimOf(c, st, cp).key) ?? null : null;
    if (!c || !variant) { memo.set(heroId, null); return null; }
    const W = bonusWeights(ctx, c, variant.b);
    const vals = new Map<string, ReturnType<Gauge['value']>>();
    const bon = new Map<string, SetGain>();
    const g: Gauge = {
      key: variant.key,
      parts: (variant.b.sets[0] ?? []).map((p) => ({ set: p.set, n: p.n, conv: convertible(ctx, c, p.set) })),
      value(itemId) {
        if (vals.has(itemId)) return vals.get(itemId)!;
        const p = st.pieces[itemId];
        const r = p && wearable(ctx, c, p) ? { v: milli(pieceValue(ctx, c, variant.b, p)), fit: fit(ctx, c, variant.b, pieceInput(p)) } : null;
        vals.set(itemId, r);
        return r;
      },
      bonus(set, n, n4) {
        const k = `${set}:${n}:${n4}`;
        let r = bon.get(k);
        if (!r) {
          const rows = bonusRows(ctx.idx.SET, Array.from({ length: n }, (_, i) => ({ setId: set, bt: i < n4 ? 4 : 0 })));
          r = { v: milli(rows.reduce((s, row) => s + bonusValue(ctx, c, W, row), 0)), top: Math.max(0, ...rows.map((row) => row.n)) };
          bon.set(k, r);
        }
        return r;
      },
    };
    memo.set(heroId, g);
    return g;
  };
  return { heroes, items, gauge };
}
