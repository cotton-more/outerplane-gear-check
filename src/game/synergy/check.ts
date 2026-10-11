// Team check (.x/0170-team-synergy): skill conditions in a team that depend on a status nobody gives.
// Pure — the Team screen draws the report. Data: Dataset.synergy (update.py build_synergy).
import type { SkillSlot, SynGive, SynNeed, Synergy } from '@/game/data/types';

export interface TeamMember { id: string; star: number }

// ok — an ally gives it, or the hero herself in time; self — only the hero, and later than the skill that needs it;
// none — nobody in the team
export type NeedVerdict = 'ok' | 'self' | 'none';

// a hero who would give the status; star — from which ★ (1 = at any)
export interface Fix { id: string; star: number }

export interface NeedReport {
  st: string;
  on: SynNeed['on'];
  slots: SkillSlot[];
  verdict: NeedVerdict;
  by: string[];          // allies in the team who give it
  own: SynGive | null;   // the hero's own earliest source (for "self": which skill and from which turn)
  fix: Fix[];            // only when not ok: team heroes whose ★ is too low, then roster heroes who would give it
}

export interface HeroReport { id: string; needs: NeedReport[] }

const ACTIVE: readonly SkillSlot[] = ['s1', 's2', 's3'];
const ORDER: readonly SkillSlot[] = ['s1', 's2', 's3', 'burst', 'passive'];

// does a give reach the status holder: the hero herself (mine) or another hero (theirs)
const reaches = (g: SynGive, on: SynNeed['on'], mine: boolean): boolean =>
  on === 'enemy' ? g.to === 'enemy' : mine ? g.to === 'self' || g.to === 'team' : g.to === 'team' || g.to === 'ally';

// a source that works from the start of battle without AP: a skill or a passive; a burst needs AP first
const steady = (g: SynGive) => g.slot !== 'burst';
const earliest = (gs: SynGive[]): SynGive | null =>
  [...gs].sort((a, b) => Number(!steady(a)) - Number(!steady(b)) || a.cd - b.cd || ORDER.indexOf(a.slot) - ORDER.indexOf(b.slot))[0] ?? null;

// the hero's active needs (★ high enough), one per status and side: Iris S3 ★1 + burst ★5 are one line at ★5
function activeNeeds(needs: SynNeed[], star: number): SynNeed[] {
  const by = new Map<string, SynNeed>();
  for (const n of needs) {
    if (n.star > star) continue;
    const key = `${n.on}:${n.st}`;
    const was = by.get(key);
    const timed = n.slots.some((s) => ACTIVE.includes(s));
    if (!was) { by.set(key, { ...n, slots: [...n.slots], cd: timed ? n.cd : Infinity }); continue; }
    for (const s of n.slots) if (!was.slots.includes(s)) was.slots.push(s);
    was.slots.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    if (timed) was.cd = Math.min(was.cd, n.cd);
  }
  return [...by.values()].map((n) => ({ ...n, cd: Number.isFinite(n.cd) ? n.cd : 0 }));
}

/** Report for every team hero: her needs with a verdict. `rank` orders the suggestions (lower first). */
export function checkTeam(syn: Synergy, team: TeamMember[], roster: Iterable<string>,
  rank: (id: string) => number = () => 0): HeroReport[] {
  const gives = (id: string) => syn.heroes[id]?.give ?? [];
  const starOf = new Map(team.map((m) => [m.id, m.star]));
  const pool = [...new Set([...roster, ...team.map((m) => m.id)])];
  return team.map(({ id, star }) => ({
    id,
    needs: activeNeeds(syn.heroes[id]?.need ?? [], star).map((n): NeedReport => {
      const live = (g: SynGive, giver: string) => g.st === n.st && g.star <= (starOf.get(giver) ?? 0);
      const by = team.filter((m) => m.id !== id && gives(m.id).some((g) => live(g, m.id) && reaches(g, n.on, false))).map((m) => m.id);
      const mine = gives(id).filter((g) => live(g, id) && reaches(g, n.on, true));
      const own = earliest(mine);
      const inTime = mine.some((g) => steady(g) && g.cd <= n.cd);
      const verdict: NeedVerdict = by.length || inTime ? 'ok' : own ? 'self' : 'none';
      const fix: Fix[] = [];
      if (verdict !== 'ok') {
        const cd = new Map<string, number>();
        for (const c of pool) {
          if (c === id || by.includes(c)) continue;
          const gs = gives(c).filter((g) => g.st === n.st && reaches(g, n.on, false));
          if (!gs.length) continue;
          const need = Math.min(...gs.map((g) => g.star));
          if (starOf.has(c) && starOf.get(c)! >= need) continue;
          fix.push({ id: c, star: need });
          cd.set(c, Math.min(...gs.map((g) => (steady(g) ? g.cd : 99))));
        }
        // a team hero whose ★ is too low first (already in the team: only transcend her), then any-★ heroes
        const mate = (f: Fix) => Number(!starOf.has(f.id));
        fix.sort((a, b) => mate(a) - mate(b) || a.star - b.star || cd.get(a.id)! - cd.get(b.id)! || rank(a.id) - rank(b.id)
          || a.id.localeCompare(b.id));
      }
      return { st: n.st, on: n.on, slots: n.slots, verdict, by, own, fix };
    }),
  }));
}
