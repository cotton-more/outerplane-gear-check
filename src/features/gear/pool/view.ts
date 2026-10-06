// Пул экипировки, вид пула — всё о персонажах с вещами, один раз на хранилище. Обзор и решения — index.ts.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { Piece } from '@/features/gear/model/gear';
import type { PoolStore } from './base';
import { heroOpts, play, usedIn, type PlayOpts, type Play } from './play';
import { heroPool, type HeroPool, type Pools } from '@/features/gear/verdict';

export interface CharPool extends Play {
  c: Char;
  pieces: Piece[];
  unused: Piece[]; // вещи, которых нет ни в одной сборке, что держит пул (usedIn): в пуле им быть незачем (решение владельца)
  opts: PlayOpts;  // опции его сборки (heroOpts): отметки и его надетое — с ними же planFor, computeOutcome, putOn
  worn: Set<string>; // надетые записи героя (его пул держит их всегда; «надета» вместо «где стоит» — PoolList)
}

export interface PoolView {
  st: PoolStore;
  opts: PlayOpts;
  of: (charId: string) => CharPool | null;
  hero: Pools;    // пул героя по «статам + сетам» (features/gear/pool/info): что держится и почему
}

// один раз на хранилище: персонажи считаются по запросу и запоминаются. opts — общие (отметки); надетое — у каждого
// героя своё (CharPool.opts)
export function poolView(ctx: Ctx, st: PoolStore): PoolView {
  const opts: PlayOpts = { marks: st.marks };
  const memo = new Map<string, CharPool | null>();
  const of = (id: string): CharPool | null => {
    if (memo.has(id)) return memo.get(id)!;
    const c = ctx.idx.CHAR[id];
    const pieces = (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const po = heroOpts(st, id);
    const mine = new Set(pieces.map((p) => p.id));
    const worn = new Set(Object.values(po.worn ?? {}).filter((x): x is string => !!x && mine.has(x)));
    const r = c ? { c, pieces, ...play(ctx, c, pieces, po), unused: [] as Piece[], opts: po, worn } : null;
    if (r) {
      const used = usedIn(r);
      r.unused = pieces.filter((p) => !used.has(p.id));
    }
    memo.set(id, r);
    return r;
  };
  const heroes = new Map<string, HeroPool | null>();
  const hero = (id: string): HeroPool | null => {
    if (heroes.has(id)) return heroes.get(id)!;
    const c = ctx.idx.CHAR[id];
    const pieces = (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const mine = new Set(pieces.map((p) => p.id));
    const worn = new Set(Object.values(st.worn?.[id] ?? {}).filter((x): x is string => !!x && mine.has(x)));
    const r = c ? heroPool(ctx, c, pieces, worn) : null;
    heroes.set(id, r);
    return r;
  };
  return { st, opts, of, hero };
}
