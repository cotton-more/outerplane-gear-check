// The end of a trade (MODEL.md §7 item 7; .x/0200-boss E2b Q2, Q6, owner 2026-10-13): nothing is left without an owner.
// A piece the plan took off a hero (worn at the start, worn by nobody after, still in a pool) goes, after every member's
// step — so a piece a later step takes is not a replacement — to the giver of that slot (the hero at the end of the chain:
// Rin took Caren's helmet → Caren gets Rin's old one; Rin ← Caren ← Stella → Stella) if he can wear it, else to another
// team member whose slot emptied in this trade and who can, else it is parked on the hero it came off. A replacement the
// player kept as it was (`kept`, slotKey of the target) leaves the target's slot empty and parks the piece. Holes: every
// empty slot of a receiver, and every slot this trade emptied that no replacement fills — «Ввести» / «Оставить».
import type { SlotId } from '@/game/data/types';
import { halvesIn } from './holes';
import { SLOT_ORDER, slotKey, wears, type Hero, type World } from './model';

export interface Repl { to: string; slot: SlotId; item: string; from: string; kept: boolean } // kept — declined: parked instead
export interface Parked { item: string; hero: string; slot: SlotId; why: 'class' | 'kept' | 'none'; giver: string | null }
// breaks — a set whose half (MODEL.md §2) switched off with this hole: the search hint names it
export interface Hole { hero: string; slot: SlotId; receiver: boolean; breaks: string | null }
export interface Ends { repl: Repl[]; park: Parked[]; holes: Hole[] }
// no end: the plan's moves alone (tests of the moves, a plan that changes nothing)
export const NO_ENDS: Ends = { repl: [], park: [], holes: [] };
export interface EndsInput {
  receivers: readonly string[];   // the plan's receivers in its order (the one hero, or the team's order)
  team: readonly string[];        // who may take a piece whose giver can't (the one hero alone, or the team)
  kept?: ReadonlySet<string>;     // replacements kept as they were: slotKey(target, slot)
}

const wornMap = (w: World) => {
  const m = new Map<string, [string, SlotId]>();
  for (const h of w.heroes) for (const s of SLOT_ORDER) if (h.worn[s]) m.set(h.worn[s]!, [h.id, s]);
  return m;
};

// w0 — before the plan, w1 — after it (all steps advanced). w2 — w1 with the replacements worn: the gains and the walk read it
export function endsOf(w0: World, w1: World, inp: EndsInput): { ends: Ends; w2: World } {
  const before = new Map(w0.heroes.map((h) => [h.id, h]));
  const after = new Map(w1.heroes.map((h) => [h.id, h]));
  const at0 = wornMap(w0), at1 = wornMap(w1);
  const pooled = new Set(w1.heroes.flatMap((h) => h.pool));
  const rank = (id: string) => { const i = inp.receivers.indexOf(id); return i >= 0 ? i : inp.receivers.length + (before.get(id)?.rank ?? after.get(id)?.rank ?? 0); };
  // displaced: worn at the start, by nobody now, still in the app — in the plan's order of heroes, then slots
  const displaced = [...at0].filter(([id]) => !at1.has(id) && pooled.has(id))
    .map(([item, [hero, slot]]) => ({ item, hero, slot }))
    .sort((a, z) => rank(a.hero) - rank(z.hero) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(z.slot));
  const emptied = new Set<string>();
  for (const h of w0.heroes) for (const s of SLOT_ORDER) if (h.worn[s] && !after.get(h.id)?.worn[s]) emptied.add(slotKey(h.id, s));
  const filled = new Set<string>();
  // the giver of X's slot: who wore X's new piece at the start; his slot filled again by someone else's — follow on
  const giverOf = (hero: string, slot: SlotId): string | null => {
    const seen = new Set<string>();
    for (let x = hero; !seen.has(x); ) {
      seen.add(x);
      const got = after.get(x)?.worn[slot];
      const from = got ? at0.get(got) : undefined;
      if (!from || from[0] === x) return null;
      if (emptied.has(slotKey(from[0], slot))) return from[0];
      x = from[0];
    }
    return null;
  };
  const repl: Repl[] = [], park: Parked[] = [];
  for (const d of displaced) {
    const g = giverOf(d.hero, d.slot);
    const open = (t: string) => emptied.has(slotKey(t, d.slot)) && !filled.has(slotKey(t, d.slot)) && wears(w1, t, d.item);
    const to = g && open(g) ? g : inp.team.find((m) => m !== d.hero && open(m)) ?? null;
    if (!to) { park.push({ item: d.item, hero: d.hero, slot: d.slot, why: g && !wears(w1, g, d.item) ? 'class' : 'none', giver: g }); continue; }
    filled.add(slotKey(to, d.slot));
    const kept = !!inp.kept?.has(slotKey(to, d.slot));
    repl.push({ to, slot: d.slot, item: d.item, from: d.hero, kept });
    if (kept) park.push({ item: d.item, hero: d.hero, slot: d.slot, why: 'kept', giver: to });
  }
  // the world with the replacements worn: the piece leaves the pool it came off and is worn by its new hero
  const done = repl.filter((r) => !r.kept);
  const heroes: Hero[] = w1.heroes.map((h) => {
    const out = done.filter((r) => r.from === h.id).map((r) => r.item);
    const inn = done.filter((r) => r.to === h.id);
    if (!out.length && !inn.length) return h;
    const worn = { ...h.worn };
    for (const r of inn) worn[r.slot] = r.item;
    return { ...h, worn, pool: [...h.pool.filter((id) => !out.includes(id)), ...inn.map((r) => r.item).filter((id) => !h.pool.includes(id))] };
  });
  // a giver who gave his only piece left w1 (no pool): back with the replacement, at his old place in the roster
  for (const id of new Set(done.map((r) => r.to))) {
    if (after.has(id)) continue;
    const was = before.get(id), got = done.filter((r) => r.to === id);
    heroes.push({ id, rank: was?.rank ?? heroes.length, locked: was?.locked ?? false,
      worn: Object.fromEntries(got.map((r) => [r.slot, r.item])), pool: got.map((r) => r.item) });
  }
  heroes.sort((a, z) => a.rank - z.rank);
  const w2: World = { ...w1, heroes };
  const now = new Map(heroes.map((h) => [h.id, h]));
  const breaks = (hero: string, slot: SlotId): string | null => {
    const g = w0.gauge(hero), set = before.get(hero)?.worn[slot] ? w0.items[before.get(hero)!.worn[slot]!]?.set : null;
    if (!g || !set) return null;
    return (halvesIn(g, w0, now.get(hero)?.worn ?? {}).get(set) ?? 0) < (halvesIn(g, w0, before.get(hero)!.worn).get(set) ?? 0) ? set : null;
  };
  const holes: Hole[] = [];
  for (const id of inp.receivers) for (const s of SLOT_ORDER) if (!now.get(id)?.worn[s]) holes.push({ hero: id, slot: s, receiver: true, breaks: breaks(id, s) });
  for (const k of emptied) {
    const [hero, slot] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1) as SlotId];
    if (!inp.receivers.includes(hero) && !now.get(hero)?.worn[slot]) holes.push({ hero, slot, receiver: false, breaks: breaks(hero, slot) });
  }
  holes.sort((a, z) => rank(a.hero) - rank(z.hero) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(z.slot));
  return { ends: { repl, park, holes }, w2 };
}
