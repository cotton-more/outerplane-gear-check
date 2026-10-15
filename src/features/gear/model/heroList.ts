// The hero list under the verdict stamp (0230 B: owner Q1, Q1b, Q3, Q4): every roster hero the piece makes at least 1 point
// stronger, and the heroes the result offers «Отложить» to. Groups «Вместо надетого» (a piece stands in that slot), «В пустой
// слот», «Отложить»; the group holding the hero the stamp names (★) goes first, then replace → empty → stash. Each group shows
// LIST_CAP rows, the rest wait in `more` («ещё N ▸»). The stamp itself stays the app's advice (features/gear/verdict): this list
// only shows what else the player could do. Hero mode keeps its single row (screens/eval useVerdictModel heroVs); name search
// builds its rows with heroRow(…, { any: true }), as the «Кому надеть?» sheet did. Data only: the texts are the UI's.
import { isArmor } from '@/game/data';
import type { Ctx } from '@/game/context';
import { scoreBuild, type Part } from '@/game/build/score';
import { itemMains } from '@/game/item/mains';
import type { ItemInput } from '@/game/item/item';
import type { PoolView } from '@/features/gear/pool';
import { fillerFits, piecePoints } from '@/features/gear/layout';
import { forcedBest, formPiece, partsDiff, type HeroRes, type PartChange, type Result } from '@/features/gear/verdict';
import type { Piece } from './gear';
import { charVs, type CharVs } from './poolVs';
import { fit, milli, THRESHOLD } from './vs';

export type ListKind = 'replace' | 'empty' | 'stash';
export type ListAction = 'wear' | 'replace' | 'stash';
// rows a group shows before «ещё N ▸» (owner Q1b: at every size)
export const LIST_CAP = 3;

// what the piece takes the place of: the hero's current layout piece of that slot — the quick note «вместо N очк.» and the
// detailed «было» (its substats marked for this hero, as the SubToken chips)
export interface Was { piece: Piece; pts: number; marks: Part[]; worn: boolean }

export interface HeroRow {
  vs: CharVs;                      // the hero, the outcome (vs.h), the piece's substat marks for him (vs.chain.parts), buttons
  gain: number;                    // points the hero gains: dV; a piece below his bar — what it would give if it stood
                                   // (forcedBest, the quiet line's computation)
  star: boolean;                   // the hero the stamp names
  action: ListAction | null;       // the button; null — the same-piece guard: it looks like a piece set aside for another hero
  stash: 'keep' | 'reserve' | null; // a «Отложить» row: «держи» / «запас» instead of a number
  parts: { on: PartChange[]; off: PartChange[] }; // set parts the gain turns on / off (the layout the gain is counted on)
  was: Was | null;                 // null — the slot is empty
}

export interface HeroGroup { kind: ListKind; rows: HeroRow[]; more: HeroRow[] }

export interface HeroRowOpts { h?: HeroRes; stash?: 'keep' | 'reserve'; any?: boolean; star?: boolean; guarded?: boolean }

// One hero's row; null — no build, or the piece isn't for the hero's class (charVs). any — a row for name search: «Надеть»
// whatever the gain. Rows of the list come with the verdict's h (it knows the Breakthrough feeds of other heroes' reserves)
export function heroRow(ctx: Ctx, view: PoolView, charId: string, item: ItemInput, opts: HeroRowOpts = {}): HeroRow | null {
  const vs = charVs(ctx, view, charId, item, { h: opts.h, any: !opts.stash || opts.any, stash: !!opts.stash && !opts.guarded });
  const hp = view.hero(charId);
  if (!vs || !hp) return null;
  const { h } = vs;
  const { P, info } = hp;
  let gain = h.dV;
  let parts = h.parts;
  // below the bar the best layout leaves the piece out (dV 0): count it as worn anyway, as the owner's gains do (RESEARCH §2)
  if (!h.bar) {
    const x = formPiece(item);
    const forced = forcedBest(hp, x);
    if (forced.layout[item.slot]?.id === x.id && forced.value.v - info.value.v > gain) {
      gain = forced.value.v - info.value.v;
      parts = partsDiff(info.value, forced.value);
    }
  }
  const cur = info.layout[item.slot];
  const was: Was | null = cur ? {
    piece: cur, pts: piecePoints(P, cur), worn: info.worn[item.slot]?.id === cur.id,
    marks: scoreBuild(ctx, cur.grade, hp.c, P.chain, cur.lit, itemMains(ctx.idx, cur)).parts,
  } : null;
  const action: ListAction | null = opts.guarded ? null : opts.stash ? 'stash' : vs.replaces ? 'replace' : 'wear';
  return { vs, gain, star: !!opts.star, action, stash: opts.stash ?? null, parts, was };
}

