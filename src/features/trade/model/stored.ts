// The walk on the device (MODEL.md §7 item 9; .x/0200-boss E2b O1, owner 2026-10-13): 'ogc.trade' keeps one walk — its
// target (one hero or a team) and the player's decisions and ticks — until «Сделал» or «Отмена»; ✕ keeps it, and the
// same hero's or team's trade picks it up. Another target — the old walk is replaced. Not in the backup. What doesn't
// read (another shape, a stranger slot) is dropped; given the data's index, so is an entered piece with a stat, set or item
// the data doesn't have («Сделал» writes it into 'ogc.gear').
import { GRADES, SLOTS, isArmor, type Index } from '@/game/data';
import type { GearKind, Grade, SlotId } from '@/game/data/types';
import type { ItemInput } from '@/game/item/item';
import { MAX_LIT, MAX_SUBS } from '@/game/item/subs';
import { NO_DECISIONS, type Decisions } from './walk';

export const TRADE_KEY = 'trade';
export interface StoredWalk { v: 1; target: string; d: Decisions }
// the walk's target: a hero or a team (members in their order)
export const targetOf = (ids: readonly string[], team: boolean): string => `${team ? 'team' : 'hero'}:${ids.join(',')}`;

const strings = (x: unknown): string[] => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string'))] : []);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);
// the data has the piece's stats, and its set (armor) or item (weapon, accessory) when one is named
const known = (idx: Index, i: ItemInput): boolean => Object.keys(i.subs).every((k) => idx.SUB[k])
  && (isArmor(i.slot) ? !i.setId || !!idx.SET[i.setId] : !i.itemKey || !!idx.ITEM[i.slot as GearKind][i.itemKey]);
function input(x: unknown, idx?: Index): ItemInput | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!SLOTS.some((s) => s.id === r.slot) || !GRADES.includes(r.grade as Grade)) return null;
  const subs = Object.entries(r.subs && typeof r.subs === 'object' ? r.subs as Record<string, unknown> : {})
    .filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 1 && (e[1] as number) <= MAX_LIT).slice(0, MAX_SUBS);
  const i: ItemInput = {
    slot: r.slot as SlotId, grade: r.grade as Grade, setId: str(r.setId), itemKey: str(r.itemKey), main: str(r.main),
    ...(r.unlisted === true ? { unlisted: true } : {}), subs: Object.fromEntries(subs), bt: r.bt === 4 ? 4 : 0,
  };
  return idx && !known(idx, i) ? null : i;
}
// what 'ogc.trade' holds → the decisions of this target's walk; another target or nothing — none
export function readWalk(raw: unknown, target: string, idx?: Index): Decisions {
  if (!raw || typeof raw !== 'object') return NO_DECISIONS;
  const w = raw as Partial<StoredWalk>;
  if (w.v !== 1 || w.target !== target || !w.d || typeof w.d !== 'object') return NO_DECISIONS;
  const d = w.d as unknown as Record<string, unknown>;
  const entered = Object.fromEntries(Object.entries(d.entered && typeof d.entered === 'object' ? d.entered as Record<string, unknown> : {})
    .flatMap(([k, x]) => { const i = input(x, idx); return i ? [[k, i]] : []; }));
  return { frozen: strings(d.frozen), kept: strings(d.kept), left: strings(d.left), entered, ticks: strings(d.ticks) };
}
// nothing decided — nothing to keep (the key is cleared)
export const emptyWalk = (d: Decisions): boolean =>
  !d.frozen.length && !d.kept.length && !d.left.length && !d.ticks.length && !Object.keys(d.entered).length;
