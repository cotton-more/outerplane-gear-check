// @vitest-environment jsdom
// «Обмен вещами»: открытие шторки с карточки героя и с панели ростера («Кого переодеть?»), обмен для команды на «Команде»
// (.x/0200-boss E2: билд под местом, «Подобрать вещи»), заказ героя, план героя
// (piece, search key, source, piece cost, stats points), the walk (.x/0200-boss E2b: ticks, «Оставить как было», the end,
// parking, «Ввести», ticks kept on the device), «Сделал» with «Вернуть», the session (stat-sets T7.4) and cancelling the calculation
// команды. Данные — только из test/fixtures, не владельца. Логика — test/trade.*.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { moreButton, openMore } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
// «Команда» needs the skills data (the team trade lives there, .x/0200-boss E2)
D.synergy = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/synergy.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { 'DEF%': 2, CHC: 2, CHD: 3, HP: 1 };
const aer = D.chars.find((c) => c.name === 'Aer')!;
const ais = D.chars.find((c) => c.name === 'Ais Wallenstein')!;
const akari = D.chars.find((c) => c.name === 'Akari')!;
const bare = D.chars.find((c) => !c.builds.length)!;
let root: Root | null = null;

type Pc = Record<string, unknown>;
const P = (id: string, slot: string, setId: string | null, yellow: Record<string, number>, o: Pc = {}): Pc =>
  ({ id, slot, grade: 'unique', setId, itemKey: null, main: null, yellow, lit: yellow, bt: null, at: '', ...o });
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const WEAK = P('p1', 'helmet', speed, { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, { lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4 });
// лучше WEAK больше чем на 1 очк. (порог совета, R10.8)
const BETTER = P('p2', 'helmet', speed, NEW, { lit: { 'DEF%': 6, CHC: 6, CHD: 6, HP: 6 } });

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
  history.replaceState(null, '', location.pathname);
});

// strict — inside StrictMode, as in dev (src/main.tsx): effects run setup → cleanup → setup on mount
async function mount(extra: Record<string, unknown>, state: Record<string, unknown> = {}, item: Record<string, unknown> = {}, strict = false) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], state: { tab: 'chars', charId: caren.id, ...state }, item, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  const app = createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App));
  await act(async () => root!.render(strict ? createElement(StrictMode, null, app) : app));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const stored = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');


// у Aer надет шлем лучше, чем у Caren: план Caren забирает его у Aer
const gear = (extra: Pc = {}) => G([WEAK, BETTER], { [caren.id]: ['p1'], [aer.id]: ['p2'] },
  { worn: { [caren.id]: { helmet: 'p1' }, [aer.id]: { helmet: 'p2' } }, ...extra });
const ROSTER = [caren.id, aer.id];
const hero = (n: string) => byText('.trade-hero', n);
// do the whole walk: tick every step, leave every empty slot empty
const walkAll = async () => {
  for (let b = $('.tstep .ttick[aria-pressed="false"]:not(:disabled)'); b; b = $('.tstep .ttick[aria-pressed="false"]:not(:disabled)')) await click(b);
  for (let b = byText('.tpill', 'Leave'); b; b = byText('.tpill', 'Leave')) await click(b);
};
const doneBtn = () => $('.tact .btn.primary');

