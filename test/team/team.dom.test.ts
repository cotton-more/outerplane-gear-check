// @vitest-environment jsdom
// «Команда» (screens/team): open from «Ещё» on a phone, pick heroes and ★, the report reacts; nothing is saved (the ★ come
// from the hero's card; Team only tries higher ones).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset, GuideTeams, Synergy } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { moreButton, openMore } from '../app/more';

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, 'file://' + __filename)), 'utf8');
const D0: Dataset = JSON.parse(file('../fixtures/data.json'));
const SYN: Synergy = JSON.parse(file('../fixtures/synergy.json'));
const TEAMS: GuideTeams = JSON.parse(file('../fixtures/teams.json'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const H = { veronica: '2000037', yuri: '2000026', kappa: '2000077', stella: '2000053', kanon: '2000071' };
const ROSTER = Object.values(H);
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 740 });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  localStorage.clear();
});

async function mount({ roster = ROSTER, syn = true, teams = false, stars }: { roster?: string[]; syn?: boolean; teams?: boolean; stars?: Record<string, number> } = {}) {
  const saved = {
    lang: 'en', welcomeHidden: true, tour: DONE, roster, state: { tab: 'eval' }, item: {},
    // stored hero stars (PLAN 0190): they live in the gear store
    ...(stars ? { gear: { v: 3, seq: 0, pieces: {}, pools: {}, stars } } : {}),
  };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const D: Dataset = { ...structuredClone(D0), ...(syn ? { synergy: SYN } : {}), ...(teams ? { teams: TEAMS } : {}) };
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
const unmount = async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ''; };
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => {
  if (!el) throw new Error('no element');
  await act(async () => el.click());
};
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const team = () => $('#view-team')!;
// a spot: «+» or the hero's portrait button
const slot = (i: number) => team().querySelectorAll<HTMLElement>('.tm-team > .tm-add, .tm-team > .tm-p > .tm-slot')[i];
const spot = (i: number) => team().querySelectorAll<HTMLElement>('.tm-team > *')[i];
// hero buttons of the sheet (who fits, then everyone else) — by the name alone
const sheetHeroes = () => $$('.drawer.tm-sheet .trade-hero, .drawer.tm-sheet .tm-fit');
const heroName = (b: HTMLElement) => b.querySelector('.trade-hn, .tm-fn')!.textContent;
const pick = async (i: number, name: string) => {
  await click(slot(i));
  await click(sheetHeroes().find((b) => heroName(b) === name));
};
const setStars = async (i: number, n: number) => {
  await click(spot(i).querySelector<HTMLElement>('.tm-sb'));
  await click($$('.drawer.hs-sheet .hs-big button')[n - 1]);
};
const report = () => $$('#view-team .tm-hero').map((h) => h.textContent);
async function openTeam() {
  await openMore();
  await click(moreButton('Team'));
}

