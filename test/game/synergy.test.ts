// Team check (game/synergy/check.ts) on the outerpedia extract test/fixtures/synergy.json (.x/0170-team-synergy).
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Dataset, Synergy } from '@/game/data/types';
import { checkTeam, type HeroReport, type TeamMember } from '@/game/synergy/check';
import { TEXTS } from '@/i18n';

const FIX = new URL('../fixtures/synergy.json', import.meta.url);
const syn: Synergy & { commit: string } = JSON.parse(readFileSync(FIX, 'utf8'));
const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));

const H = {
  veronica: '2000037', veronicaCF: '2700037', yuri: '2000026', saeran: '2000129', tio: '2000036', anarky: '2000116',
  bleu: '2000045', stella: '2000053', fatal: '2000078', bethStealth: '2000092', elizaCF: '2700035', iris: '2000004',
  snowCF: '2700003', kanon: '2000071', lishaCF: '2700005', beth: '2000025', sigma: '2000052', philia: '2000018',
  francesca: '2000015', luna: '2000103', aer: '2000055', epsilonCF: '2700070', lisha: '2000005',
};
const ALL = Object.keys(syn.heroes);
const run = (team: [string, number][], roster: string[] = []) =>
  checkTeam(syn, team.map(([id, star]): TeamMember => ({ id, star })), roster);
const need = (r: HeroReport[], id: string, st: string) => r.find((h) => h.id === id)!.needs.find((n) => n.st === st)!;

