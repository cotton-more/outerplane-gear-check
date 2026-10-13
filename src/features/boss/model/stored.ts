// What «Команда» remembers on this device — 'ogc.boss' (owner D5, 2026-10-12): the last boss, the stage per boss and
// a team per boss, plus the team without a boss (key ''). Not in the backup (like the page settings). Hero ids only:
// the ★ tried in a spot are never saved (they come from the hero's card). orders (.x/0200-boss E2, owner 2026-10-13) —
// each member's build for the team trade, kept with the team: boss key → hero → the combo's signature (comboSig; none —
// «По статам»). Worn gear is never kept here: «Команда» always reads what the app records as worn.
export interface BossStore {
  v: 1;
  boss: string | null;               // the boss picked last (Boss.key); null — no boss
  stage: Record<string, number>;     // boss key → stage (row index of its table)
  teams: Record<string, (string | null)[]>; // boss key or '' → four spots
  orders?: Record<string, Record<string, string>>; // boss key or '' → hero → build (comboSig); none — «По статам»
}
export const NO_BOSS = '';
export const EMPTY: BossStore = { v: 1, boss: null, stage: {}, teams: {} };

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

// a stored value → the store; anything unreadable is dropped (keys and ids that left the data are checked where used)
export function restoreBoss(raw: unknown): BossStore {
  if (!isObj(raw) || raw.v !== 1) return EMPTY;
  const stage: Record<string, number> = {};
  if (isObj(raw.stage)) for (const [k, v] of Object.entries(raw.stage)) if (Number.isInteger(v)) stage[k] = v as number;
  const teams: Record<string, (string | null)[]> = {};
  if (isObj(raw.teams)) for (const [k, v] of Object.entries(raw.teams)) { const s = spots(v); if (s) teams[k] = s; }
  const orders: Record<string, Record<string, string>> = {};
  if (isObj(raw.orders)) for (const [k, v] of Object.entries(raw.orders)) {
    if (!isObj(v)) continue;
    const o = Object.fromEntries(Object.entries(v).filter(([, sig]) => typeof sig === 'string')) as Record<string, string>;
    if (Object.keys(o).length) orders[k] = o;
  }
  return { v: 1, boss: typeof raw.boss === 'string' ? raw.boss : null, stage, teams, ...(Object.keys(orders).length ? { orders } : {}) };
}