describe('«Команда»', () => {
  it('opens from «More» on a phone; empty spots and the hint; the bottom bar says only «← Evaluate»', async () => {
    await mount();
    await openTeam();
    expect(team().hidden).toBe(false);
    expect($$('#view-team .tm-add')).toHaveLength(4);
    expect($('#view-team .tm-hint')?.textContent).toMatch(/^Add heroes/);
    expect($('.vbar .vb-tab')?.textContent).toBe('← Evaluate');
    expect($('.vbar .vb-main')).toBeNull();
  });

  it('Veronica alone: ⚠ only from own S3 with suggestions; + Yuri → a quiet ✓ line', async () => {
    await mount();
    await openTeam();
    await click(slot(0));
    const q = $('.drawer.tm-sheet .pick-q') as HTMLInputElement;
    await type(q, 'vero');
    expect(sheetHeroes().map(heroName)).toEqual(['Veronica']);
    await click(sheetHeroes()[0]);
    // no ★ on her card — her minimum ★3 (base rarity, owner 2026-10-12); the sheet is closed
    expect($('.drawer.tm-sheet')).toBeNull();
    expect(spot(0).querySelectorAll('.hs-mini .on')).toHaveLength(3);
    await click(spot(0).querySelector<HTMLElement>('.tm-sb'));
    expect($$('.drawer.hs-sheet .hs-big [aria-pressed="true"]').map((b) => b.getAttribute('aria-label'))).toEqual(['★3']);
    await click($('.drawer.hs-sheet .drawer-x'));
    const warn = $('#view-team .tm-warn')!.textContent!;
    expect(warn).toContain('S1: Dual Attack — Increased Defense only from own S3, on cooldown (4) at battle start.');
    expect(warn).toContain('Would give it:');
    expect(warn).toContain('Kappa');
    expect(warn).toContain('Yuri');
    await pick(1, 'Yuri');
    expect($('#view-team .tm-warn')).toBeNull();
    expect($('#view-team .tm-ok')?.textContent).toBe('✓ S1: Dual Attack — Increased Defense from Yuri');
  });

  it('★ matters: Demiurge Stella ★5 is the first suggestion «from ★6»; set ★6 → Kanon is covered', async () => {
    await mount();
    await openTeam();
    await pick(0, 'Kanon');
    await pick(1, 'Demiurge Stella');
    await setStars(1, 5);
    expect(spot(1).querySelectorAll('.hs-mini .on')).toHaveLength(5);
    const fix = $$('#view-team .tm-fx');
    expect(fix[0].textContent).toBe('Demiurge Stella from ★6');
    await setStars(1, 6);
    expect($('#view-team .tm-warn')).toBeNull();
    expect(report()[0]).toContain('Barrier from Demiurge Stella');
  });

  // PLAN 0190 Z5: the stars belong to the hero — Team shows the stored ★
  it('a hero with a stored ★4 enters at ★4, one without at their minimum (Kanon ★3)', async () => {
    await mount({ stars: { [H.stella]: 4 } });
    await openTeam();
    await pick(0, 'Demiurge Stella');
    await pick(1, 'Kanon');
    expect(spot(0).querySelectorAll('.hs-mini .on')).toHaveLength(4);
    expect(spot(1).querySelectorAll('.hs-mini .on')).toHaveLength(3);
  });

  // owner 2026-10-12: the ★ are changed only on the card; Team tries higher ★ («what if»), never lower, and saves nothing
  it('a stored ★4: the stars under it are locked; ★6 here counts in the spot only, the store keeps ★4; ✕ and back — ★4 again', async () => {
    await mount({ stars: { [H.stella]: 4 } });
    await openTeam();
    await pick(0, 'Demiurge Stella');
    await click(spot(0).querySelector<HTMLElement>('.tm-sb'));
    expect($$('.drawer.hs-sheet .hs-big button').map((b) => (b as HTMLButtonElement).disabled)).toEqual([true, true, true, false, false, false]);
    await click($$('.drawer.hs-sheet .hs-big button')[5]);
    expect(spot(0).querySelectorAll('.hs-mini .on')).toHaveLength(6);
    expect(JSON.parse(localStorage.getItem('ogc.gear')!).stars).toEqual({ [H.stella]: 4 });
    await click(spot(0).querySelector<HTMLElement>('.tm-x'));
    await pick(0, 'Demiurge Stella');
    expect(spot(0).querySelectorAll('.hs-mini .on')).toHaveLength(4);
  });

  it('no ★ on the card: the spot starts at ★6, any ★ can be tried, nothing is saved', async () => {
    await mount();
    await openTeam();
    await pick(0, 'Kanon');
    await setStars(0, 3);
    expect(spot(0).querySelectorAll('.hs-mini .on')).toHaveLength(3);
    expect(JSON.parse(localStorage.getItem('ogc.gear') ?? '{}').stars).toBeUndefined();
  });

  it('the report and the suggestions use the stored ★: Stella ★5 gives nothing yet, «from ★6»; ★6 tried here covers Kanon', async () => {
    await mount({ stars: { [H.stella]: 5 } });
    await openTeam();
    await pick(0, 'Kanon');
    await pick(1, 'Demiurge Stella');
    expect(spot(1).querySelectorAll('.hs-mini .on')).toHaveLength(5);
    expect($$('#view-team .tm-fx')[0].textContent).toBe('Demiurge Stella from ★6');
    await setStars(1, 6);
    expect($('#view-team .tm-warn')).toBeNull();
  });

  it('✕ empties the spot, the portrait replaces the hero; the team survives a tab switch, a reload forgets it and opens «Evaluate»', async () => {
    await mount();
    await openTeam();
    await pick(0, 'Veronica');
    await pick(1, 'Kappa');
    await click(spot(0).querySelector<HTMLElement>('.tm-x'));
    expect($$('#view-team .tm-slot')).toHaveLength(1);
    // the portrait opens the list: another hero takes the spot with its own ★ (not the previous hero's): their minimum when
    // not set (Yuri — ★1)
    await setStars(1, 3);
    await click(slot(1));
    await click(sheetHeroes().find((b) => heroName(b) === 'Yuri'));
    expect(spot(1).textContent).toContain('Yuri');
    expect(spot(1).querySelectorAll('.hs-mini .on')).toHaveLength(1);
    await click($('.vbar .vb-tab')); // ← Evaluate
    await openTeam();
    expect($$('#view-team .tm-slot')).toHaveLength(1);
    await unmount();
    await mount();
    expect($('#view-eval')!.hidden).toBe(false);
    await openTeam();
    expect($$('#view-team .tm-slot')).toHaveLength(0);
  });

  it('the hero sheet: who fits first — outerpedia partners, a skill that starts working; everyone else below', async () => {
    const tamara = '2000060', laplace = '2000044';
    await mount({ roster: [...ROSTER, tamara, laplace], teams: true });
    await openTeam();
    // an empty team: who is most often in outerpedia's teams
    await click(slot(0));
    expect($('.drawer.tm-sheet .tm-ph')?.textContent).toBe('Most often in outerpedia teams');
    await click(sheetHeroes().find((b) => heroName(b) === 'Veronica'));
    await click(slot(1));
    expect($$('.drawer.tm-sheet .tm-ph').map((p) => p.textContent)[0]).toBe('Fit the team');
    const fits = $$('.drawer.tm-sheet .tm-fit');
    expect(fits.slice(0, 2).map((b) => b.textContent)).toEqual([
      'Tamarain outerpedia teams: with Veronica ×8', 'Laplacein outerpedia teams: with Veronica ×8']); // a tie: by outerpedia rank
    expect(fits.find((b) => heroName(b) === 'Kappa')?.textContent).toContain('Veronica: S1: Dual Attack starts working');
    // the same hero is not in both lists; the search filters both
    expect($$('.drawer.tm-sheet .trade-hero').map(heroName)).not.toContain('Laplace');
    await type($('.drawer.tm-sheet .pick-q') as HTMLInputElement, 'lap');
    expect(sheetHeroes().map(heroName)).toEqual(['Laplace']);
  });

  it('an empty roster — a notice with a way to «Characters»', async () => {
    await mount({ roster: [] });
    await openTeam();
    await click([...team().querySelectorAll<HTMLElement>('.fitnote button')].find((b) => b.textContent === 'To characters'));
    expect($('#view-chars')!.hidden).toBe(false);
  });

  it('an old data snapshot without skills — a line instead of the screen', async () => {
    await mount({ syn: false });
    await openTeam();
    expect(team().textContent).toBe('This data has no hero skills — update the app.');
  });
});
