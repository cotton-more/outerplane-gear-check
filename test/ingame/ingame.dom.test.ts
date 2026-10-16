// @vitest-environment jsdom
// «Надеть в игре» on the page (features/ingame, HISTORY.md 0230): what writes a line ('ogc.ingame') and what doesn't —
// the card's «Надеть» and hero mode from «Оценить вещь для X» do; hero mode from «Ввести» or «Примерить замену» doesn't;
// «Вернуть» of the message removes the line; a dead or malformed line is dropped on read; the backup doesn't carry them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';
import { encodeBackup } from '@/features/roster/backup';
import { openBackup } from '../app/more';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
const speed = D.sets.find((s) => s.short === 'Speed')!.id;
const NEW = { setId: speed, subs: { 'DEF%': 3, CHC: 2, CHD: 3, HP: 1 } };
// Caren: a weaker Speed helmet in her pool, not worn
const P1 = { id: 'p1', slot: 'helmet', grade: 'unique', setId: speed, itemKey: null, main: null, yellow: { 'DEF%': 2, CHC: 2, SPD: 1, EFF: 1 }, lit: { 'DEF%': 2, CHC: 2, SPD: 2, EFF: 3 }, bt: 4, at: '' };
const GEAR = { v: 3, seq: 1, pieces: { p1: P1 }, pools: { [caren.id]: ['p1'] } };
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
  history.replaceState(null, '', location.pathname);
});

async function mount(state: Record<string, unknown>, item: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [caren.id], gear: GEAR, state: { tab: 'eval', ...state }, item, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('no element'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const stored = (k: string) => JSON.parse(localStorage.getItem('ogc.' + k) ?? 'null');
const onCard = { tab: 'chars', charId: caren.id, slot: 'helmet', grade: 'unique' };
const toPool = async () => { const t = byText('.btabs [role="tab"]', 'Pool'); if (t?.getAttribute('aria-selected') !== 'true') await click(t); };
const enter = async (subs: Record<string, number>) => {
  for (const [k, n] of Object.entries(subs)) {
    await click($(`.statgrid button[data-tour-item="${k}"]`));
    await click($(`.drawer.lvl .roll-b button:nth-child(${n})`));
  }
};
const lines = () => (stored('ingame')?.lines ?? []) as { hero: string; slot: string; piece: string; snap: { lit: Record<string, number> }; off?: string }[];

describe('what writes a line', () => {
  it('the card\'s «Надеть»: a line with the record and its snapshot; «Вернуть» removes it', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vc-equip'));
    const id = stored('gear').worn[caren.id].helmet;
    expect(lines()).toEqual([expect.objectContaining({ hero: caren.id, slot: 'helmet', piece: id, snap: expect.objectContaining({ id, lit: NEW.subs }) })]);

    await click(byText('.gear-toast button', 'Undo'));
    expect(stored('gear').worn?.[caren.id]?.helmet).toBeUndefined();
    expect(stored('ingame')).toBeNull();
  });

  it('hero mode from «Оценить вещь для Caren» — a line', async () => {
    await mount(onCard, NEW);
    await toPool();
    await click($('.pool-rate'));
    expect(stored('tryon')).toEqual({ charId: caren.id, via: 'rate' });
    await click($('.vc-equip'));
    expect(lines().map((l) => [l.hero, l.slot])).toEqual([[caren.id, 'helmet']]);
  });

  it('hero mode from «Примерить замену» — no line', async () => {
    await mount(onCard, NEW);
    await toPool();
    await click(byText('.pool-row', 'Speed Set'));
    await click(byText('.piece-act button', 'Try a replacement'));
    expect(stored('tryon')).toMatchObject({ via: 'replace' });
    await click($('.vc-equip'));
    expect(stored('gear').pools[caren.id]).toEqual(['p2']);
    expect(stored('ingame')).toBeNull();
  });

  it('after «Примерить замену» is used up the mode is «Оценить вещь для X»: the next «Надеть» writes a line', async () => {
    await mount(onCard, NEW);
    await toPool();
    await click(byText('.pool-row', 'Speed Set'));
    await click(byText('.piece-act button', 'Try a replacement'));
    await click($('.vc-equip'));
    expect(stored('ingame')).toBeNull();
    expect(stored('tryon')).toEqual({ charId: caren.id, via: 'rate' });
    await click(byText('.pick', 'Pick set'));
    await click($(`.set[data-tour-item="Speed"]`));
    await enter({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
    await click($('.vc-equip'));
    expect(lines().map((l) => l.hero)).toEqual([caren.id]); // one line for the next piece
  });

  it('«Оценить вещь для Caren», a weak piece over her worn one: «Заменить» writes a line', async () => {
    const worn = { ...P1, id: 'p1', yellow: { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 }, lit: { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 3 } };
    const gear = { v: 3, seq: 1, pieces: { p1: worn }, pools: { [caren.id]: ['p1'] }, worn: { [caren.id]: { helmet: 'p1' } } };
    await mount(onCard, { setId: speed, subs: { HP: 1, DEF: 1, ATK: 1, RES: 1 } }, { gear });
    await toPool();
    await click($('.pool-rate'));
    await click($('.vc-equip'));
    expect(stored('gear').worn[caren.id].helmet).not.toBe('p1');
    expect(lines().map((l) => [l.hero, l.slot])).toEqual([[caren.id, 'helmet']]);
  });

  it('hero mode from «Ввести» on an empty slot — no line', async () => {
    await mount({ ...onCard, slot: 'gloves' }, {});
    await click(byText('.bgear-empty', 'Armor')?.querySelector<HTMLElement>('.bgear-act button:last-child'));
    expect(stored('tryon')).toMatchObject({ via: 'enter' });
    await click(byText('.pick', 'Pick set'));
    await click($(`.set[data-tour-item="Speed"]`));
    await enter({ 'DEF%': 2, CHC: 2, CHD: 1, SPD: 1 });
    await click($('.vc-equip'));
    expect(stored('gear').worn[caren.id].armor).toBeTruthy();
    expect(stored('ingame')).toBeNull();
  });

  it('the backup code carries no lines: it is the gear and the roster alone', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vc-equip'));
    expect(lines()).toHaveLength(1);
    const code = await openBackup();
    expect(code.value).toBe(encodeBackup(stored('gear'), stored('roster')));
  });
});

describe('superseded promise', () => {
  it('a second «Надеть» on a promised slot: the first record leaves, one line for the slot; «Вернуть» brings both back', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, NEW);
    await click($('.vc-equip'));
    const first = lines()[0];
    expect(first.piece).toBe('p2');
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    await mount({ slot: 'helmet', grade: 'unique' }, { setId: speed, subs: { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 } }, { gear: stored('gear'), ingame: stored('ingame') });
    await click($('.vc-equip'));
    expect(stored('gear').pieces.p2).toBeUndefined();
    expect(stored('gear').worn[caren.id].helmet).toBe('p3');
    expect(lines()).toEqual([{ ...first, id: `${caren.id}:helmet:p3`, piece: 'p3', snap: expect.objectContaining({ id: 'p3' }) }]);

    await click(byText('.gear-toast button', 'Undo'));
    expect(stored('gear').worn[caren.id].helmet).toBe('p2');
    expect(lines()).toEqual([first]);
  });
});

