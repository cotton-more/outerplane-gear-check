// «Партия» (.x/0110-batch/PLAN.md §3): one plan for pieces entered as a batch. No new rules: every piece goes through the
// usual verdict (features/gear/verdict), strongest first, against a copy of the store where earlier decisions are already
// applied with the usual operations (features/gear/pool putOn, stashOn) — later pieces see the earlier keepers, a weak
// piece feeds a keeper of its grade, set and slot instead of going to dismantle. One piece — one fate.
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import type { ItemInput } from '@/game/item/item';
import { pieceInput, type GearStore, type Piece } from '@/features/gear/model/gear';
import { putOn, removeFrom, removeUndo, stashOn, undoPut, type PutResult } from '@/features/gear/pool';
import { heroPool, verdictOf, type HeroPool, type Pools, type Result, type Same } from '@/features/gear/verdict';

// a piece as entered; #n = index + 1. twin — «Это другой»: it only looks like a set-aside record
export interface Entry { input: ItemInput; twin?: boolean }

// what a feed line points at: a piece of this batch (#n) or a recorded piece of a hero
export type Target = { entry: number } | { c: Char; piece: Piece };
export type Fate =
  | { kind: 'wear'; c: Char; instead: Piece | null; t4: boolean }   // instead — the worn piece of the slot it replaces
  | { kind: 'keep'; c: Char; t4: boolean; held?: boolean }          // held — a taken-off piece the hero's pool still keeps
  | { kind: 'reserve'; c: Char }
  | { kind: 'feed'; to: Target }
  | { kind: 'same'; same: Same }
  | { kind: 'maybe'; heroes: Char[] }
  | { kind: 'junk' }
  | { kind: 'none' };                                               // no verdict: the item isn't in outerpedia data
// a piece the plan takes from a hero: was — how the hero held it, 'worn' (taken off) or 'stash' (a set-aside record)
export interface Off { c: Char; piece: Piece; was: 'worn' | 'stash' }
// n — the entry; a taken-off piece (off) sits right under the entry that replaced it. id — key for «Не брать»
export interface Line { id: string; n: number; off?: Off; input: ItemInput; fate: Fate }
export type Op =
  | { c: string; r: PutResult }                                          // «Надень» (putOn) or «Отложи» (stashOn)
  | { c: string; drop: Piece; back: (x: GearStore) => GearStore };       // another hero's reserve leaves (removeFrom)
export interface Counts { wear: number; keep: number; feed: number; junk: number }
export interface Plan {
  lines: Line[];
  st: GearStore;                     // the store after the plan, «T4» marks included
  ops: Op[];                         // in the order made; «Вернуть» undoes them newest first
  t4: string[];                      // records the plan feeds four times — «T4» on «Сделал» (Q6)
  wornFed: boolean;                  // a feed goes to a recorded piece: the «до 4 — остановись на T4» footnote
  counts: Counts;
}

// «Не брать»: the key of a line and a hero left out for it
export const skipKey = (line: string, hero: string): string => `${line}>${hero}`;
const FEEDS = 4;                     // one piece — one Breakthrough step, T0 → T4

// pools of a store copy: a hero whose pool, worn and pin didn't change keeps the pool computed before
function poolsOf(ctx: Ctx): (st: GearStore) => Pools {
  const cache = new Map<string, { sig: string; hp: HeroPool | null }>();
  return (st) => (id) => {
    const ids = st.pools[id] ?? [];
    const sig = `${ids.join(',')}|${JSON.stringify(st.worn?.[id] ?? {})}|${st.pin?.[id] ?? ''}`;
    const hit = cache.get(id);
    if (hit && hit.sig === sig) return hit.hp;
    const c = ctx.idx.CHAR[id];
    const pieces = ids.map((pid) => st.pieces[pid]).filter((p): p is Piece => !!p);
    const mine = new Set(pieces.map((p) => p.id));
    const worn = new Set(Object.values(st.worn?.[id] ?? {}).filter((x): x is string => !!x && mine.has(x)));
    const hp = c ? heroPool(ctx, c, pieces, worn, st.pin?.[id]) : null;
    cache.set(id, { sig, hp });
    return hp;
  };
}

