// Новая логика против эталона, снятого со старой страницы (scripts/golden-old.mjs).
// Намеренно поменял поведение — перегенерируй эталон: `task golden:update`, и просмотри diff test/golden.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CFG } from '../src/config';
import { createIndex } from '../src/data';
import type { Dataset, GearKind } from '../src/data/types';
import { epicMains } from '../src/logic/builds';
import { makeCtx, type Settings } from '../src/logic/context';
import { evaluate } from '../src/logic/evaluate';
import { charMatches, itemOptions, mainDemand, setOptions } from '../src/logic/lists';
import { compactVerdict, internFeet, stringifyGolden } from './golden-format.mjs';

const GOLDEN = new URL('./golden.json', import.meta.url);
const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
interface Entry { in: any; out: any }
const golden: { meta: any; cases: Entry[]; lists: Entry[] } = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const idx = createIndex(D);
const rosters: Record<string, string[]> = golden.meta.rosters;
const UPDATE = process.env.GOLDEN_UPDATE === '1';

function ctxFor(inp: { rosterOnly: boolean; roster: string; fodder?: boolean; stage?: 'grow' | 'end'; lv120?: boolean; quirks?: boolean }) {
  const settings: Settings = { rosterOnly: inp.rosterOnly, fodder: !!inp.fodder, stage: inp.stage ?? 'grow', lv120: !!inp.lv120, quirks: inp.quirks ?? true };
  return makeCtx(idx, settings, new Set(rosters[inp.roster]));
}

function runCase(inp: any) {
  const res = evaluate(ctxFor(inp), { slot: inp.slot, grade: inp.grade, setId: inp.setId, itemKey: inp.itemKey, main: inp.main, subs: Object.fromEntries(inp.subs) });
  return compactVerdict(res, { text: (s: string) => s, keepCount: CFG.keepCount });
}

function runList(inp: any) {
  const ctx = ctxFor(inp);
  switch (inp.kind) {
    case 'sets': { const { live, dead } = setOptions(ctx); return { live: live.map(({ set, n }) => [set.id, n]), dead: dead.map((s) => s.id) }; }
    case 'items': return itemOptions(ctx, inp.slot as GearKind, inp.q || '', inp.cls || '').map(({ i, n }) => [i.key, n]);
    case 'mains': return epicMains(idx, inp.slot).map((m) => [m, mainDemand(ctx, inp.slot, m)]);
    default: return D.chars.filter((c) => charMatches(c, { cq: inp.cq || '', cel: inp.cel || '', ccl: inp.ccl || '', cOwned: !!inp.cOwned, cAll: !!inp.cAll }, ctx.roster)).map((c) => c.id);
  }
}

if (UPDATE) {
  const cases = golden.cases.map((c) => ({ in: c.in, out: runCase(c.in) }));
  const feet = internFeet(cases);
  const lists = golden.lists.map((l) => ({ in: l.in, out: runList(l.in) }));
  writeFileSync(GOLDEN, stringifyGolden({ meta: { ...golden.meta, source: 'новая логика (src/logic)', feet }, cases, lists }));
}

describe('golden: оценка предмета', () => {
  it.each(golden.cases.map((c, i) => ({ i, c })))('случай $i', ({ c }) => {
    const out = runCase(c.in);
    out.foot = golden.meta.feet.indexOf(out.foot);
    expect(out).toEqual(c.out);
  });
});

describe('golden: списки ввода', () => {
  it.each(golden.lists.map((l, i) => ({ i, l })))('список $i', ({ l }) => {
    expect(runList(l.in)).toEqual(l.out);
  });
});