describe('J. обмен вещами', () => {
  it('J1: «Trade ▸» на карточке Caren открывает шторку сразу с её планом', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));

    expect($('.drawer.trade')).not.toBeNull();
    expect($('.tplan .tline.to .tline-n')?.textContent).toContain('Caren');
  });

  it('J2: «Trade» on the roster bar opens «Who to re-dress?» — the one-hero trade, no «Hero | Team» tabs; heroes with builds only', async () => {
    const roster = [caren.id, aer.id, ais.id, akari.id, bare.id];
    await mount({ roster, gear: G([WEAK, BETTER], { [caren.id]: ['p1'], [aer.id]: ['p2'] }) }, { charId: null });
    await click(byText('.cbar button', 'Trade'));
    expect($('.drawer.trade')).not.toBeNull();
    expect($('.trade-mode')).toBeNull();
    expect($('.team')).toBeNull();
    expect(hero('Caren')).toBeTruthy();
    expect(hero(bare.name)).toBeUndefined();
  });

  it('J3: the walk — the piece (source, points), «Keep as it was»; the order and stats; the end gives Aer Caren\'s old helmet', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));

    expect($('.tline.to .tlock')).toBeNull(); // her old helmet goes to Aer: no lock, the end names it in full (O3)
    expect($('.tstep .bgear-row')).not.toBeNull();
    expect($('.tstep .tsrc')?.textContent).toBe('on Aer');
    expect($('.tstep .tpts')?.textContent).toMatch(/^\+[\d.]+ pts$/); // Aer's helmet against Caren's worn helmet
    expect($('.tline.to .aimb')?.textContent).toBe('Order: By stats ▾'); // заказ — его можно сменить
    expect($('.tline.to .tline-s')?.textContent).toMatch(/^Stats: [\d.]+ → [\d.]+ pts$/);
    expect($('.tend .tend-h')?.textContent).toBe('At the end — replacements once all above is done');
    expect(byText('.tend .tstep-h', 'Aer ← Caren’s helmet')?.textContent).toBe('Aer ← Caren’s helmet');
    expect(byText('.tend .tstep', 'Aer ←')?.querySelector('.bgear-t')?.textContent).toContain('SPD'); // the piece in full
    expect($$('.tline.to .thole')).toHaveLength(5); // her five empty slots: «Enter» / «Leave»
    expect($('.tact .tdone')?.textContent).toMatch(/^Done · \d+ left$/);

    await click(byText('.tstep .tkeep', 'Keep as it was'));

    expect($('.tline.to .tstep .tsrc')).toBeNull();
    expect($('.tline.to .tdecl .tstep-h')?.textContent).toBe('Helmet: as it was');
    expect($('.tend')).toBeNull(); // nothing taken off — no end
    await click(byText('.tdecl button', 'undo'));
    expect($('.tstep .tsrc')?.textContent).toBe('on Aer');
  });

  // F1 of review 0136, decision 14: Caren over the cap takes Rin's worn CHD helmet for her CHC 6 one — the line names the extra crit
  it('the hero line names the extra crit when it changes: «Stats drop by 1.4 pts · Extra crit −6.3 → −2.3»', async () => {
    const rin = D.chars.find((c) => c.name === 'Rin')!;
    const crit = D.sets.find((s) => s.short === 'Critical Hit')!.id;
    const acc = P('c1', 'accessory', null, { CHD: 3, 'ATK%': 2, SPD: 1, HP: 1 }, { itemKey: '1036', main: 'CHC', bt: 4 });
    const rest = (['armor', 'gloves', 'shoes'] as const).map((s, i) => P(`c${i + 2}`, s, crit, { 'DEF%': 2, CHD: 2, SPD: 1, HP: 1 }, { bt: 4 }));
    const hA = P('c5', 'helmet', crit, { CHC: 6, 'DEF%': 1, SPD: 1, HP: 1 }, { bt: 4 });
    const hB = P('c6', 'helmet', crit, { CHD: 4, CHC: 1, 'DEF%': 1, SPD: 1 }, { bt: 4 });
    const mine = [acc, ...rest, hA];
    await mount({
      roster: [caren.id, rin.id],
      gear: G([...mine, hB], { [caren.id]: mine.map((p) => p.id as string), [rin.id]: ['c6'] },
        { worn: { [caren.id]: Object.fromEntries(mine.map((p) => [p.slot, p.id])), [rin.id]: { helmet: 'c6' } } }),
    });
    await click(byText('.cd-acts button', 'Trade'));

    expect($('.tline.to .tgain')?.textContent).toBe('▲ +2.6 pts');
    expect($('.tline.to .tline-s')?.textContent).toBe('Stats drop by 1.4 pts · Extra crit −6.3 → −2.3');
    expect($('.tline.to .tline-s .down')?.textContent).toBe('Stats drop by 1.4 pts'); // only the stats part is red
  });

  // MODEL.md §7 item 1: у закреплённого заказ — его закрепление, жёстко; в шторке заказа — один вариант
  it('T7.5: закреплённый — «Order: Pinned: Speed ×4 ▾», в шторке только он', async () => {
    const { pinOptions } = await import('@/game/build/profile');
    const pin = pinOptions(caren as never)[0];
    await mount({ gear: gear({ pin: { [caren.id]: pin.key } }), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));
    expect($('.tline.to .aimb')?.textContent).toBe('Order: Pinned: Speed ×4 ▾');
    await click($('.tline.to .aimb'));
    expect($$('.aimsheet .arow').map((r) => r.textContent)).toEqual(['Pinned: Speed ×4']);
  });

  it('J4: «Done» сохраняет обмен; «Undo» возвращает ogc.gear байт в байт', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    const before = localStorage.getItem('ogc.gear');
    await click(byText('.cd-acts button', 'Trade'));
    await click(doneBtn());
    expect(localStorage.getItem('ogc.gear')).toBe(before); // «Done · N left»: not yet
    await walkAll();
    expect(doneBtn()?.textContent).toBe('Done');
    await click(doneBtn());

    const after = stored();
    expect(localStorage.getItem('ogc.gear')).not.toBe(before);
    expect(after.worn[caren.id].helmet).toBe('p2');
    expect(after.worn[aer.id].helmet).toBe('p1'); // the replacement: Aer wears Caren's old helmet
    expect(localStorage.getItem('ogc.trade')).toBe('null'); // the walk is over
    expect($('.gear-toast')?.textContent).toContain('Undo');

    await click(byText('.gear-toast button', 'Undo'));
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  it('T7.4: после «Done» Caren следующий герой в том же окне не берёт её надетое; строка о сеансе', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));
    expect($('.trade-session')).toBeNull();
    await walkAll();
    await click(doneBtn());

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.trade-session span')?.textContent).toBe('Re-dressed heroes (✓) keep their gear while the window is open.');
    await click(hero('Aer'));
    expect($$('.tstep .tsrc').map((x) => x.textContent)).not.toContain('on Caren');
  });

  // 0200 stage A (Q1 (a) + (c), Q1a): marks in «Who to re-dress?», by name, the re-dressed last with ✓; «Finish»; «Undo»
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  const rows = () => $$('.trade-hero').map((b) => [b.querySelector('.trade-hn')?.textContent, b.querySelector('.trade-mk')?.textContent ?? null, (b as HTMLButtonElement).disabled]);
  it('the picker: the gain now at each hero, by name; after «Done» the hero is last with ✓ and not pickable', async () => {
    const roster = [caren.id, aer.id, ais.id];
    await mount({ gear: gear(), roster }, { charId: null });
    await click(byText('.cbar button', 'Trade'));
    await settle();
    // Caren would take Aer's better helmet; Aer and Ais have nothing to gain
    const before = rows();
    expect(before.map((r) => r[0])).toEqual(['Aer', 'Ais Wallenstein', 'Caren']);
    expect(before.find((r) => r[0] === 'Caren')?.[1]).toMatch(/^\+[\d.]+$/);
    expect(before.find((r) => r[0] === 'Aer')?.[1]).toBe('—');
    expect($('.trade-hero .sr-only')?.textContent).toBe('Nothing to change');

    await click(hero('Caren'));
    await walkAll();
    await click(doneBtn());
    await settle();
    // Aer wears Caren's old helmet now (the replacement, MODEL.md §7 item 7): nothing better for him; Ais (nothing worn) may
    // take it from Aer — a gain
    expect(rows()).toEqual([['Aer', '—', false], ['Ais Wallenstein', expect.stringMatching(/^\+[\d.]+$/), false], ['Caren', '✓', true]]);
    expect(byText('.trade-hero', 'Caren')?.querySelector('.sr-only')?.textContent).toBe('Already re-dressed');
  });

  it('«Undo» takes the hero out of the session: no ✓, his gain is back; «Finish» closes the sheet', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));
    await walkAll();
    await click(doneBtn());
    await settle();
    expect(rows().find((r) => r[0] === 'Caren')?.[1]).toBe('✓');

    await click(byText('.gear-toast button', 'Undo'));
    await settle();
    expect($('.trade-session')).toBeNull();
    expect(rows().find((r) => r[0] === 'Caren')?.slice(1)).toEqual([expect.stringMatching(/^\+[\d.]+$/), false]);

    await click(hero('Caren'));
    await walkAll();
    await click(doneBtn());
    await click(byText('.trade-session button', 'Finish'));
    expect($('.drawer.trade')).toBeNull();
    expect(stored().worn[caren.id].helmet).toBe('p2');
  });

  it('«Undo» works under StrictMode too: the hero leaves the session (the unmounted-guard is re-armed on remount)', async () => {
    await mount({ gear: gear(), roster: ROSTER }, {}, {}, true);
    await click(byText('.cd-acts button', 'Trade'));
    await walkAll();
    await click(doneBtn());
    await settle();
    expect(rows().find((r) => r[0] === 'Caren')?.[1]).toBe('✓');

    await click(byText('.gear-toast button', 'Undo'));
    await settle();
    expect($('.trade-session')).toBeNull();
    expect(rows().find((r) => r[0] === 'Caren')?.slice(1)).toEqual([expect.stringMatching(/^\+[\d.]+$/), false]);
  });

  // the team trade on «Команда» (.x/0200-boss E2): the team without a boss from 'ogc.boss', the build under each spot (kept with
  // the team), «Pick gear» → «Team trade» for 2–4 heroes with builds; one — the one-hero trade; a hero without builds stays out
  const team = async (ids: string[], g = gear()) => {
    await mount({ roster: [...new Set([...ids, aer.id])], gear: g, boss: { v: 2, boss: null, stage: {}, team: [...ids, null, null, null].slice(0, 4) } }, { charId: null });
    await openMore();
    await click(moreButton('Team'));
  };
  const planReady = async () => { for (let i = 0; i < 100 && !$('.tplan'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); }); };

  it('E2: under each spot — the build («stats ▾»); the sheet of her builds; the choice is kept with the team, not in the gear', async () => {
    await team([caren.id, ais.id, akari.id]);
    const pills = () => $$('#view-team .tm-team .opill');
    expect(pills().map((b) => b.textContent)).toEqual(Array(3).fill('stats▾'));
    expect(pills()[0].getAttribute('aria-label')).toBe('Caren’s build: By stats — change');
    await click(pills()[0]);
    const radios = $$('.aimsheet [role="radio"]');
    expect(radios[0].textContent).toBe('By stats');
    expect(radios.length).toBeGreaterThan(1);
    const combo = radios[1].textContent!;
    await click(radios[1]);
    expect($('.aimsheet')).toBeNull();
    expect(pills()[0].textContent).not.toContain('stats');
    expect(pills()[0].getAttribute('aria-label')).toBe(`Caren’s build: ${combo} — change`);
    expect(Object.keys(JSON.parse(localStorage.getItem('ogc.boss')!).orders)).toEqual([caren.id]); // one team: the builds belong to it, not to a boss
    expect(stored().pin).toBeUndefined();
  });

  it('J7: «Pick gear» → «Calculating…», «Cancel» closes the window, nothing stored', async () => {
    await team([caren.id, ais.id, akari.id, aer.id]);
    const before = localStorage.getItem('ogc.gear');
    // the calculation's chunks (setTimeout) wait until released: a fast calculation would finish before the check
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await click(byText('#view-team .tm-go', 'Pick gear'));
      expect($('.drawer.trade .drawer-h')?.textContent).toContain('Team trade');
      expect($('.trade-busy')?.textContent).toContain('Calculating…');
      await click(byText('.trade-busy button', 'Cancel'));
      await act(async () => { vi.runAllTimers(); });
    } finally {
      vi.useRealTimers();
    }
    expect($('.drawer.trade')).toBeNull();
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  it('the plan shows only the team — Aer outside it loses his helmet, his line isn\'t there (owner, 2026-10-04); three heroes are a team', async () => {
    await team([caren.id, ais.id, akari.id]);
    await click(byText('#view-team .tm-go', 'Pick gear'));
    await planReady();
    expect($('.tline.to .tsrc')?.textContent).toBe('on Aer');
    expect($$('.tline').map((l) => l.querySelector('.tline-n')?.textContent)).not.toContain('Aer');
    // a member (Ais or Akari, no helmet) took Caren's old helmet in her step — Aer's emptied slot is no line (O4)
    expect($$('.tline:not(.to)')).toEqual([]);
    expect(document.querySelector('.drawer.trade')?.textContent).not.toContain('Aer:');
  });

  it('one hero with builds — the one-hero trade for her; a hero without builds stays out with a line', async () => {
    await team([caren.id, bare.id]);
    expect($('#view-team .tm-nob')?.textContent).toBe(`${bare.name}: no builds on outerpedia — not in the trade.`);
    expect($$('#view-team .tm-team .opill')).toHaveLength(1);
    await click(byText('#view-team .tm-go', 'Pick gear'));
    expect($('.drawer.trade .drawer-h')?.textContent).toContain('Trade gear');
    expect($('.tplan .tline.to .tline-n')?.textContent).toContain('Caren');
  });

  // the EFF goal (.x/0200-boss E3): with a boss the members who need EFF get «EFF ≈ a → b · p%» on their line; the walk is
  // the boss's and the stage's (owner Q7: new inputs — a new calculation)
  it('E3: Meteos 13 — Akari takes Aer\'s EFF gloves, her line shows the EFF and the chance; the walk names the boss and stage', async () => {
    const own = P('g1', 'gloves', speed, { SPD: 4, ATK: 2 }), effy = P('g2', 'gloves', speed, { SPD: 4, EFF: 6 });
    const g = G([own, effy], { [akari.id]: ['g1'], [aer.id]: ['g2'] }, { worn: { [akari.id]: { gloves: 'g1' }, [aer.id]: { gloves: 'g2' } } });
    await mount({ roster: [akari.id, ais.id, aer.id], gear: g, boss: { v: 2, boss: 'sr:meteos', stage: { 'sr:meteos': 12 }, team: [akari.id, ais.id, null, null] } }, { charId: null });
    await openMore();
    await click(moreButton('Team'));
    await click(byText('#view-team .tm-go', 'Pick gear'));
    await planReady();
    const line = $$('.tline.to').find((l) => l.querySelector('.tline-n')?.textContent?.includes('Akari'))!;
    const eff = line.querySelector('.teff')!;
    expect(eff.textContent).toMatch(/^EFF ≈ \d+ → \d+ · \d+%$/);
    expect(eff.getAttribute('aria-label')).toMatch(/^EFF after the trade \d+ vs RES 288: the debuff lands \d+% of the time$/);
    expect(line.querySelector('.tsrc')?.textContent).toBe('on Aer');
    // Ais needs no EFF — no part
    expect($$('.tline.to').find((l) => l.querySelector('.tline-n')?.textContent?.includes('Ais'))?.querySelector('.teff') ?? null).toBeNull();
    await click(line.querySelector('button.ttick') as HTMLElement);
    expect(JSON.parse(localStorage.getItem('ogc.trade')!).target).toMatch(new RegExp(`^team:${akari.id},${ais.id}\\|sr:meteos@12\\|${akari.id}\\*\\d,${ais.id}\\*\\d$`));
  });

  // the SPD goal (.x/0200-boss E4): Akari's S1 lowers the boss's ATK and Grand Calamari isn't immune to it — the timeline says
  // why she should move first; the trade raises her SPD to 223 (surely first at boss 211) and her line shows «SPD a → b ✓»
  it('E4: Grand Calamari 13 — Akari\'s row says why she should move first; her plan line shows the SPD before and after', async () => {
    const mine = ['helmet', 'armor', 'gloves', 'shoes'].map((s, i) => P(`m${i}`, s, speed, { ATK: 2, HP: 2 }));
    const fast = ['helmet', 'armor', 'gloves', 'shoes'].map((s, i) => P(`f${i}`, s, speed, { SPD: 6, EFF: 4, ATK: 2, HP: 1 }, { bt: 4 }));
    const acc = P('a1', 'accessory', null, { SPD: 4, EFF: 4 }, { main: 'SPD' });
    const g = G([...mine, ...fast, acc], { [akari.id]: mine.map((p) => p.id as string), [aer.id]: [...fast.map((p) => p.id as string), 'a1'] },
      { worn: { [akari.id]: Object.fromEntries(mine.map((p) => [p.slot, p.id])), [aer.id]: { ...Object.fromEntries(fast.map((p) => [p.slot, p.id])), accessory: 'a1' } } });
    await mount({ roster: [akari.id, ais.id, aer.id], gear: g, boss: { v: 2, boss: 'sr:grand-calamari', stage: { 'sr:grand-calamari': 12 }, team: [akari.id, ais.id, null, null] } }, { charId: null });
    await openMore();
    await click(moreButton('Team'));
    const akariRow = [...document.querySelectorAll('#view-team .bt-li')].find((li) => li.textContent?.includes('Akari'))!;
    await click(akariRow.querySelector('.bt-row'));
    const x = [...document.querySelectorAll('#view-team .bt-li')].find((li) => li.textContent?.includes('Akari'))!;
    expect(x.querySelector('.bt-why')?.textContent).toBe('Moving before the boss matters: S1 lowers the boss\'s ATK (from skill level 3).'); // E4-7
    expect([...x.querySelectorAll('.bt-x p')][0].textContent).toMatch(/^SPD \d+ — moves after the boss; to surely move first: 223 \(\+\d+\)\.$/);
    await click(byText('#view-team .tm-go', 'Pick gear'));
    await planReady();
    const line = $$('.tline.to').find((l) => l.querySelector('.tline-n')?.textContent?.includes('Akari'))!;
    const spd = line.querySelector('.tspd')!;
    expect(spd.textContent).toMatch(/^SPD \d+ → \d+✓$/); // flex row: the gap is a margin, not a space
    expect(spd.getAttribute('aria-label')).toMatch(/^SPD after the trade \d+: surely before the boss$/);
    // Ais has no turn-1 reason — no SPD row
    expect($$('.tline.to').find((l) => l.querySelector('.tline-n')?.textContent?.includes('Ais'))?.querySelector('.tspd') ?? null).toBeNull();
  });

  // the walk (MODEL.md §7 items 7 and 9; .x/0200-boss E2b): ticks on the device, «Cancel», parking, the entry window, the team
  describe('the walk', () => {
    const open = async () => { await mount({ gear: gear(), roster: ROSTER }); await click(byText('.cd-acts button', 'Trade')); };

    it('✕ keeps the ticks on the device; the same hero\'s trade picks them up; «Cancel» asks and resets them', async () => {
      await open();
      const step = () => $('.tline.to button.ttick')!.closest('.tstep')!;
      await click($('.tline.to button.ttick'));
      expect(step().classList.contains('done')).toBe(true);
      expect(JSON.parse(localStorage.getItem('ogc.trade')!).target).toBe(`hero:${caren.id}`);
      await click($('.drawer.trade .drawer-x'));
      expect($('.drawer.trade')).toBeNull();
      await click(byText('.cd-acts button', 'Trade'));
      expect(step().classList.contains('done')).toBe(true);
      expect($('.tnote')?.textContent).toMatch(/^Picking up: 1 of \d+ ticked\.$/);

      await click(byText('.tact .btn', 'Cancel'));
      expect($('.ask h3, .ask-t')?.textContent ?? byText('.drawer', 'Reset the ticks?')?.textContent).toContain('Reset the ticks?');
      await click(byText('.drawer button', 'Reset'));
      expect(localStorage.getItem('ogc.trade')).toBe('null');
    });

    it('a replacement kept as it was: Aer\'s helmet stays empty, Caren\'s old one is parked — «P parked» in her Pool', async () => {
      await open();
      await click(byText('.tend .tstep', 'Aer ←')!.querySelector<HTMLElement>('.tkeep'));
      // parked: the lock before Caren's equip names her old helmet in full (O5); no parking line at the end
      expect($('.tline.to .tlock .tstep-h')?.textContent).toBe('Lock: Caren’s helmet· parked');
      expect($('.tline.to .tlock .bgear-t')?.textContent).toContain('SPD');
      expect(byText('.tend .tstep-h', 'parked')).toBeUndefined();
      expect($('.tend .thole')).toBeNull(); // Aer's empty helmet slot is no line (O4): the record keeps it empty
      await walkAll();
      await click(doneBtn());
      const st = stored();
      expect(st.park).toEqual(['p1']);
      expect(st.worn[aer.id]).toBeUndefined();
      await click(byText('.ctabs button, .cd-tabs button, [role="tab"]', 'Pool'));
      expect(byText('.pool-row', 'parked')?.querySelector('.pool-why.park')?.textContent).toBe('Pparked');
      // the piece card says the way out (.x/0204-parked-list)
      await click(byText('.pool-row', 'parked'));
      expect(byText('.piece p', 'Parked:')?.textContent).toBe('Parked: taken off in a trade, nobody could take it. The trade offers it first; it never goes to feed or dismantling. Not needed? Unlock it in the game and “Remove from Caren”.');
    });

    it('«Enter» on an empty slot opens the entry window for that slot; incomplete — «Save» does nothing; «Leave» and «undo»', async () => {
      await open();
      const weapon = byText('.tline.to .thole', 'Weapon: empty')!;
      await click(byText('.tline.to .thole', 'Weapon: empty')!.querySelector<HTMLElement>('.tpill.go'));
      expect(byText('.drawer.trade-entry h3', 'Weapon for Caren')).toBeTruthy();
      expect($('.trade-entry .slotrow')).toBeNull(); // the slot is set by the line
      expect($('.trade-entry .tlive')?.textContent).toBe('Enter all substats: 0 of 4');
      await click(byText('.trade-entry .tact button', 'Save'));
      expect($('.drawer.trade-entry')).not.toBeNull();
      await click(byText('.trade-entry .tact button', 'Cancel'));
      expect($('.drawer.trade-entry')).toBeNull();
      expect(weapon.isConnected).toBe(true);
      await click(byText('.tline.to .thole', 'Weapon: empty')!.querySelector<HTMLElement>('.tpill:not(.go)'));
      expect(byText('.tline.to .tdecl', 'Weapon: left empty')).toBeTruthy();
      await click(byText('.tline.to .tdecl', 'Weapon: left empty')!.querySelector<HTMLElement>('.tundo'));
      expect(byText('.tline.to .thole', 'Weapon: empty')).toBeTruthy();
    });

    it('team «Done» records the moves and the end at once; one toast', async () => {
      await team([caren.id, ais.id, akari.id]);
      await click(byText('#view-team .tm-go', 'Pick gear'));
      await planReady();
      await walkAll();
      await click(doneBtn());
      const st = stored();
      expect(st.worn[caren.id].helmet).toBe('p2');
      expect([ais.id, akari.id].map((id) => st.worn[id]?.helmet)).toContain('p1'); // taken by a member, not orphaned
      expect(st.worn[aer.id]).toBeUndefined(); // left empty
      expect($('.drawer.trade')).toBeNull();
      expect(byText('.gear-toast', 'Team trade saved.')).toBeTruthy();
    });
  });
});