// owner answers (review 2, Q1 / Q2): a superseded promise — P1 leaves, P0 (the piece the game still has on, a reserve) leaves
// too, P1's fed reserves go back; «Вернуть» undoes all of it (F2, the tick between, is a unit test: the list is a sheet here)
describe('superseded promise: P0, fed reserves, F2', () => {
  const rin = D.chars.find((c) => c.name === 'Rin')!;
  const W1 = { ...P1, lit: { 'DEF%': 1, CHC: 1, CHD: 1, HP: 1 }, yellow: { 'DEF%': 1, CHC: 1, CHD: 1, HP: 1 }, bt: 0 }; // a weak promised helmet
  const P0 = { ...P1, id: 'p0', lit: { 'DEF%': 1, CHC: 1, SPD: 1, EFF: 1 }, yellow: { 'DEF%': 1, CHC: 1, SPD: 1, EFF: 1 }, bt: 0 };
  const P2 = { ...P1, id: 'p2', slot: 'gloves' };            // another slot, a reserve of Caren: never promised
  const R = { ...P1, id: 'p5', lit: { 'DEF%': 1, SPD: 1, CHC: 1, EFF: 1 }, bt: 0 };
  const L1 = { id: `${caren.id}:helmet:p1`, hero: caren.id, slot: 'helmet', piece: 'p1', snap: W1 };
  const gear = (pool: string[]) => ({ v: 3, seq: 5, pieces: { p0: P0, p1: W1, p2: P2, p5: R }, pools: { [caren.id]: pool, [rin.id]: [] as string[] }, worn: { [caren.id]: { helmet: 'p1' } } });
  const BIG = { setId: speed, subs: { 'DEF%': 4, CHC: 3, CHD: 3, SPD: 2 } };
  const pool = (h: string) => stored('gear').pools[h] as string[];

  it('lock case: P0 and P1 leave, Rin\'s reserve returns, a non-promised reserve stays; «Вернуть» undoes all, L1 included', async () => {
    const l1 = { ...L1, off: 'lock', was: 'p0', fed: [{ hero: rin.id, snap: R }] };
    await mount({ slot: 'helmet', grade: 'unique' }, BIG, { gear: gear(['p0', 'p1', 'p2']), ingame: { v: 1, lines: [l1] }, roster: [caren.id] });
    await click($('.vc-equip'));
    expect(pool(caren.id)).not.toContain('p0');
    expect(pool(caren.id)).not.toContain('p1');
    expect(pool(caren.id)).toContain('p2');
    expect(pool(rin.id)).toEqual(['p5']);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).not.toHaveProperty('off');
    expect(lines()[0]).not.toHaveProperty('was');
    expect(lines()[0]).not.toHaveProperty('fed');
    await click(byText('.gear-toast button', 'Undo'));
    expect(pool(caren.id)).toEqual(['p0', 'p1', 'p2']);
    expect(pool(rin.id) ?? []).toEqual([]);
    expect(stored('gear').worn[caren.id].helmet).toBe('p1');
    expect(lines()).toEqual([l1]);
  });

  it('P0 not in the pool (feed / none): nothing extra is removed; a fed reserve already back is not doubled', async () => {
    const l1 = { ...L1, fed: [{ hero: rin.id, snap: R }] };
    await mount({ slot: 'helmet', grade: 'unique' }, BIG, { gear: { ...gear(['p1', 'p2']), pools: { [caren.id]: ['p1', 'p2'], [rin.id]: ['p5'] } }, ingame: { v: 1, lines: [l1] }, roster: [caren.id] });
    await click($('.vc-equip'));
    expect(pool(caren.id)).toContain('p2');
    expect(pool(caren.id)).not.toContain('p1');
    expect(pool(rin.id)).toEqual(['p5']);
    await click(byText('.gear-toast button', 'Undo'));
    expect(pool(rin.id)).toEqual(['p5']);
    expect(lines()).toEqual([l1]);
  });
});

