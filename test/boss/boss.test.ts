// A boss on «Команда» (features/boss, .x/0200-boss stage C): the list order, RES with the Challenge quirk, stages,
// immunities, guide teams by stage, «Собрать из гайда» with a partial roster, the stored 'ogc.boss'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Boss, Dataset } from '@/game/data/types';
import {
  bossGroups, bossOf, factsAt, fillFrom, fitStage, immunitiesAt, immunityChips, rankParts, resAt, spotAlternatives, teamsAt, topStage,
} from '@/features/boss/model/boss';
import { EMPTY, restoreBoss, type BossStore } from '@/features/boss/model/stored';
import { stageText } from '@/features/boss/ui/stageText';
import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const B = D.bosses!;
const boss = (key: string) => B.b.find((b) => b.key === key)!;
const id = (name: string) => D.chars.find((c) => c.name === name)!.id;
const ids = (...names: string[]) => new Set(names.map(id));
const NOTHING_LIVE = Date.parse('2027-01-01T00:00:00Z');

describe('the boss list', () => {
  it('special request → singularity → joint challenge → guild raid; world boss and irregular extermination hidden (D1)', () => {
    const g = bossGroups(B, NOTHING_LIVE);
    expect(g.map((x) => x.key)).toEqual(['sr', 'ds', 'jc', 'gr']);
    expect(g.map((x) => x.bosses.length)).toEqual([10, 15, 5, 15]);
    expect(g.flatMap((x) => x.bosses).some((b) => b.mode === 'wb' || b.mode === 'ie')).toBe(false);
    expect(bossOf(B, 'wb:harshna')).toBeNull();
    expect(bossOf(B, 'sr:meteos')?.key).toBe('sr:meteos');
  });

  it('guild raid and joint challenge: the newest season first, a raid\'s main boss before its subs', () => {
    const g = bossGroups(B, NOTHING_LIVE);
    const gr = g.find((x) => x.key === 'gr')!.bosses.map((b) => b.key);
    expect(gr.slice(0, 3)).toEqual(['gr:frost-legion:main', 'gr:frost-legion:subA', 'gr:frost-legion:subB']);
    expect(g.find((x) => x.key === 'jc')!.bosses[0].key).toBe('jc:koh-meteos');
  });

  it('a fight running now goes first, under «Идёт сейчас» only', () => {
    const fl = boss('gr:frost-legion:main');
    const now = Date.parse(fl.live![0]) + 1000;
    const g = bossGroups(B, now);
    expect(g[0].key).toBe('live');
    expect(g[0].bosses.map((b) => b.key)).toEqual(['gr:frost-legion:main', 'gr:frost-legion:subA', 'gr:frost-legion:subB']);
    expect(g.find((x) => x.key === 'gr')!.bosses.some((b) => b.key.startsWith('gr:frost-legion'))).toBe(false);
    // the battle end is not running any more
    expect(bossGroups(B, Date.parse(fl.live![1]))[0].key).toBe('sr');
  });
});

describe('a stage', () => {
  it('RES with the Challenge quirk: floor(RES × (1000 + q) / 1000)', () => {
    expect(B.q).toBe(-200);
    expect(resAt(360, -200)).toBe(288); // Meteos stage 13
    expect(resAt(335, -200)).toBe(268); // guild raid main stage 10
    expect(resAt(287, -200)).toBe(229); // 229.6 → 229
    expect(resAt(29, -200)).toBe(23);   // 23.2 → 23
    expect(resAt(360, 0)).toBe(360);
  });

  it('facts: Meteos stage 13 — RES 288, SPD 109; joint challenge «very_hard»; singularity «SSS++»', () => {
    const m = boss('sr:meteos');
    expect(factsAt(B, m, topStage(B, m))).toMatchObject({ label: '13', res: 288, spd: 109 });
    expect(factsAt(B, m, 10)).toMatchObject({ label: '11', res: 256 });
    expect(factsAt(B, boss('jc:annihilator'), 2)).toMatchObject({ label: 'very_hard', res: 54 });
    expect(factsAt(B, boss('ds:urd-dark'), topStage(B, boss('ds:urd-dark')))).toMatchObject({ label: 'SSS++', res: 287 });
    expect(factsAt(B, m, 13)).toBeNull();
  });

  it('a stored stage that the boss has stays; none or out of range — the top stage', () => {
    const m = boss('sr:meteos');
    expect(fitStage(B, m, 10)).toBe(10);
    expect(fitStage(B, m, undefined)).toBe(12);
    expect(fitStage(B, m, 13)).toBe(12);
    expect(fitStage(B, m, -1)).toBe(12);
    expect(fitStage(B, m, 1.5)).toBe(12);
  });

  it('stage labels: joint challenge in words, the others as in the game', () => {
    const jc = boss('jc:annihilator');
    expect(stageText(ru, jc, 'very_hard')).toBe('Очень сложный');
    expect(stageText(en, jc, 'hard')).toBe('Hard');
    expect(stageText(ru, boss('sr:meteos'), '13')).toBe('13');
    expect(stageText(en, boss('ds:urd-dark'), 'SSS++')).toBe('SSS++');
    expect(rankParts('SSS++')).toEqual({ letter: 'SSS', plus: '++' });
    expect(rankParts('AA+')).toEqual({ letter: 'AA', plus: '+' });
    expect(rankParts('E')).toEqual({ letter: 'E', plus: '' });
  });

  it('immunities by stage: the last run starting at or below the stage\'s row', () => {
    const b = { imm: [[0, ['33']], [5, ['33', '26']], [9, ['26']]] } as unknown as Boss;
    expect(immunitiesAt(b, 0)).toEqual(['33']);
    expect(immunitiesAt(b, 4)).toEqual(['33']);
    expect(immunitiesAt(b, 5)).toEqual(['33', '26']);
    expect(immunitiesAt(b, 12)).toEqual(['26']);
    // every immunity of the data has a name in both languages
    const all = new Set(B.b.flatMap((x) => x.imm.flatMap(([, list]) => list)));
    expect([...all].filter((i) => !ru.team.status[i] || !(en.team.status as Record<string, string>)[i])).toEqual([]);
  });

  it('«Контроль» stands for the six hard CC ids when the boss blocks all of them', () => {
    expect(immunityChips(factsAt(B, boss('sr:meteos'), 12)!.imm)).toEqual({ cc: true, rest: ['17', '62'] });
    expect(immunityChips(['33', '34', '26'])).toEqual({ cc: false, rest: ['33', '34', '26'] });
  });
});