// processing order: stronger outcome first (against the real store), then the bigger gain; ties — by content, so the
// entered order never decides a fate
const RANK: Record<Result['kind'], number> = { wear: 4, keep: 3, material: 2, maybe: 1, junk: 0 };
const scoreOf = (r: Result | null): [number, number] =>
  !r ? [-1, 0] : [RANK[r.kind], r.kind === 'wear' ? r.named[0].dV : r.kind === 'keep' ? r.named[0].margin : 0];
const contentKey = (x: ItemInput): string =>
  JSON.stringify([x.slot, x.grade, x.setId, x.itemKey, x.main, Object.entries(x.subs), x.bt ?? null, !!x.unlisted]);
// a recorded piece as a form input (its own «T4»)
export const inputOfPiece = (p: Piece): ItemInput => ({ ...pieceInput(p), bt: p.bt === 4 ? 4 : p.bt === null ? null : 0 });

export function planBatch(ctx: Ctx, base: GearStore, entries: readonly Entry[], skip: ReadonlySet<string> = new Set()): Plan {
  const pools = poolsOf(ctx);
  const skipOf = (line: string): Set<string> =>
    new Set([...skip].filter((k) => k.startsWith(line + '>')).map((k) => k.slice(line.length + 1)));
  const order = entries
    .map((e, i) => ({ n: i + 1, e, s: scoreOf(verdictOf(ctx, pools(base), e.input, { twin: e.twin, skip: skipOf(String(i + 1)) })), k: contentKey(e.input) }))
    .sort((a, z) => z.s[0] - a.s[0] || z.s[1] - a.s[1] || (a.k < z.k ? -1 : a.k > z.k ? 1 : 0) || a.n - z.n);

  let st = base;
  const ops: Op[] = [];
  const made = new Map<string, number>();       // record made by the plan for an entry → #n
  const feeds = new Map<string, number>();      // target record → pieces it gets
  const full = new Set<string>();
  let wornFed = false;
  const fates = new Map<string, Fate>();
  const offs: ({ id: string; n: number } & Off)[] = [];
  const offId = (n: number) => `${n}~${offs.filter((o) => o.n === n).length + 1}`;

  // one piece: its verdict on the current copy, the decision applied to it. n — the entry (for a taken-off piece — the
  // entry that took it off); entry — false for a taken-off piece (its records aren't «#n»)
  const decide = (line: string, n: number, input: ItemInput, twin: boolean, entry: boolean): Fate => {
    let r = verdictOf(ctx, pools(st), input, { twin, skip: skipOf(line), full });
    // a look-alike made by this very plan is another piece of the batch, not a set-aside one
    if (r?.same && [...made.keys()].includes(r.same.piece.id)) r = verdictOf(ctx, pools(st), input, { twin: true, skip: skipOf(line), full });
    if (!r) return { kind: 'none' };
    if (r.same) return { kind: 'same', same: r.same };
    if (r.kind === 'wear') {
      const c = r.named[0].c;
      const before = st;
      const res = putOn(ctx, st, c.id, input);
      st = res.st;
      ops.push({ c: c.id, r: res });
      if (entry) made.set(res.id, n);
      const was = res.wasWorn ? before.pieces[res.wasWorn] ?? null : null;
      // the worn piece of its slot comes off in the game: a line of its own (Q4) — the pool dropped it, or still keeps it
      if (was) {
        const id = offId(n);
        offs.push({ id, n, c, piece: was, was: 'worn' });
        if (!res.removed.some((p) => p.id === was.id)) fates.set(id, { kind: 'keep', c, t4: false, held: true });
      }
      // a set-aside record of its slot the new one pushes out (the hero's weak reserve) is a piece in the game too: a line
      for (const p of res.removed) {
        if (p.slot === res.slot && p.id !== res.wasWorn && base.pieces[p.id]) offs.push({ id: offId(n), n, c, piece: p, was: 'stash' });
      }
      // another hero's reserve goes to this one's Breakthrough (verdict feedFrom): it leaves that pool, as with a single
      // «Надеть» (useFormFlow equipOn), before it is decided — it must not look like its own record
      const h = r.named[0];
      if (h.reserveOf && h.reserveBt && h.reserveOf.id !== c.id && st.pools[h.reserveOf.id]?.includes(h.reserveBt.id)) {
        const of = h.reserveOf, p = h.reserveBt;
        ops.push({ c: of.id, drop: p, back: removeUndo(st, of.id, p) });
        st = removeFrom(st, of.id, p.id);
        offs.push({ id: offId(n), n, c: of, piece: p, was: 'stash' });
      }
      return { kind: 'wear', c, instead: was, t4: false };
    }
    if (r.kind === 'keep' || (r.kind === 'material' && r.sub === 'reserve')) {
      const c = r.kind === 'keep' ? r.named[0].c : r.reserve[0];
      const res = stashOn(st, c.id, input);
      st = res.st;
      ops.push({ c: c.id, r: res });
      if (entry) made.set(res.id, n);
      return r.kind === 'keep' ? { kind: 'keep', c, t4: false } : { kind: 'reserve', c };
    }
    if (r.kind === 'material' && r.sub === 'now') {
      const tg = r.now[0];
      const k = (feeds.get(tg.piece.id) ?? 0) + 1;
      feeds.set(tg.piece.id, k);
      if (k >= FEEDS) full.add(tg.piece.id);
      const of = made.get(tg.piece.id);
      if (of === undefined) wornFed = true;
      return { kind: 'feed', to: of !== undefined ? { entry: of } : { c: tg.c, piece: tg.piece } };
    }
    if (r.kind === 'maybe') return { kind: 'maybe', heroes: r.maybe };
    return { kind: 'junk' };
  };

  for (const { n, e } of order) fates.set(String(n), decide(String(n), n, e.input, !!e.twin, true));
  // taken-off pieces after the batch, in the order they came off; one may take another off (chain, bounded)
  for (let i = 0; i < offs.length && i < entries.length * 3; i++) {
    const o = offs[i];
    if (!fates.has(o.id)) fates.set(o.id, decide(o.id, o.n, inputOfPiece(o.piece), false, false));
  }

  // «T4»: a new piece the plan feeds four times (Q6); feeds to recorded pieces — the player marks it in the game
  const t4 = [...made.keys()].filter((id) => (feeds.get(id) ?? 0) >= FEEDS && st.pieces[id] && st.pieces[id].bt !== 4);
  if (t4.length) st = { ...st, pieces: { ...st.pieces, ...Object.fromEntries(t4.map((id) => [id, { ...st.pieces[id], bt: 4 as const }])) } };
  const t4Of = new Set(t4.map((id) => made.get(id)!));

  const lines: Line[] = [];
  entries.forEach((e, i) => {
    const n = i + 1;
    let fate = fates.get(String(n))!;
    if ((fate.kind === 'wear' || fate.kind === 'keep') && t4Of.has(n)) fate = { ...fate, t4: true };
    lines.push({ id: String(n), n, input: e.input, fate });
    for (const o of offs.filter((x) => x.n === n && fates.has(x.id))) {
      lines.push({ id: o.id, n, off: { c: o.c, piece: o.piece, was: o.was }, input: inputOfPiece(o.piece), fate: fates.get(o.id)! });
    }
  });
  const counts: Counts = { wear: 0, keep: 0, feed: 0, junk: 0 };
  for (const { fate: f } of lines) {
    if (f.kind === 'wear') counts.wear++;
    else if ((f.kind === 'keep' && !f.held) || f.kind === 'reserve') counts.keep++;
    else if (f.kind === 'feed') counts.feed++;
    else if (f.kind === 'junk') counts.junk++;
  }
  return { lines, st, ops, t4, wornFed, counts };
}

// «Вернуть» после «Сделал»: the operations' own undos, newest first — not a snapshot (it would wipe what was done
// during these seconds). «T4» marks sit on records the plan made: undoing them removes the marks too
export function undoPlan(st: GearStore, plan: Pick<Plan, 'ops'>): GearStore {
  let x = st;
  for (const op of [...plan.ops].reverse()) x = 'drop' in op ? op.back(x) : undoPut(x, op.c, op.r);
  return x;
}
