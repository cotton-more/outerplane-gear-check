// A boss on «Команда» (.x/0200-boss stage C): the list of fights, a stage's facts (RES with the Challenge quirk, SPD,
// immunities) and the guide teams for the stage. Pure: no React, no storage.
// Owner 2026-10-12: only special request, singularity, joint challenge and guild raid are listed (D1 — world boss and
// irregular extermination stay in the data, hidden here); RES always with the full Challenge tree, like outerpedia (D2).
import type { Boss, Bosses, BossMode, BossTeam } from '@/game/data/types';

// the groups of the list in order; 'live' — fights running now (their season's start ≤ now < battle end)
export const SHOWN: readonly BossMode[] = ['sr', 'ds', 'jc', 'gr'];
export type BossGroup = { key: 'live' | BossMode; bosses: Boss[] };

const isLive = (b: Boss, now: number) => !!b.live && Date.parse(b.live[0]) <= now && now < Date.parse(b.live[1]);
// guild raid: the newest season first, the main boss before its subs (key suffix :main, :subA, :subB)
const seasonStart = (b: Boss) => (b.live ? Date.parse(b.live[0]) : 0);
const raidOrder = (a: Boss, b: Boss) => seasonStart(b) - seasonStart(a) || (a.group ?? '').localeCompare(b.group ?? '')
  || a.key.localeCompare(b.key);

// the list: running now → special request → singularity → joint challenge → guild raid; a running fight is listed
// only under «Идёт сейчас». Inside a group — the data's order (outerpedia's guide list); joint challenge and guild raid —
// the newest season first
export function bossGroups(B: Bosses, now: number): BossGroup[] {
  const shown = B.b.filter((b) => SHOWN.includes(b.mode));
  const live = shown.filter((b) => isLive(b, now));
  const groups: BossGroup[] = live.length ? [{ key: 'live', bosses: live }] : [];
  for (const mode of SHOWN) {
    const list = shown.filter((b) => b.mode === mode && !live.includes(b));
    if (mode === 'gr') list.sort(raidOrder);
    else if (mode === 'jc') list.sort((a, b) => seasonStart(b) - seasonStart(a));
    if (list.length) groups.push({ key: mode, bosses: list });
  }
  return groups;
}

export const bossOf = (B: Bosses | undefined, key: string | null): Boss | null =>
  (key && B?.b.find((b) => b.key === key && SHOWN.includes(b.mode))) || null;

export const stagesOf = (B: Bosses, b: Boss) => B.t[b.table] ?? [];
export const topStage = (B: Bosses, b: Boss) => Math.max(0, stagesOf(B, b).length - 1);
// a stored stage index → one the boss has (the table may have shrunk with new data): out of range — the top one
export const fitStage = (B: Bosses, b: Boss, i: number | undefined) =>
  i !== undefined && Number.isInteger(i) && i >= 0 && i < stagesOf(B, b).length ? i : topStage(B, b);

// RES with the account's Challenge quirk: the game multiplies the raw stat by (1000 + q)/1000 and floors
// (RESEARCH §1.3; q = −200 at the full tree): Meteos stage 13 — 360 → 288
export const resAt = (raw: number, q: number) => Math.floor((raw * (1000 + q)) / 1000);

// immunities at a stage: the last run whose first row ≤ the stage's row
export function immunitiesAt(b: Boss, i: number): string[] {
  let ids: string[] = [];
  for (const [from, list] of b.imm) if (from <= i) ids = list;
  return ids;
}

// hard crowd control — nearly every boss blocks all of it: one chip «Контроль» (owner 2026-10-12)
// taunt, freeze, stun, petrify, silence, golden curse
export const CC: readonly string[] = ['32', '33', '34', '35', '37', '104'];
// the chips: «Контроль» when the boss blocks every CC id, then the other ids in the data's order
export function immunityChips(ids: readonly string[]): { cc: boolean; rest: string[] } {
  const cc = CC.every((id) => ids.includes(id));
  return { cc, rest: cc ? ids.filter((id) => !CC.includes(id)) : [...ids] };
}

export interface StageFacts { label: string; res: number; spd: number; imm: string[] }
export function factsAt(B: Bosses, b: Boss, i: number): StageFacts | null {
  const row = stagesOf(B, b)[i];
  return row ? { label: row[3], res: resAt(row[1], B.q), spd: row[2], imm: immunitiesAt(b, i) } : null;
}

// the chips of the stage picker. Singularity's 30 ranks E…SSS++ — two rows: the letter and the pluses; the others — one row
export type RankParts = { letter: string; plus: string };
export const rankParts = (label: string): RankParts => {
  const m = /^([A-Z]+)(\+*)$/.exec(label);
  return m ? { letter: m[1], plus: m[2] } : { letter: label, plus: '' };
};
export const uniq = <T,>(xs: readonly T[]) => xs.filter((x, i) => xs.indexOf(x) === i);

// the guide teams for a stage: no `st` — every stage; st [a, b] — stages a…b (stage number = row index + 1)
export const teamsAt = (b: Boss, i: number): BossTeam[] =>
  (b.teams ?? []).filter((t) => !t.st || (i + 1 >= t.st[0] && i + 1 <= t.st[1]));

// «Собрать из гайда»: on each of the guide's spots the first owned hero among its alternatives (guide order), one not
// already put on an earlier spot; spots past the guide's (a core of 2) stay empty. have — spots filled, of — the guide's
// spots; missing — the first alternative of each spot left empty (to name it)
export interface Fill { team: (string | null)[]; have: number; of: number; missing: string[] }
export function fillFrom(t: BossTeam, owned: Pick<ReadonlySet<string>, 'has'>): Fill {
  const team: (string | null)[] = [null, null, null, null];
  const missing: string[] = [];
  t.s.slice(0, 4).forEach((alts, j) => {
    const id = alts.find((h) => owned.has(h) && !team.includes(h)) ?? null;
    team[j] = id;
    if (!id && alts.length) missing.push(alts[0]);
  });
  return { team, have: team.filter(Boolean).length, of: Math.min(4, t.s.length), missing };
}

// the picker of spot j with a boss: the guide's alternatives for that spot over the stage's teams, guide order, no repeats
export const spotAlternatives = (teams: readonly BossTeam[], j: number): string[] => uniq(teams.flatMap((t) => t.s[j] ?? []));

// outerpedia's guide page (English — the site has no Russian)
export const guideUrl = (b: Boss) => `https://outerpedia.com/guides/${b.guide}`;
