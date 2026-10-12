// Who to add to the team (.x/0171-team-suggest; owner 2026-10-11: outerpedia's recommended teams first, skill statuses
// as an extra reason). Pure — the Team screen's hero sheet shows the list above the plain one.
import type { GuideTeams, SkillSlot, Synergy } from '@/game/data/types';
import { checkTeam, type TeamMember } from './check';

// a team hero's skill that starts working with this candidate: none → ok or only-from-herself → ok
export interface Fix { hero: string; st: string; slot: SkillSlot; fx: string[]; was: 'none' | 'self' }

export interface Suggestion {
  id: string;
  with: { id: string; n: number }[]; // team heroes it is recommended together with, in how many outerpedia teams
  teams: number;                     // empty team: in how many outerpedia teams it is at all
  fixes: Fix[];
  score: number;
}

// a fix is worth a few shared teams: «nobody gives» more than «only from herself»
const FIX_NONE = 3, FIX_SELF = 1.5;

const slotOf = (t: GuideTeams['list'][number], id: string) => t.s.findIndex((s) => s.includes(id));

/** Roster heroes (pool, not in the team) that fit the team, best first; empty without outerpedia teams and statuses. */
// starOf — the stored ★ of a candidate (not set — ★6, the strongest the hero can be)
export function suggest(syn: Synergy | undefined, guide: GuideTeams | undefined, team: TeamMember[], pool: readonly string[],
  rank: (id: string) => number = () => 0, starOf?: (id: string) => number | undefined): Suggestion[] {
  const inTeam = new Set(team.map((m) => m.id));
  const list = guide?.list ?? [];
  const base = syn ? checkTeam(syn, team, pool) : [];
  const open = new Map(base.flatMap((h) => h.needs.filter((n) => n.verdict !== 'ok').map((n) => [`${h.id}:${n.on}:${n.st}`, n.verdict as 'none' | 'self'])));
  const out: Suggestion[] = [];
  for (const id of pool) {
    if (inTeam.has(id)) continue;
    // teams where the candidate and a team hero are in different slots (the same slot — an alternative, not a partner)
    const withs = team.map((m) => ({ id: m.id, n: list.filter((t) => { const i = slotOf(t, id), j = slotOf(t, m.id); return i >= 0 && j >= 0 && i !== j; }).length }))
      .filter((w) => w.n > 0);
    const teams = team.length ? 0 : list.filter((t) => slotOf(t, id) >= 0).length;
    const fixes: Fix[] = [];
    if (syn && open.size) {
      for (const h of checkTeam(syn, [...team, { id, star: starOf?.(id) ?? 6 }], pool)) {
        if (h.id === id) continue;
        for (const n of h.needs) {
          const was = open.get(`${h.id}:${n.on}:${n.st}`);
          if (!was || n.verdict !== 'ok' || !n.by.includes(id)) continue;
          const need = syn.heroes[h.id]?.need?.find((x) => x.st === n.st && x.on === n.on);
          const slot = n.slots[0];
          fixes.push({ hero: h.id, st: n.st, slot, fx: need?.fx?.[slot] ?? [], was });
        }
      }
    }
    const score = withs.reduce((s, w) => s + w.n, 0) + teams + fixes.reduce((s, f) => s + (f.was === 'none' ? FIX_NONE : FIX_SELF), 0);
    if (score > 0) out.push({ id, with: withs, teams, fixes, score });
  }
  return out.sort((a, b) => b.score - a.score || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}
