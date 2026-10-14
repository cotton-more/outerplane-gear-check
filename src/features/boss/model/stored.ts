// What «Команда» remembers on this device — 'ogc.boss' (owner D5, 2026-10-12): the last boss, the stage per boss and the
// team. Not in the backup (like the page settings). Hero ids only: the ★ tried in a spot are never saved (they come from the
// hero's card). orders (HISTORY.md 0200-boss E2, owner 2026-10-13) — each member's build for the team trade: hero → the combo's
// signature (comboSig; none — «По статам»). Worn gear is never kept here: «Команда» always reads what the app records as worn.
// v2 (HISTORY.md 0206 Q3, owner 2026-10-14): one team for every boss — the boss is a lens, picking, changing or removing
// it never changes the heroes. v1 kept a team (and its builds) per boss plus one without a boss (key ''): the team that was
// on screen survives — the last boss's, or the one without a boss when that boss had none.
export interface BossStore {
  v: 2;
  boss: string | null;               // the boss picked last (Boss.key); null — no boss
  stage: Record<string, number>;     // boss key → stage (row index of its table)
  team: (string | null)[];           // four spots
  orders?: Record<string, string>;   // hero → build (comboSig); none — «По статам»
}
const NONE: (string | null)[] = [null, null, null, null];
export const EMPTY: BossStore = { v: 2, boss: null, stage: {}, team: NONE };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
// four spots; a hero is in one spot only (the second occurrence of an id is dropped)
const spots = (x: unknown): (string | null)[] | null => {
  if (!Array.isArray(x)) return null;
  const seen = new Set<string>();
  return [0, 1, 2, 3].map((i) => {
    const id = typeof x[i] === 'string' ? (x[i] as string) : null;
    if (id === null || seen.has(id)) return null;
    seen.add(id);
    return id;
  });
};
// hero → build: strings only
const builds = (x: unknown): Record<string, string> =>
  isObj(x) ? Object.fromEntries(Object.entries(x).filter(([, sig]) => typeof sig === 'string')) as Record<string, string> : {};

// a stored value → the store; anything unreadable is dropped (keys and ids that left the data are checked where used)
export function restoreBoss(raw: unknown): BossStore {
  if (!isObj(raw) || (raw.v !== 1 && raw.v !== 2)) return EMPTY;
  const boss = typeof raw.boss === 'string' ? raw.boss : null;
  const stage: Record<string, number> = {};
  if (isObj(raw.stage)) for (const [k, v] of Object.entries(raw.stage)) if (Number.isInteger(v)) stage[k] = v as number;
  let team: unknown = raw.team, orders: unknown = raw.orders;
  if (raw.v === 1) {
    const teams = isObj(raw.teams) ? raw.teams : {}, all = isObj(raw.orders) ? raw.orders : {};
    const key = boss !== null && spots(teams[boss]) ? boss : '';
    team = teams[key];
    orders = all[key];
  }
  const o = builds(orders);
  return { v: 2, boss, stage, team: spots(team) ?? NONE, ...(Object.keys(o).length ? { orders: o } : {}) };
}