describe('guide teams', () => {
  it('by stage: Chimera\'s team for stages 1–10 and the one for 11–13; no `st` — every stage', () => {
    const c = boss('sr:chimera');
    expect(teamsAt(c, 9)).toEqual([c.teams![0]]);
    expect(teamsAt(c, 10)).toEqual([c.teams![1]]);
    expect(teamsAt(boss('sr:meteos'), 0)).toHaveLength(1);
    expect(teamsAt(boss('ds:urd-dark'), 0)).toEqual([]);
  });

  it('«Собрать из гайда» with a partial roster: the first owned alternative per spot; empty spots name the guide\'s first', () => {
    const t = boss('jc:annihilator').teams![0];
    const f = fillFrom(t, ids('Monad Eva', 'Dianne', 'Iota'));
    expect(f.team).toEqual([id('Monad Eva'), null, null, id('Iota')]);
    expect(f).toMatchObject({ have: 2, of: 4, missing: [id('Gnosis Domine'), id('Maxwell')] });
    // Meteos: no Luna → Veronica; nothing owned → have 0
    const m = boss('sr:meteos').teams![0];
    expect(fillFrom(m, ids('Veronica', 'Caren', 'Tamara', 'Rin', 'Roxie')))
      .toMatchObject({ team: [id('Veronica'), id('Tamara'), id('Rin'), id('Roxie')], have: 4, of: 4, missing: [] });
    expect(fillFrom(m, new Set())).toMatchObject({ have: 0, team: [null, null, null, null] });
  });

  it('a hero listed on two spots is put once (the earlier spot); a core of 2 fills 2 spots', () => {
    const k = boss('jc:koh-meteos').teams![0]; // a hero on spot 1 and spot 3
    const twice = k.s[0].find((h) => k.s[2].includes(h))!;
    const f = fillFrom(k, new Set([twice]));
    expect(f.team.filter((x) => x === twice)).toHaveLength(1);
    expect(f.team[0]).toBe(twice);
    const core = boss('gr:frost-legion:main').teams!.find((t) => t.s.length === 2)!;
    const g = fillFrom(core, new Set(core.s.flat()));
    expect(g).toMatchObject({ have: 2, of: 2 });
    expect(g.team.slice(2)).toEqual([null, null]);
  });

  it('the picker\'s guide heroes for a spot: over the stage\'s teams, guide order, no repeats', () => {
    const fl = boss('gr:frost-legion:main').teams!;
    expect(spotAlternatives(fl, 0)).toEqual(['Omega Nadja', 'Monad Eva', 'Ember', 'Demiurge Saeran'].map(id));
    expect(spotAlternatives(fl, 3)).toEqual(['Sterope', 'Ember', 'Bell Cranel', 'Demiurge Drakhan', 'Vlada', 'Monad Iota'].map(id));
  });
});

describe("'ogc.boss'", () => {
  it('round trip; unreadable values dropped', () => {
    const s: BossStore = { v: 1, boss: 'sr:meteos', stage: { 'sr:meteos': 10 }, teams: { 'sr:meteos': ['a', null, 'b', null], '': [null, null, null, 'c'] } };
    expect(restoreBoss(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(restoreBoss(null)).toEqual(EMPTY);
    expect(restoreBoss({ v: 2, boss: 'x' })).toEqual(EMPTY);
    expect(restoreBoss({ v: 1, boss: 7, stage: { a: 'x', b: 2 }, teams: { a: ['x', 5], b: 'y' } }))
      .toEqual({ v: 1, boss: null, stage: { b: 2 }, teams: { a: ['x', null, null, null] } });
  });
});