describe('the extract', () => {
  it('carries its outerpedia commit and the 13 statuses with English names', () => {
    expect(syn.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(Object.keys(syn.statuses)).toHaveLength(13);
    for (const s of Object.values(syn.statuses)) expect(s.en).toMatch(/^[A-Z]/);
  });
  it('every need and give names a known status; needs only on self or enemy, enemy needs are debuffs', () => {
    for (const h of Object.values(syn.heroes)) {
      for (const g of h.give ?? []) expect(syn.statuses[g.st]).toBeDefined();
      for (const n of h.need ?? []) {
        expect(syn.statuses[n.st]).toBeDefined();
        if (n.on === 'enemy') expect(syn.statuses[n.st].debuff).toBe(true);
      }
    }
  });
  it('Increased Defense: Veronica needs it on S1; 14 heroes give it to allies', () => {
    expect(syn.heroes[H.veronica].need).toEqual([{ st: '6', on: 'self', slots: ['s1'], star: 1, cd: 0, fx: { s1: ['dual'] } }]);
    const allies = ALL.filter((id) => syn.heroes[id].give?.some((g) => g.st === '6' && (g.to === 'team' || g.to === 'ally')));
    expect(allies).toHaveLength(14);
    expect(allies).toEqual(expect.arrayContaining([H.yuri, H.saeran, H.tio, H.anarky, H.veronica, H.veronicaCF]));
  });
  it('no chain gives, no self gives without an own need', () => {
    for (const h of Object.values(syn.heroes)) {
      const mine = new Set((h.need ?? []).map((n) => n.st));
      for (const g of h.give ?? []) {
        expect(['s1', 's2', 's3', 'burst', 'passive']).toContain(g.slot);
        if (g.to === 'self') expect(mine.has(g.st)).toBe(true);
      }
    }
  });
});

describe('status names', () => {
  it('every status in the extract has a name in both languages; English ones are the game names', () => {
    for (const [st, s] of Object.entries(syn.statuses)) {
      expect(TEXTS.ru.team.status[st], st).toBeTruthy();
      expect(TEXTS.en.team.status[st]).toBe(s.en);
    }
  });
});

describe('checkTeam', () => {
  it('Veronica alone: ⚠ only from herself — her S3 is ready on turn 4, S1 needs it at once', () => {
    const n = need(run([[H.veronica, 6]], ALL), H.veronica, '6');
    expect(n.verdict).toBe('self');
    expect(n.own).toMatchObject({ slot: 's3', cd: 4 });
    expect(n.fix.map((f) => f.id)).toEqual(expect.arrayContaining([H.yuri, H.saeran, H.anarky]));
    expect(n.fix.map((f) => f.id)).not.toContain(H.veronica);
  });
  it('+ Yuri → ok, from Yuri; + Saeran (gives to allies only) → ok', () => {
    expect(need(run([[H.veronica, 6], [H.yuri, 1]]), H.veronica, '6')).toMatchObject({ verdict: 'ok', by: [H.yuri], fix: [] });
    expect(need(run([[H.veronica, 6], [H.saeran, 1]]), H.veronica, '6')).toMatchObject({ verdict: 'ok', by: [H.saeran] });
  });
  it('empty roster → no suggestions', () => {
    expect(need(run([[H.veronica, 6]]), H.veronica, '6').fix).toEqual([]);
  });
  it('Stella gives allies a Barrier only from ★6: at ★5 she is a suggestion "from ★6", at ★6 Bleu is covered', () => {
    const low = need(run([[H.bleu, 6], [H.stella, 5]]), H.bleu, '29');
    expect(low.verdict).toBe('self');
    expect(low.fix).toEqual([{ id: H.stella, star: 6 }]);
    expect(need(run([[H.bleu, 6], [H.stella, 6]]), H.bleu, '29')).toMatchObject({ verdict: 'ok', by: [H.stella] });
  });
  it('a need from a ★5 passive is hidden at ★4 (Eliza CF)', () => {
    expect(run([[H.elizaCF, 4]])[0].needs).toEqual([]);
    expect(run([[H.elizaCF, 5]])[0].needs.map((n) => n.st)).toEqual(['3']);
  });
  it('a status needed by several skills at different ★ is one line (Iris: S3 + burst from ★5)', () => {
    expect(run([[H.iris, 4]])[0].needs.map((n) => n.slots)).toEqual([['s3']]);
    expect(run([[H.iris, 5]])[0].needs.map((n) => n.slots)).toEqual([['s3', 'burst']]);
  });
  it('own source in time → quietly ok: same skill (Snow CF), earlier skill (Lisha CF S2 → S3), S1 (Francesca, Aer)', () => {
    expect(need(run([[H.snowCF, 6]]), H.snowCF, '33')).toMatchObject({ verdict: 'ok', by: [] });
    expect(need(run([[H.lishaCF, 6]]), H.lishaCF, '8')).toMatchObject({ verdict: 'ok', by: [] });
    expect(need(run([[H.francesca, 6]]), H.francesca, '3').verdict).toBe('ok');
    expect(need(run([[H.aer, 6]]), H.aer, '11').verdict).toBe('ok');
  });
  it('own source later than the skill → self (Beth: Bleeding from S2 on turn 3, S1 needs it at once)', () => {
    const n = need(run([[H.beth, 6]]), H.beth, '3');
    expect(n).toMatchObject({ verdict: 'self', own: { slot: 's2', cd: 3 } });
  });
  it('a burst is not a steady source (Bleu: S3 on turn 6 or a burst) → self, own = S3', () => {
    expect(need(run([[H.bleu, 6]]), H.bleu, '29')).toMatchObject({ verdict: 'self', own: { slot: 's3', cd: 6 } });
  });
  it('nobody gives it → none (Kanon: her Barrier comes only when hit)', () => {
    const n = need(run([[H.kanon, 6]], ALL), H.kanon, '29');
    expect(n.verdict).toBe('none');
    expect(n.own).toBeNull();
    expect(n.fix.length).toBeGreaterThan(10);
  });
  it('enemy debuff: an ally applying it counts (Philia + Sigma: Shocked)', () => {
    expect(need(run([[H.philia, 6], [H.sigma, 6]]), H.sigma, '5')).toMatchObject({ verdict: 'ok', by: [H.philia] });
  });
  it('suggestions: any-★ heroes first, then the earliest steady source', () => {
    const fix = need(run([[H.veronica, 6]], ALL), H.veronica, '6').fix;
    const stars = fix.map((f) => f.star);
    expect(stars).toEqual([...stars].sort((a, b) => a - b));
  });
  it('a team hero whose ★ is too low comes first (Kanon + Stella ★5: Stella from ★6)', () => {
    expect(need(run([[H.kanon, 6], [H.stella, 5]], ALL), H.kanon, '29').fix[0]).toEqual({ id: H.stella, star: 6 });
  });
});

// Golden-style record: a dozen teams → compact text. UPDATE_SYNERGY_GOLDEN=1 npm test rewrites it.
const GOLDEN = new URL('./synergy.golden.json', import.meta.url);
const UPDATE = process.env.UPDATE_SYNERGY_GOLDEN === '1';
const nameOf = (id: string) => D.chars.find((c) => c.id === id)?.name ?? id;
const TEAMS: [string, number][][] = [
  [[H.veronica, 6]],
  [[H.veronica, 6], [H.yuri, 3], [H.tio, 3], [H.lisha, 6]],
  [[H.veronicaCF, 6], [H.anarky, 1]],
  [[H.bleu, 6], [H.stella, 5], [H.veronica, 6]],
  [[H.fatal, 6], [H.bethStealth, 6]],
  [[H.fatal, 6], [H.kanon, 6], [H.luna, 6], [H.aer, 6]],
  [[H.beth, 6], [H.francesca, 6]],
  [[H.philia, 6], [H.sigma, 6], [H.iris, 5]],
  [[H.elizaCF, 6], [H.snowCF, 6], [H.lishaCF, 6], [H.epsilonCF, 6]],
  [[H.lisha, 3]],
  [[H.iris, 4], [H.elizaCF, 4]],
  [[H.kanon, 6], [H.bleu, 6], [H.tio, 6], [H.stella, 6]],
];
const line = (r: HeroReport[]) => r.flatMap((h) => h.needs.map((n) => {
  const who = n.verdict === 'ok' ? (n.by.map(nameOf).join(', ') || 'self')
    : n.verdict === 'self' ? `own ${n.own!.slot} t${n.own!.cd}` : '—';
  const fix = n.fix.slice(0, 6).map((f) => nameOf(f.id) + (f.star > 1 ? `★${f.star}` : '')).join(', ')
    + (n.fix.length > 6 ? ` +${n.fix.length - 6}` : '');
  return `${nameOf(h.id)}: ${syn.statuses[n.st].en} on ${n.on} ${n.slots.join('/')} → ${n.verdict} (${who})${fix ? ' | ' + fix : ''}`;
}));

describe('golden teams', () => {
  it('match test/game/synergy.golden.json', () => {
    const now = TEAMS.map((t) => ({
      team: t.map(([id, star]) => `${nameOf(id)}★${star}`).join(' + '),
      report: line(run(t, ALL)),
    }));
    if (UPDATE) writeFileSync(GOLDEN, JSON.stringify({ commit: syn.commit, teams: now }, null, 1) + '\n');
    expect(now).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')).teams);
  });
});
