// Who to add (game/synergy/suggest.ts): outerpedia's recommended teams first, skill statuses as an extra reason
// (.x/0171-team-suggest). Fixtures: test/fixtures/teams.json and synergy.json from the same outerpedia commit.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GuideTeams, Synergy } from '@/game/data/types';
import { suggest } from '@/game/synergy/suggest';

const read = (f: string) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), 'utf8'));
const syn: Synergy & { commit: string } = read('synergy.json');
const guide: GuideTeams & { commit: string } = read('teams.json');
const H = {
  veronica: '2000037', eva: '2000084', laplace: '2000044', regina: '2000085', tamara: '2000060', caren: '2000089',
  liselotte: '2000098', kanon: '2000071', fatal: '2000078', aer: '2000055', luna: '2000103', kappa: '2000077',
};
const ALL = [...new Set(guide.list.flatMap((t) => t.s.flat()).concat(Object.keys(syn.heroes)))];
const team = (...ids: string[]) => ids.map((id) => ({ id, star: 6 }));

describe('the extract', () => {
  it('both fixtures come from one outerpedia commit; 85 distinct teams of 2–4 slots, every guide titled', () => {
    expect(guide.commit).toBe(syn.commit);
    expect(guide.list).toHaveLength(85);
    for (const t of guide.list) {
      expect(t.s.length).toBeGreaterThanOrEqual(2);
      expect(t.s.length).toBeLessThanOrEqual(4);
      for (const g of t.g) expect(guide.guides[g]).toMatch(/\S/);
    }
  });
});

describe('suggest', () => {
  it('empty team: who is most often in outerpedia teams (Monad Eva first)', () => {
    const s = suggest(syn, guide, [], ALL);
    expect(s[0]).toMatchObject({ id: H.eva, teams: 49, with: [], fixes: [] });
    const teams = s.map((x) => x.teams);
    expect(teams).toEqual([...teams].sort((a, b) => b - a));
  });

  it('Veronica: her outerpedia partners first — Laplace, Tamara, Regina ×8 (ties by id here), then Caren ×7', () => {
    const s = suggest(syn, guide, team(H.veronica), ALL);
    expect(s.slice(0, 4).map((x) => [x.id, x.with])).toEqual([
      [H.laplace, [{ id: H.veronica, n: 8 }]], [H.tamara, [{ id: H.veronica, n: 8 }]], [H.regina, [{ id: H.veronica, n: 8 }]],
      [H.caren, [{ id: H.veronica, n: 7 }]],
    ]);
  });

  it('a skill status adds a reason and weight: Kanon + Fatal + Aer — Liselotte gives Kanon a Barrier (S1: Priority)', () => {
    const s = suggest(syn, guide, team(H.kanon, H.fatal, H.aer), ALL);
    const lise = s.find((x) => x.id === H.liselotte)!;
    expect(lise.fixes).toEqual([{ hero: H.kanon, st: '29', slot: 's1', fx: ['prio'], was: 'none' }]);
    expect(s.indexOf(lise)).toBeLessThan(3);
  });

  it('only from herself → «from the start of battle» counts less: Veronica + Kappa is a fix of a «self» need', () => {
    const k = suggest(syn, guide, team(H.veronica), ALL).find((x) => x.id === H.kappa)!;
    expect(k.fixes).toEqual([{ hero: H.veronica, st: '6', slot: 's1', fx: ['dual'], was: 'self' }]);
  });

  it('team heroes are never suggested; the same slot is an alternative, not a partner', () => {
    const s = suggest(syn, guide, team(H.veronica, H.luna), ALL);
    expect(s.map((x) => x.id)).not.toContain(H.veronica);
    // Luna and Veronica share a slot in a Meteos team: that team does not count them together
    const shared = guide.list.filter((t) => t.s.some((sl) => sl.includes(H.luna) && sl.includes(H.veronica)));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('without outerpedia teams — only the statuses; without either — nothing', () => {
    const s = suggest(syn, undefined, team(H.veronica), ALL);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => x.with.length === 0 && x.fixes.length > 0)).toBe(true);
    expect(suggest(undefined, undefined, team(H.veronica), ALL)).toEqual([]);
  });
});
