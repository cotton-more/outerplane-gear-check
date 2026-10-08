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

// a piece as entered; n — its position in the game list (E and 🔒 entries count too, batch.ts entriesOf), default
// index + 1. twin — «Это другой»: it only looks like a set-aside record
export interface Entry { input: ItemInput; twin?: boolean; n?: number }

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
  | { c: string; drop: Piece; back: (x: GearStore) => GearStore }        // another hero's reserve leaves (removeFrom)
  | { bt: string; was: Piece['bt'] };                                    // a recorded piece fed four times gets «T4»
export interface Counts { wear: number; keep: number; feed: number; junk: number }
export interface Plan {
  lines: Line[];
  st: GearStore;                     // the store after the plan, «T4» marks included
  ops: Op[];                         // in the order made; «Вернуть» undoes them newest first
  t4: string[];                      // records the plan feeds four times — «T4» on «Записать план»: any tier below T4 + 4
                                     // feeds is T4 (owner 2026-10-08: Viella's worn gloves weren't marked)
  wornFed: boolean;                  // a recorded piece gets fewer than 4: the «до 4 — остановись на T4» footnote
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
// «Вернуть» for another hero's reserve the plan removed: back into that pool at its old place
function dropBack(before: GearStore, c: string, p: Piece): (x: GearStore) => GearStore {
  const undo = removeUndo(before, c, p), was = before.pools[c] ?? [];
  return (x) => {
    const y = undo(x);
    const pool = (y.pools[c] ?? []).filter((id) => id !== p.id);
    const after = was.slice(0, was.indexOf(p.id)).reverse().find((id) => pool.includes(id));
    pool.splice(after === undefined ? 0 : pool.indexOf(after) + 1, 0, p.id);
    return { ...y, pools: { ...y.pools, [c]: pool } };
  };
}
// a recorded piece as a form input (its own «T4»)
export const inputOfPiece = (p: Piece): ItemInput => ({ ...pieceInput(p), bt: p.bt === 4 ? 4 : p.bt === null ? null : 0 });

// One physical piece — one line: a later «Надень» may take off or drop a record the plan itself made for line L. Such a
// record never gets a taken-off line; L is fixed instead — eaten as a reserve → «Корм» for the piece that ate it (in
// the pass); after the pass: still in the pool, no longer worn → «Отложи» (held); gone → the plan is made again without
// that hero for L (an internal «Не брать», not saved, not shown). Each round adds exclusions only, so it ends; at most
// one round per entry
export function planBatch(ctx: Ctx, base: GearStore, entries: readonly Entry[], skip: ReadonlySet<string> = new Set()): Plan {
  const pools = poolsOf(ctx);
  const out = new Set(skip);
  for (let round = 0; ; round++) {
    const { plan, gone } = pass(ctx, pools, base, entries, out);
    if (!gone.length || round >= entries.length) return plan;
    for (const k of gone) out.add(k);
  }
}

function pass(ctx: Ctx, pools: (st: GearStore) => Pools, base: GearStore, entries: readonly Entry[], skip: ReadonlySet<string>): { plan: Plan; gone: string[] } {
  const skipOf = (line: string): Set<string> =>
    new Set([...skip].filter((k) => k.startsWith(line + '>')).map((k) => k.slice(line.length + 1)));
  const order = entries
    .map((e, i) => ({ n: e.n ?? i + 1, e, s: scoreOf(verdictOf(ctx, pools(base), e.input, { twin: e.twin, skip: skipOf(String(e.n ?? i + 1)) })), k: contentKey(e.input) }))
    .sort((a, z) => z.s[0] - a.s[0] || z.s[1] - a.s[1] || (a.k < z.k ? -1 : a.k > z.k ? 1 : 0) || a.n - z.n);

  let st = base;
  const ops: Op[] = [];
  const made = new Map<string, number>();       // record made by the plan for an entry → #n
  const madeBy = new Map<string, string>();     // every record the plan made → its line
  const feeds = new Map<string, number>();      // target record → pieces it gets
  const full = new Set<string>();
  let wornFed = false;
  const fates = new Map<string, Fate>();
  type OffLine = { id: string; n: number } & Off;
  const offs: OffLine[] = [];                   // lines of pieces the plan takes from heroes
  const todo: OffLine[] = [];                   // …to decide after the batch, in the order they came off
  const offId = (n: number) => `${n}~${offs.filter((o) => o.n === n).length + 1}`;
  const held = (o: OffLine) => { const f = fates.get(o.id); return f?.kind === 'keep' && !!f.held; };
  // a recorded piece the plan takes: its line under entry n. One piece — one line: if it has one already and the pool
  // kept it (held), a later «Надень» took it after all — that line is decided again
  const takeOff = (n: number, c: Char, piece: Piece, was: Off['was']): OffLine => {
    const o = offs.find((x) => x.piece.id === piece.id);
    if (!o) { const x = { id: offId(n), n, c, piece, was }; offs.push(x); todo.push(x); return x; }
    if (held(o)) { fates.delete(o.id); todo.push(o); }
    return o;
  };

  // one piece: its verdict on the current copy, the decision applied to it. n — the entry (for a taken-off piece — the
  // entry that took it off); entry — false for a taken-off piece (its records aren't «#n»)
  const decide = (line: string, n: number, input: ItemInput, twin: boolean, entry: boolean): Fate => {
    let r = verdictOf(ctx, pools(st), input, { twin, skip: skipOf(line), full });
    // a look-alike made by this very plan is another piece of the batch, not a set-aside one
    if (r?.same && madeBy.has(r.same.piece.id)) r = verdictOf(ctx, pools(st), input, { twin: true, skip: skipOf(line), full });
    if (!r) return { kind: 'none' };
    if (r.same) return { kind: 'same', same: r.same };
    if (r.kind === 'wear') {
      const c = r.named[0].c;
      const before = st;
      const res = putOn(ctx, st, c.id, input);
      st = res.st;
      ops.push({ c: c.id, r: res });
      if (entry) made.set(res.id, n);
      madeBy.set(res.id, line);
      const was = res.wasWorn ? before.pieces[res.wasWorn] ?? null : null;
      // the worn piece of its slot comes off in the game: a line of its own (Q4) — the pool dropped it, or still keeps it.
      // A record the plan made is not a new piece: its own line is fixed after the pass
      if (was && !madeBy.has(was.id)) {
        const o = takeOff(n, c, was, 'worn');
        if (!res.removed.some((p) => p.id === was.id)) fates.set(o.id, { kind: 'keep', c, t4: false, held: true });
      }
      // a reserve this new piece eats (its verdict's reserveBt — the hero's own or other heroes', feedFrom): one the plan
      // made for line L is fed to it — L says so (owner 2026-10-07: not planned again), one of its four feeds
      const h = r.named[0];
      const eaten = (p: Piece) => {
        const L = madeBy.get(p.id);
        const k = (feeds.get(res.id) ?? 0) + 1;
        if (!L || !h.reserveBt.some((f) => f.piece.id === p.id) || fates.get(L)?.kind !== 'reserve' || k > FEEDS) return;
        feeds.set(res.id, k);
        if (k >= FEEDS) full.add(res.id);
        if (!entry) wornFed = true;
        fates.set(L, { kind: 'feed', to: entry ? { entry: n } : { c, piece: res.piece } });
      };
      // a set-aside record of its slot the new one pushes out (the hero's weak reserve) is a piece in the game too: a line
      // (other slots: the «Лишнее убрано» note on «Сделал»; only a taken-off piece the pool kept is decided again)
      for (const p of res.removed) {
        if (p.id === res.wasWorn) continue;
        if (madeBy.has(p.id)) { if (p.slot === res.slot) eaten(p); }
        else if (p.slot === res.slot || offs.some((o) => o.piece.id === p.id && held(o))) takeOff(n, c, p, 'stash');
      }
      // other heroes' reserves go to this one's Breakthrough: they leave those pools, as with a single «Надеть»
      // (useFormFlow equipOn), before they are decided — they must not look like their own records
      for (const { piece: p, of } of h.reserveBt) {
        if (!of || of.id === c.id || !st.pools[of.id]?.includes(p.id)) continue;
        ops.push({ c: of.id, drop: p, back: dropBack(st, of.id, p) });
        st = removeFrom(st, of.id, p.id);
        if (madeBy.has(p.id)) eaten(p);
        else takeOff(n, of, p, 'stash');
      }
      return { kind: 'wear', c, instead: was, t4: false };
    }
    if (r.kind === 'keep' || (r.kind === 'material' && r.sub === 'reserve')) {
      const c = r.kind === 'keep' ? r.named[0].c : r.reserve[0];
      const res = stashOn(st, c.id, input);
      st = res.st;
      ops.push({ c: c.id, r: res });
      if (entry) made.set(res.id, n);
      madeBy.set(res.id, line);
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
  for (let i = 0; i < todo.length && i < entries.length * 3; i++) {
    const o = todo[i];
    if (!fates.has(o.id)) fates.set(o.id, decide(o.id, o.n, inputOfPiece(o.piece), false, false));
  }

  // records the plan made that a later «Надень» took off (held: «Отложи» instead of «Надень») or dropped (gone)
  const gone: string[] = [];
  for (const [id, line] of madeBy) {
    const f = fates.get(line);
    if (!f || (f.kind !== 'wear' && f.kind !== 'keep' && f.kind !== 'reserve')) continue;
    if (!st.pools[f.c.id]?.includes(id)) gone.push(skipKey(line, f.c.id));
    else if (f.kind === 'wear' && st.worn?.[f.c.id]?.[st.pieces[id].slot] !== id) fates.set(line, { kind: 'keep', c: f.c, t4: false });
  }

  // «T4»: a piece the plan feeds four times — a new one (Q6) or a recorded one: from any tier below T4, four feeds reach
  // T4 (the game takes no more than it needs). A recorded one's mark is an op of its own, for «Вернуть»
  const t4 = [...feeds].filter(([id, k]) => k >= FEEDS && st.pieces[id] && st.pieces[id].bt !== 4).map(([id]) => id);
  for (const id of t4) if (!made.has(id)) ops.push({ bt: id, was: st.pieces[id].bt });
  if (t4.length) st = { ...st, pieces: { ...st.pieces, ...Object.fromEntries(t4.map((id) => [id, { ...st.pieces[id], bt: 4 as const }])) } };
  wornFed = [...feeds].some(([id, k]) => !made.has(id) && k < FEEDS);
  const t4Of = new Set(t4.map((id) => made.get(id)!));

  const lines: Line[] = [];
  entries.forEach((e, i) => {
    const n = e.n ?? i + 1;
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
  return { plan: { lines, st, ops, t4, wornFed, counts }, gone };
}

// «Вернуть» после «Сделал»: the operations' own undos, newest first — not a snapshot (it would wipe what was done
// during these seconds). «T4» marks sit on records the plan made: undoing them removes the marks too
export function undoPlan(st: GearStore, plan: Pick<Plan, 'ops'>): GearStore {
  let x = st;
  for (const op of [...plan.ops].reverse()) {
    if ('bt' in op) x = x.pieces[op.bt] ? { ...x, pieces: { ...x.pieces, [op.bt]: { ...x.pieces[op.bt], bt: op.was } } } : x;
    else x = 'drop' in op ? op.back(x) : undoPut(x, op.c, op.r);
  }
  return x;
}
