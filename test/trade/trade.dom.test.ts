// @vitest-environment jsdom
// «Обмен вещами»: открытие шторки с карточки героя и с панели ростера, команда из четырёх, заказ героя, план героя
// (piece, search key, source, piece cost, «Не брать», stats points), «Сделал» with «Вернуть», the session (stat-sets T7.4) and cancelling the calculation
// команды. Данные — только из test/fixtures, не владельца. Логика — test/trade.*.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
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

describe('J. обмен вещами', () => {
  it('J1: «Trade ▸» на карточке Caren открывает шторку сразу с её планом', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));

    expect($('.drawer.trade')).not.toBeNull();
    expect($('.tplan .tline.to .tline-n')?.textContent).toContain('Caren');
  });

  it('J2: список героев, вкладка «Team» из четырёх мест, у члена — заказ; смена заказа — шторка с наборами', async () => {
    const roster = [caren.id, aer.id, ais.id, akari.id, bare.id];
    await mount({ roster, gear: G([WEAK, BETTER], { [caren.id]: ['p1'], [aer.id]: ['p2'] }) }, { charId: null });
    // «Trade» на панели списка — сразу режим «Team» (для одного героя — «Trade ▸» на карточке)
    await click(byText('.cbar button', 'Trade'));
    expect($$('.team-p')).toHaveLength(4);
    await click(byText('.trade-mode button', 'Hero'));
    expect(hero('Caren')).toBeTruthy();
    expect(hero(bare.name)).toBeUndefined();

    await click(byText('.trade-mode button', 'Team'));
    expect($$('.team-p')).toHaveLength(4);
    for (const id of [caren.id, aer.id, ais.id, akari.id]) {
      await click($$('.team-add')[0]);
      await click(hero(D.chars.find((c) => c.id === id)!.name));
    }
    expect($$('.team .aimb').map((b) => b.textContent)).toEqual(Array(4).fill('By stats ▾'));
    expect($$('.team .aimb')[0].getAttribute('aria-label')).toBe('Order: By stats ▾');

    await click($$('.team .aimb')[0]);
    const radios = $$('.aimsheet [role="radio"]');
    expect(radios[0].textContent).toBe('By stats');
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios.length).toBeGreaterThan(1);
    const combo = radios[1].textContent!;
    await click(radios[1]);
    expect($('.aimsheet')).toBeNull();
    expect($$('.team .aimb')[0].textContent).toBe(`${combo} ▾`);
    expect(stored().pin).toBeUndefined(); // заказ живёт в шторке, не в хранилище
  });

  it('команда: член — плитка как в списке, без звезды; нажатие — «Убрать из команды» под ромбом', async () => {
    await mount({ roster: [caren.id, aer.id], gear: gear() }, { charId: null });
    await click(byText('.cbar button', 'Trade'));
    await click($$('.team-add')[0]);
    await click(hero('Caren'));

    expect($('.team .ctile .cn')?.textContent).toBe('Caren');
    expect($('.team .star')).toBeNull();

    await click($('.team .ctile'));
    await click(byText('.trade-out', 'Caren'));

    expect($('.team .ctile')).toBeNull();
    expect($$('.team-add')).toHaveLength(4);
  });

  it('J3: у вещи в плане — ключ поиска, источник, «Не брать»; у героя — заказ и очки статов; «Не брать» пересчитывает', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));

    expect($('.tmove .bgear-row')).not.toBeNull();
    expect($('.tmove .tsrc')?.textContent).toBe('on Aer');
    expect($('.tmove .tpts')?.textContent).toMatch(/^\+[\d.]+ pts$/); // Aer's helmet against Caren's worn helmet
    expect($('.tline.to .aimb')?.textContent).toBe('Order: By stats ▾'); // заказ — его можно сменить
    expect($('.tline.to .tline-s')?.textContent).toMatch(/^Stats: [\d.]+ → [\d.]+ pts$/);
    expect(byText('.tmove button', "Don't take")).toBeTruthy();
    expect($('.tpin')).toBeNull();
    expect($('.tline:not(.to)')).toBeNull(); // только сам герой: у Aer забирают шлем, его строки нет (владелец, 2026-10-05)

    await click(byText('.tmove button', "Don't take"));

    expect($('.tline.to .tmove .tsrc')).toBeNull();
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
    await click($('.tact .btn.primary'));

    const after = stored();
    expect(localStorage.getItem('ogc.gear')).not.toBe(before);
    expect(after.worn[caren.id].helmet).toBe('p2');
    expect($('.gear-toast')?.textContent).toContain('Undo');

    await click(byText('.gear-toast button', 'Undo'));
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  it('T7.4: после «Done» Caren следующий герой в том же окне не берёт её надетое; строка о сеансе', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));
    expect($('.trade-session')).toBeNull();
    await click($('.tact .btn.primary'));

    expect(stored().worn[caren.id].helmet).toBe('p2');
    expect($('.trade-session span')?.textContent).toBe('Re-dressed heroes (✓) keep their gear while the window is open.');
    await click(hero('Aer'));
    expect($$('.tmove .tsrc').map((x) => x.textContent)).not.toContain('on Caren');
  });

  // 0200 stage A (Q1 (a) + (c), Q1a): marks in «Who to re-dress?», by name, the re-dressed last with ✓; «Finish»; «Undo»
  const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 60)); });
  const rows = () => $$('.trade-hero').map((b) => [b.querySelector('.trade-hn')?.textContent, b.querySelector('.trade-mk')?.textContent ?? null, (b as HTMLButtonElement).disabled]);
  it('the picker: the gain now at each hero, by name; after «Done» the hero is last with ✓ and not pickable', async () => {
    const roster = [caren.id, aer.id, ais.id];
    await mount({ gear: gear(), roster }, { charId: null });
    await click(byText('.cbar button', 'Trade'));
    await click(byText('.trade-mode button', 'Hero'));
    await settle();
    // Caren would take Aer's better helmet; Aer and Ais have nothing to gain
    const before = rows();
    expect(before.map((r) => r[0])).toEqual(['Aer', 'Ais Wallenstein', 'Caren']);
    expect(before.find((r) => r[0] === 'Caren')?.[1]).toMatch(/^\+[\d.]+$/);
    expect(before.find((r) => r[0] === 'Aer')?.[1]).toBe('—');
    expect($('.trade-hero .sr-only')?.textContent).toBe('Nothing to change');

    await click(hero('Caren'));
    await click($('.tact .btn.primary'));
    await settle();
    // Caren's old helmet (p1) was worn when the window opened and is off now: free, so Aer (his slot is empty since Caren took
    // his) can take it; so can Ais (nothing worn) — a gain, not «—» (before the free pieces it stayed held in Caren's pool)
    expect(rows()).toEqual([['Aer', expect.stringMatching(/^\+[\d.]+$/), false], ['Ais Wallenstein', expect.stringMatching(/^\+[\d.]+$/), false], ['Caren', '✓', true]]);
    expect(byText('.trade-hero', 'Caren')?.querySelector('.sr-only')?.textContent).toBe('Already re-dressed');
  });

  it('«Undo» takes the hero out of the session: no ✓, his gain is back; «Finish» closes the sheet', async () => {
    await mount({ gear: gear(), roster: ROSTER });
    await click(byText('.cd-acts button', 'Trade'));
    await click($('.tact .btn.primary'));
    await settle();
    expect(rows().find((r) => r[0] === 'Caren')?.[1]).toBe('✓');

    await click(byText('.gear-toast button', 'Undo'));
    await settle();
    expect($('.trade-session')).toBeNull();
    expect(rows().find((r) => r[0] === 'Caren')?.slice(1)).toEqual([expect.stringMatching(/^\+[\d.]+$/), false]);

    await click(hero('Caren'));
    await click($('.tact .btn.primary'));
    await click(byText('.trade-session button', 'Finish'));
    expect($('.drawer.trade')).toBeNull();
    expect(stored().worn[caren.id].helmet).toBe('p2');
  });

  it('«Undo» works under StrictMode too: the hero leaves the session (the unmounted-guard is re-armed on remount)', async () => {
    await mount({ gear: gear(), roster: ROSTER }, {}, {}, true);
    await click(byText('.cd-acts button', 'Trade'));
    await click($('.tact .btn.primary'));
    await settle();
    expect(rows().find((r) => r[0] === 'Caren')?.[1]).toBe('✓');

    await click(byText('.gear-toast button', 'Undo'));
    await settle();
    expect($('.trade-session')).toBeNull();
    expect(rows().find((r) => r[0] === 'Caren')?.slice(1)).toEqual([expect.stringMatching(/^\+[\d.]+$/), false]);
  });

  it('J7: «Calculate» → «Calculating…», «Cancel» гасит расчёт, ничего не записано', async () => {
    const roster = [caren.id, aer.id, ais.id, akari.id];
    await mount({ roster, gear: gear() }, { charId: null });
    const before = localStorage.getItem('ogc.gear');
    await click(byText('.cbar button', 'Trade'));
    for (const id of roster) {
      await click($$('.team-add')[0]);
      await click(hero(D.chars.find((c) => c.id === id)!.name));
    }
    // куски расчёта (setTimeout) не идут, пока не отпустим: иначе быстрый расчёт успевал закончиться до проверки
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      await click($('.trade-count'));
      expect($('.trade-busy')?.textContent).toContain('Calculating…');
      await click(byText('.trade-busy button', 'Cancel'));
      await act(async () => { vi.runAllTimers(); });
    } finally {
      vi.useRealTimers();
    }

    expect($('.trade-busy')).toBeNull();
    expect($('.tplan')).toBeNull();
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  it('команда: в плане только члены команды — у Aer вне команды берут шлем, его строки нет (владелец, 2026-10-04)', async () => {
    const fourth = D.chars.find((c) => c.builds.length && ![caren.id, aer.id, ais.id, akari.id].includes(c.id))!;
    const team = [caren.id, ais.id, akari.id, fourth.id];
    await mount({ roster: [...team, aer.id], gear: gear() }, { charId: null });
    await click(byText('.cbar button', 'Trade'));
    for (const id of team) {
      await click($$('.team-add')[0]);
      await click(hero(D.chars.find((c) => c.id === id)!.name));
    }
    await click($('.trade-count'));
    for (let i = 0; i < 100 && !$('.tplan'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect($('.tline.to .tsrc')?.textContent).toBe('on Aer');
    expect($$('.tline').map((l) => l.querySelector('.tline-n')?.textContent)).not.toContain('Aer');
    expect($('.tline:not(.to)')).toBeNull();
  });

  // free pieces (MODEL.md §7 items 2 and 8): worn when the window opened, off now, given to no one → «Free pieces» on close
  describe('free pieces', () => {
    const FREE3 = [caren.id, aer.id, ais.id];
    const freeSheet = () => byText('.drawer', 'Free pieces');
    const oneRedressed = async () => {
      await mount({ gear: gear(), roster: FREE3 }, { charId: null });
      await click(byText('.cbar button', 'Trade'));
      await click(byText('.trade-mode button', 'Hero'));
      await click(hero('Caren'));
      await click($('.tact .btn.primary'));
      await settle();
    };

    it('«Finish» after Caren took Aer\'s helmet: the sheet lists Caren\'s old helmet, no hero named, nothing stored', async () => {
      await oneRedressed();
      const before = localStorage.getItem('ogc.gear');
      await click(byText('.trade-session button', 'Finish'));
      expect($('.drawer.trade')).toBeNull();
      const sheet = freeSheet()!;
      expect(sheet.classList.contains('trade-free')).toBe(true);
      expect(sheet.querySelector('h3')?.textContent).toBe('Free pieces');
      expect(sheet.textContent).toContain("Taken off in this trade and given to no one. In the game they're in your inventory.");
      expect(sheet.querySelectorAll('.tmove')).toHaveLength(1);
      const row = sheet.querySelector('.tmove')!;
      expect(row.textContent).toContain('Speed');
      expect(row.querySelector('.bgear-t')?.textContent).toContain('SPD'); // substats with levels, as in the plan
      expect(row.querySelector('.tsrc')).toBeNull();
      expect(row.querySelector('button')).toBeNull();
      for (const n of ['Caren', 'Aer']) expect(sheet.textContent).not.toContain(n);
      expect([...sheet.querySelectorAll('.drawer-b button')]).toEqual([]);
      expect(localStorage.getItem('ogc.gear')).toBe(before);

      await click(sheet.querySelector<HTMLElement>('.drawer-x'));
      expect(freeSheet()).toBeUndefined();
    });

    it('the ✕ of the trade sheet closes it the same way', async () => {
      await oneRedressed();
      await click($('.drawer.trade .drawer-x'));
      expect(freeSheet()).toBeTruthy();
    });

    it('Aer took the free helmet before closing: no sheet', async () => {
      await oneRedressed();
      await click(hero('Aer'));
      expect($$('.tmove .tsrc').map((x) => x.textContent)).toEqual(['in inventory']); // a free piece is nobody's stock
      await click($('.tact .btn.primary'));
      await settle();
      expect(stored().worn[aer.id].helmet).toBe('p1');
      await click(byText('.trade-session button', 'Finish'));
      expect($('.drawer.trade')).toBeNull();
      expect(freeSheet()).toBeUndefined();
    });

    it('«Undo» before closing: the piece is worn again — no sheet', async () => {
      await oneRedressed();
      await click(byText('.gear-toast button', 'Undo'));
      await settle();
      await click($('.drawer.trade .drawer-x'));
      expect($('.drawer.trade')).toBeNull();
      expect(freeSheet()).toBeUndefined();
    });

    it('nothing re-dressed: closing shows no sheet', async () => {
      await mount({ gear: gear(), roster: ROSTER });
      await click(byText('.cd-acts button', 'Trade'));
      await click($('.drawer.trade .drawer-x'));
      expect($('.drawer')).toBeNull();
    });

    it('team «Done» that leaves a piece free: the sheet opens with the applied store', async () => {
      // Caren takes Aer's helmet; her old one is junk (no useful stats), so nobody in the team wears it
      const junk = P('p1', 'helmet', speed, { RES: 1 }, { lit: { RES: 1 }, bt: 4 });
      const team = [caren.id, ais.id, akari.id, D.chars.find((c) => c.name === 'Ame')!.id];
      await mount({ roster: [...team, aer.id], gear: G([junk, BETTER], { [caren.id]: ['p1'], [aer.id]: ['p2'] },
        { worn: { [caren.id]: { helmet: 'p1' }, [aer.id]: { helmet: 'p2' } } }) }, { charId: null });
      await click(byText('.cbar button', 'Trade'));
      for (const id of team) {
        await click($$('.team-add')[0]);
        await click(hero(D.chars.find((c) => c.id === id)!.name));
      }
      await click($('.trade-count'));
      for (let i = 0; i < 100 && !$('.tplan'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      await click($('.tact .btn.primary'));

      expect(stored().worn[caren.id].helmet).toBe('p2');
      expect($('.drawer.trade')).toBeNull();
      expect(freeSheet()?.querySelectorAll('.tmove')).toHaveLength(1);
    });
  });
});