// HISTORY.md 0230 addendum: the same piece entered again while its promise is live — the guard, no button on the card
describe('the same-piece guard for a promised piece', () => {
  const rin = D.chars.find((c) => c.name === 'Rin')!;
  const worn = { ...GEAR, worn: { [caren.id]: { helmet: 'p1' } } };
  const live = { id: `${caren.id}:helmet:p1`, hero: caren.id, slot: 'helmet', piece: 'p1', snap: P1 };
  const SAME = { setId: speed, subs: P1.lit };
  const note = () => $('.vcard')?.textContent ?? document.body.textContent ?? '';

  it('promised: the card says so and has no «Надеть»; «Это другой» brings the offers back', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, SAME, { gear: worn, ingame: { v: 1, lines: [live] }, roster: [caren.id, rin.id] });
    expect(note()).toContain('promised to Caren in "Equip in game". If it is — do nothing.');
    expect($('.vc-equip')).toBeNull();
    await click($('.vc-twin'));
    expect(document.body.textContent).not.toContain('promised to Caren');
    expect($('.vc-equip')).not.toBeNull();
  });

  it('worn by hand (no line): a new piece as before', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, SAME, { gear: worn, roster: [caren.id, rin.id] });
    expect(document.body.textContent).not.toContain('Looks like');
    expect($('.vc-twin')).toBeNull();
    expect($('.vc-equip')).not.toBeNull();
  });
});

describe('message priority (F3)', () => {
  it('«Надеть», then a tick while its message is up: N6 shows over it, its «Вернуть» restores the line', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 2056 });
    try {
      await mount({ slot: 'helmet', grade: 'unique' }, NEW);
      await click($('.v-equip'));
      expect(lines()).toHaveLength(1);
      expect($$('.gear-toast')).toHaveLength(1);
      await click($('.ig-body .bstep-l'));
      expect(lines()).toHaveLength(0);
      const toast = $$('.gear-toast');
      expect(toast).toHaveLength(1);
      expect(toast[0].textContent).toContain('Caren');
      await click(byText('.gear-toast button', 'Undo'));
      expect(lines()).toHaveLength(1);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    }
  });
});

describe('read', () => {
  it('a dead line (the record no longer worn there) and a malformed one are dropped on read and written back', async () => {
    const worn = { ...GEAR, worn: { [caren.id]: { helmet: 'p1' } } };
    const live = { id: `${caren.id}:helmet:p1`, hero: caren.id, slot: 'helmet', piece: 'p1', snap: P1, off: 'lock' };
    const dead = { ...live, id: 'dead', slot: 'gloves', piece: 'p9', snap: { ...P1, id: 'p9', slot: 'gloves' } };
    await mount({ slot: 'helmet', grade: 'unique' }, {}, { gear: worn, ingame: { v: 1, lines: [dead, { junk: true }, live] } });
    expect(stored('ingame')).toEqual({ v: 1, lines: [live] });
  });

  it('a value that isn\'t the list — cleared', async () => {
    await mount({ slot: 'helmet', grade: 'unique' }, {}, { ingame: 'oops' });
    expect(stored('ingame')).toBeNull();
  });
});
