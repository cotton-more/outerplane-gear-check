// Пул экипировки, вид пула — всё о персонажах с вещами, один раз на хранилище. Обзор и решения — index.ts.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import type { PoolStore } from './base';
import { heroPool, type HeroPool, type Pools } from '@/features/gear/verdict';

export interface CharPool {
  c: Char;
  pieces: Piece[];
  unused: Piece[]; // «больше не нужна»: пул героя их не держит (features/gear/pool/info, FORMULA §5 п. 6)
  worn: Set<string>; // надетые записи героя (его пул держит их всегда; «надета» вместо «где стоит» — PoolList)
}

export interface PoolView {
  st: PoolStore;
  of: (charId: string) => CharPool | null;
  hero: Pools;    // пул героя по «статам + сетам» (features/gear/pool/info): что держится и почему
}

// один раз на хранилище: персонажи считаются по запросу и запоминаются
export function poolView(ctx: Ctx, st: PoolStore): PoolView {
  const heroes = new Map<string, HeroPool | null>();
  const hero = (id: string): HeroPool | null => {
    if (heroes.has(id)) return heroes.get(id)!;
    const c = ctx.idx.CHAR[id];
    const pieces = (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const mine = new Set(pieces.map((p) => p.id));
    const worn = new Set(Object.values(st.worn?.[id] ?? {}).filter((x): x is string => !!x && mine.has(x)));
    const r = c ? heroPool(ctx, c, pieces, worn, st.pin?.[id]) : null;
    heroes.set(id, r);
    return r;
  };
  const memo = new Map<string, CharPool | null>();
  const of = (id: string): CharPool | null => {
    if (memo.has(id)) return memo.get(id)!;
    const c = ctx.idx.CHAR[id];
    const pieces = (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const mine = new Set(pieces.map((p) => p.id));
    const worn = new Set(Object.values(st.worn?.[id] ?? {}).filter((x): x is string => !!x && mine.has(x)));
    // «больше не нужна» — по «статам + сетам» (features/gear/pool/info, FORMULA §5 п. 6)
    const r = c ? { c, pieces, worn, unused: hero(id)?.info.unneeded ?? [] } : null;
    memo.set(id, r);
    return r;
  };
  return { st, of, hero };
}
