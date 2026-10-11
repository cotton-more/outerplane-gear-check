// @vitest-environment jsdom
// «Команда» (screens/team): open from «Ещё» on a phone, pick heroes and ★, the report reacts; nothing is saved.
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

async function mount({ roster = ROSTER, syn = true }: { roster?: string[]; syn?: boolean } = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster, state: { tab: 'eval' }, item: {} };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const D: Dataset = { ...structuredClone(D0), ...(syn ? { synergy: SYN } : {}) };
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
const slot = (i: number) => team().querySelectorAll<HTMLElement>('.tm-team > button')[i];
const pick = async (i: number, name: string) => {
  await click(slot(i));
  await click([...team().querySelectorAll<HTMLElement>('.trade-hero')].find((b) => b.textContent === name));
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
    const q = team().querySelector<HTMLInputElement>('.pick-q')!;
    await type(q, 'vero');
    expect($$('#view-team .trade-hero').map((b) => b.textContent)).toEqual(['Veronica']);
    await click($('#view-team .trade-hero'));
    // picked at ★6, the stars of the picked spot are open
    expect($$('#view-team .tm-big [aria-pressed="true"]').map((b) => b.getAttribute('aria-label'))).toEqual(['★6']);
    expect(slot(0).querySelectorAll('.tm-mini .on')).toHaveLength(6);
    const warn = $('#view-team .tm-warn')!.textContent!;
    expect(warn).toContain('Increased Defense only from own S3 — on cooldown (4) at battle start, S1 goes without it until then.');
    expect(warn).toContain('Would give it:');
    expect(warn).toContain('Kappa');
    expect(warn).toContain('Yuri');
    await pick(1, 'Yuri');
    expect($('#view-team .tm-warn')).toBeNull();
    expect($('#view-team .tm-ok')?.textContent).toBe('✓ Increased Defense — from Yuri');
  });

  it('★ matters: Demiurge Stella ★5 is the first suggestion «from ★6»; set ★6 → Kanon is covered', async () => {
    await mount();
    await openTeam();
    await pick(0, 'Kanon');
    await pick(1, 'Demiurge Stella');
    await click(team().querySelectorAll<HTMLElement>('.tm-big button')[4]); // ★5
    expect(slot(1).querySelectorAll('.tm-mini .on')).toHaveLength(5);
    const fix = $$('#view-team .tm-fx');
    expect(fix[0].textContent).toBe('Demiurge Stella from ★6');
    await click(team().querySelectorAll<HTMLElement>('.tm-big button')[5]); // ★6
    expect($('#view-team .tm-warn')).toBeNull();
    expect(report()[0]).toContain('Barrier — from Demiurge Stella');
  });

  it('«Remove» empties the spot; the team survives a tab switch, a reload forgets it and opens «Evaluate»', async () => {
    await mount();
    await openTeam();
    await pick(0, 'Veronica');
    await pick(1, 'Kappa');
    await click($('#view-team .tm-x'));
    expect($$('#view-team .tm-slot')).toHaveLength(1);
    await click($('.vbar .vb-tab')); // ← Evaluate
    await openTeam();
    expect($$('#view-team .tm-slot')).toHaveLength(1);
    await unmount();
    await mount();
    expect($('#view-eval')!.hidden).toBe(false);
    await openTeam();
    expect($$('#view-team .tm-slot')).toHaveLength(0);
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
