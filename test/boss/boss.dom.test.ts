// @vitest-environment jsdom
// A boss on «Команда» (.x/0200-boss stage C): the row and its sheet, stages, «Собрать из гайда» with «Вернуть», a team per
// boss in 'ogc.boss', the guide's heroes in a spot's sheet, several guide teams; old data without bosses — no row.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset, Synergy } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { moreButton, openMore } from '../app/more';

const file = (rel: string) => readFileSync(fileURLToPath(new URL(rel, 'file://' + __filename)), 'utf8');
const D0: Dataset = JSON.parse(file('../fixtures/data.json'));
const SYN: Synergy = JSON.parse(file('../fixtures/synergy.json'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const id = (name: string) => D0.chars.find((c) => c.name === name)!.id;
// Meteos' guide: Luna / Veronica / Caren · Tamara / Fortuna · Laplace / Rin · Poolside Trickster Regina / Roxie
const ROSTER = ['Veronica', 'Caren', 'Tamara', 'Rin', 'Roxie', 'Monad Eva', 'Maxie', 'Vlada', 'Ember', 'Akari'].map(id);
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

async function mount({ bosses = true, roster = ROSTER, boss, stars }: { bosses?: boolean; roster?: string[]; boss?: unknown; stars?: Record<string, number> } = {}) {
  const saved = {
    lang: 'en', welcomeHidden: true, tour: DONE, roster, state: { tab: 'eval' }, item: {}, ...(boss ? { boss } : {}),
    // stored hero stars live in the gear store
    ...(stars ? { gear: { v: 3, seq: 0, pieces: {}, pools: {}, stars } } : {}),
  };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const D: Dataset = { ...structuredClone(D0), synergy: SYN };
  if (!bosses) delete D.bosses;
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
  await openMore();
  await click(moreButton('Team'));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => {
  if (!el) throw new Error('no element');
  await act(async () => el.click());
};
const byText = (sel: string, text: string) => $$(sel).find((b) => b.textContent?.includes(text));
const row = () => $('#view-team .boss-row');
const names = () => $$('#view-team .tm-team > *').map((s) => s.querySelector('.tm-n')?.textContent ?? '+');
const stored = () => JSON.parse(localStorage.getItem('ogc.boss')!);
const pickBoss = async (name: string) => {
  await click(row());
  if (!$('.boss-sheet .boss-list')) await click(byText('.boss-sheet .linkbtn', 'Other boss'));
  await click(byText('.boss-sheet .boss-li', name));
};
const closeSheet = () => click($('.drawer .drawer-x'));

describe('a boss on «Команда»', () => {
  it('old data without bosses: no row, no «Fill», the team works as before', async () => {
    await mount({ bosses: false });
    expect(row()).toBeNull();
    expect($('#view-team .boss-fill')).toBeNull();
    expect($$('#view-team .tm-add')).toHaveLength(4);
  });

  it('the row → the list (no world boss) → Meteos at its top stage; another stage; the stage is kept per boss', async () => {
    await mount();
    expect(row()!.textContent).toBe('Boss:none▾');
    await click(row());
    expect($$('.boss-sheet .tm-ph').map((p) => p.textContent)).toEqual(['Special Request', 'Dimensional Singularity', 'Joint Challenge', 'Guild Raid']);
    expect(byText('.boss-sheet .boss-li', 'Venion')).toBeUndefined();
    expect(byText('.boss-sheet .boss-li', 'Irregular Queen')).toBeUndefined();
    await click(byText('.boss-sheet .boss-li', 'Blazing Knight Meteos'));
    // the sheet shows the boss: stage 13, RES 288, SPD 109, immunities with «Crowd control»
    expect($('.boss-sheet .boss-chip[aria-pressed="true"]')?.textContent).toBe('13');
    expect($$('.boss-sheet .boss-facts b').map((b) => b.textContent)).toEqual(['288', '109']);
    expect($$('.boss-sheet .boss-imm button, .boss-sheet .boss-i').map((b) => b.textContent)).toEqual(['Crowd control ▸', 'Reduced Defense', 'Priority Decrease']);
    await click($('.boss-sheet .boss-cc'));
    expect($$('.boss-sheet .boss-i.cc').map((b) => b.textContent)).toEqual(['Taunted', 'Frozen', 'Stunned', 'Petrified', 'Silenced', 'Golden Curse']);
    expect($('.boss-sheet .boss-guide')?.getAttribute('href')).toBe('https://outerpedia.com/guides/special-request/meteos');
    await click(byText('.boss-sheet .boss-chip', '11'));
    await closeSheet();
    expect(row()!.textContent).toBe('Boss:Blazing Knight Meteos· 11RES 256▾');
    // another boss opens at its top stage; back to Meteos — stage 11 again
    await pickBoss('Annihilator');
    expect($('.boss-sheet .boss-chip[aria-pressed="true"]')?.textContent).toBe('Very Hard');
    await closeSheet();
    expect(row()!.textContent).toContain('Annihilator· Very HardRES 54');
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    expect(row()!.textContent).toContain('· 11RES 256');
    expect(stored()).toMatchObject({ boss: 'sr:meteos', stage: { 'sr:meteos': 10 } }); // an untouched boss stores no stage: the top one
  });

  it('«Fill from the guide» with a partial roster; «Undo» brings the team back', async () => {
    await mount();
    await click($('#view-team .tm-add'));
    await click(byText('.drawer.tm-sheet .trade-hero, .drawer.tm-sheet .tm-fit', 'Akari'));
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    // a boss without a team of its own: empty spots (Akari stays in the «no boss» team)
    expect(names()).toEqual(['+', '+', '+', '+']);
    await click($('#view-team .boss-fill'));
    expect(names()).toEqual(['Veronica', 'Tamara', 'Rin', 'Roxie']); // no Luna → Veronica; no Laplace → Rin
    expect($('.toast')?.textContent).toBe('From the guide: 4 of 4.Undo');
    await click($('.toast button'));
    expect(names()).toEqual(['+', '+', '+', '+']);
    expect($('.toast')).toBeNull();
  });

  it('the «Undo» toast belongs to the boss it was shown for: switching the boss hides it', async () => {
    await mount();
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .boss-fill'));
    expect($('.toast')?.textContent).toBe('From the guide: 4 of 4.Undo');
    await click(row());
    await click(byText('.boss-sheet .btn', 'No boss'));
    expect($('.toast')).toBeNull();
    await pickBoss('Annihilator');
    await closeSheet();
    expect($('.toast')).toBeNull();
  });

  it('a team per boss and one without a boss, kept over a reload', async () => {
    await mount();
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .boss-fill'));
    await click(row());
    await click(byText('.boss-sheet .btn', 'No boss'));
    expect(row()!.textContent).toBe('Boss:none▾');
    expect(names()).toEqual(['+', '+', '+', '+']);
    expect(stored().teams['sr:meteos']).toEqual(['Veronica', 'Tamara', 'Rin', 'Roxie'].map(id));
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    await mount({ boss: stored() });
    expect(row()!.textContent).toContain('Blazing Knight Meteos');
    expect(names()).toEqual(['Veronica', 'Tamara', 'Rin', 'Roxie']);
  });

  it('a hero who left the roster leaves the spot empty; a stored boss no longer listed — no boss', async () => {
    await mount({ roster: ROSTER.filter((x) => x !== id('Tamara')), boss: { v: 1, boss: 'sr:meteos', stage: {}, teams: { 'sr:meteos': ['Veronica', 'Tamara', 'Rin', 'Roxie'].map(id) } } });
    expect(names()).toEqual(['Veronica', '+', 'Rin', 'Roxie']);
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    await mount({ boss: { v: 1, boss: 'wb:harshna', stage: {}, teams: {} } });
    expect(row()!.textContent).toBe('Boss:none▾');
  });

  it("a spot's sheet with a boss: the guide's heroes for the spot instead of «Fit the team», who is not in the roster", async () => {
    await mount();
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .boss-fill'));
    await click($('#view-team .tm-team .tm-slot'));
    expect($$('.drawer.tm-sheet .tm-ph').map((p) => p.textContent)).toEqual(['From the guide for this spot', 'Everyone else']);
    expect($$('.drawer.tm-sheet .tm-fit').map((b) => b.textContent)).toEqual(['Caren']);
    expect($('.drawer.tm-sheet .tm-gn')?.textContent).toBe('Also in the guide: Luna — not in your roster.');
    expect($$('.drawer.tm-sheet .trade-hero').map((b) => b.textContent)).not.toContain('Caren');
    await click($('.drawer.tm-sheet .tm-fit'));
    expect(names()[0]).toBe('Caren');
  });

  it('several guide teams → a choice; a team with nobody owned can\'t be picked; a 2-hero core fills 2 spots', async () => {
    await mount();
    await pickBoss('Gornolf');
    await closeSheet();
    await click($('#view-team .boss-fill'));
    const rows = $$('.boss-choice .boss-tc button') as HTMLButtonElement[];
    expect(rows).toHaveLength(6);
    expect(rows.map((b) => b.querySelector('.boss-th')!.textContent)).toEqual(
      ['0 of 4 owned', '1 of 2 owned', '4 of 4 owned', '1 of 4 owned', '4 of 4 owned', '0 of 4 owned']);
    expect(rows.map((b) => b.disabled)).toEqual([true, false, false, false, false, true]);
    expect(rows[3].querySelector('.boss-tm')!.textContent).toBe('missing: Liselotte, Omega Nadja, Demiurge Drakhan');
    await click(rows[1]);
    expect(names()).toEqual(['Monad Eva', '+', '+', '+']);
    expect($('.toast')?.textContent).toBe('From the guide: 1 of 2.Undo');
  });

  it('nobody from the guide in the roster: a message, the team unchanged', async () => {
    await mount({ roster: [id('Akari')] });
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .boss-fill'));
    expect(names()).toEqual(['+', '+', '+', '+']);
    expect($('.toast')?.textContent).toBe('None of this guide’s heroes are in your roster.');
  });

  it('singularity: no guide teams — no «Fill»; ranks in two rows, a letter keeps the pluses', async () => {
    await mount();
    await pickBoss('Urd (Dark)');
    const rows = $$('.boss-sheet .boss-chips');
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toBe('—+++');
    await click(byText('.boss-sheet .boss-chip', 'AA'));
    expect($$('.boss-sheet .boss-chip[aria-pressed="true"]').map((b) => b.textContent)).toEqual(['AA', '++']);
    await click([...rows[1].querySelectorAll<HTMLElement>('.boss-chip')][0]);
    expect($$('.boss-sheet .boss-chip[aria-pressed="true"]').map((b) => b.textContent)).toEqual(['AA', '—']);
    await closeSheet();
    expect(row()!.textContent).toContain('Urd (Dark)· AA');
    expect($('#view-team .boss-fill')).toBeNull();
  });
});

// EFF vs the boss's RES under the team (.x/0200-boss stage D): members who need EFF (rule R) — EFF, the gap to RES + 1 or ✓,
// the chance the debuff lands; the EE hint until the game's number is typed; a row opens «EFF for X»
describe('EFF vs RES on «Команда»', () => {
  const rows = () => $$('#view-team .boss-eff .be-row').map((r) => [r.querySelector('.be-n')?.textContent, r.querySelector('.be-v')?.textContent,
    r.querySelector('.be-d')?.textContent, r.querySelector('.be-p')?.textContent, r.querySelector('.be-hint')?.textContent ?? null]);
  const meteos = async () => {
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .boss-fill'));
  };

  it('no boss — no block; Meteos 13 (RES 288): Tamara and Roxie, nothing worn — W + node, «≈», the EE hint for Tamara', async () => {
    await mount();
    expect($('#view-team .boss-eff')).toBeNull();
    await meteos();
    expect($('#view-team .boss-eff h4')?.textContent).toBe('EFF vs RES 288');
    // Tamara: W 120 + Ranger 50 = 170 → −119, resisted (⌊1000/(1 + 100/118)⌋ + 1)/1001 → lands 45 %
    expect(rows()).toEqual([
      ['Tamara', '≈\u2009about 170', '−119', '45 %', 'EE gives EFF ×2 — type EFF from the game ▸'],
      ['Roxie', '≈\u2009about 120', '−169', '37 %', null],
    ]);
    expect($('#view-team .boss-eff .be-foot')?.textContent).toContain('the chance the boss doesn’t resist');
  });

  it('a row → «EFF for Tamara»: typed 340 — ✓ 100 %, no hint; stored on the hero', async () => {
    await mount();
    await meteos();
    await click($('#view-team .boss-eff .be-row'));
    const input = $('.effsheet input') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(input, '340'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(rows()[0]).toEqual(['Tamara', '340', '✓', '100 %', null]);
    expect(JSON.parse(localStorage.getItem('ogc.gear')!).eff).toEqual({ [id('Tamara')]: { typed: 340, at: 170 } });
  });

  // Iota's transcend gives EFF (★4 +3 %, ★6 +6 %): the sheet takes the card's ★4 (123), not the ★6 tried in the spot (127)
  it('the sheet stores the typed value at the card\'s ★, not at the ★ tried in the spot', async () => {
    const iota = id('Iota');
    await mount({ roster: [...ROSTER, iota], stars: { [iota]: 4 } });
    await pickBoss('Blazing Knight Meteos');
    await closeSheet();
    await click($('#view-team .tm-add'));
    await click(byText('.drawer.tm-sheet .trade-hero, .drawer.tm-sheet .tm-fit', 'Iota'));
    await click($('#view-team .tm-team .tm-sb'));
    await click($$('.drawer.hs-sheet .hs-big button')[5]);
    const iotaRow = () => $$('#view-team .boss-eff .be-row').find((r) => r.querySelector('.be-n')?.textContent === 'Iota')!;
    expect(iotaRow().querySelector('.be-v')?.textContent).toBe('≈\u2009about 127');
    await click(iotaRow());
    expect($('.effsheet .eff-v')?.textContent).toBe('≈\u2009about 123');
    const input = $('.effsheet input') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { set.call(input, '250'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byText('.effsheet .btn.primary', 'Done'));
    expect(JSON.parse(localStorage.getItem('ogc.gear')!).eff).toEqual({ [iota]: { typed: 250, at: 123 } });
  });
});