// the hero the stamp names: «Надень» / «Оставь» — the first named; a reserve — the first reserve hero (the title names them)
export function starOf(res: Result): string | null {
  if (res.kind === 'wear' || res.kind === 'keep') return res.named[0]?.c.id ?? null;
  if (res.kind === 'material' && res.sub === 'reserve') return res.reserve[0]?.id ?? null;
  return null;
}

// a weapon or accessory into an empty slot: only for a hero whose build takes its main or lists the item — the filler test
// (layout fillerFits) — or one it is recommended to (fit 'rec', also outside «Развитие»). A gain from substats alone with a
// main the hero doesn't want is no reason to wear it (Mene / Dianne +3,3 for the Saint's Ring, RESEARCH §2)
const mainFits = (ctx: Ctx, h: HeroRes, item: ItemInput): boolean =>
  isArmor(item.slot) || fillerFits(ctx, h.c, item) || h.c.builds.some((b) => fit(ctx, h.c, b, item) === 'rec');

const ORDER: ListKind[] = ['replace', 'empty', 'stash'];

// The list for the verdict (normal mode only). viewOf — the pool view «Надеть» acts on for that hero (useVerdictModel viewOf:
// after the Core Fusion switch for X's CF). Membership: gain ≥ THRESHOLD; the heroes the stamp names (the first row under the
// stamp is the stamp's hero even at a smaller gain — a rank-up weapon, a filler at 0 points); the «Отложить» heroes of today's
// verdict (an «Оставь» named hero, a reserve), unless the piece looks like one already set aside (the same-piece guard:
// those rows lose their buttons, and there is no «Отложить»)
export function heroList(ctx: Ctx, viewOf: (charId: string) => PoolView, item: ItemInput, res: Result | null): HeroGroup[] {
  if (!res) return [];
  const same = res.same;
  const star = starOf(res);
  const stash = new Map<string, 'keep' | 'reserve'>();
  if (!same) {
    if (res.kind === 'keep') for (const h of res.named) stash.set(h.c.id, 'keep');
    if (res.kind === 'material' && res.sub === 'reserve') for (const c of res.reserve) if (!stash.has(c.id)) stash.set(c.id, 'reserve');
  }
  const named = new Set(res.named.map((h) => h.c.id));
  const byKind: Record<ListKind, HeroRow[]> = { replace: [], empty: [], stash: [] };
  for (const h of res.heroes) {
    const id = h.c.id;
    const s = stash.get(id);
    const row = heroRow(ctx, viewOf(id), id, item, { h, stash: s, star: id === star, guarded: !!same && same.c.id !== id });
    if (!row) continue;
    if (s) { byKind.stash.push(row); continue; }
    if (!named.has(id) && (milli(row.gain) < THRESHOLD || (h.slotEmpty && !mainFits(ctx, h, item)))) continue;
    byKind[h.slotEmpty ? 'empty' : 'replace'].push(row);
  }
  const byGain = (a: HeroRow, z: HeroRow) => Number(z.star) - Number(a.star) || z.gain - a.gain || a.vs.c.name.localeCompare(z.vs.c.name);
  byKind.replace.sort(byGain);
  byKind.empty.sort(byGain);
  // «Отложить»: the verdict's order (the «Оставь» heroes by margin, then the reserve heroes, the one already holding it first);
  // the star still leads
  const order = [...stash.keys()];
  byKind.stash.sort((a, z) => Number(z.star) - Number(a.star) || order.indexOf(a.vs.c.id) - order.indexOf(z.vs.c.id));
  const first = ORDER.find((k) => byKind[k].some((r) => r.star));
  return [...(first ? [first] : []), ...ORDER.filter((k) => k !== first)]
    .filter((k) => byKind[k].length)
    .map((kind) => ({ kind, rows: byKind[kind].slice(0, LIST_CAP), more: byKind[kind].slice(LIST_CAP) }));
}
