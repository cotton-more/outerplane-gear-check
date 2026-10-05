// @vitest-environment jsdom
// «Надето», шаг 7: плашка «Выбрал билды…», шторка «Билды героев» («Всё верно»), шторка «Билд для X» (строки частей связки;
// открывается «Speed ▾» в плане обмена), вешалка у вкладки билда → «Переодеть» → «Надеть все» → «Вернуть». Данные — только из test/fixtures, не владельца. Логика — test/worn/wearing.test.ts,
// test/worn/aim.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { buildKey } from '@/features/gear/model/gear';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const delta = D.chars.find((c) => c.name === 'Heatwave Cop Delta')!;
const caren = D.chars.find((c) => c.name === 'Caren')!;
const PEN4 = `${buildKey(delta.id, 'DPS')}#11x4`;
const SUPPORT = buildKey(delta.id, 'Priority Support/PvP');
let root: Root | null = null;

type Pc = Record<string, unknown>;
let n = 0;
const lit = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };
const P = (slot: string, short: string): Pc => ({ id: 'q' + ++n, slot, grade: 'unique', setId: set(short), itemKey: null, main: null, yellow: lit, lit, bt: null, at: '' });
const ARMOR = ['helmet', 'armor', 'gloves', 'shoes'];
const armorOf = (short: string) => ARMOR.map((slot) => P(slot, short));
const G = (pieces: Pc[], pools: Record<string, string[]>, o: Pc = {}) =>
  ({ v: 2, seq: 999, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...o });
const wornOf = (ps: Pc[]) => Object.fromEntries(ps.map((p) => [p.slot, p.id]));

// Delta носит Speed ×4, в вещах лежат ещё четыре Penetration; aim — ключ или не записан
function deltaGear(aim: boolean) {
  const speed = armorOf('Speed'), pen = armorOf('Penetration');
  const gear = G([...speed, ...pen], { [delta.id]: [...speed, ...pen].map((p) => p.id as string) }, { worn: { [delta.id]: wornOf(speed) }, ...(aim ? { aim: { [delta.id]: SUPPORT } } : {}) });
  return { gear, speed, pen };
}

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

async function mount(extra: Record<string, unknown>, state: Record<string, unknown> = {}) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster: [delta.id], state: { tab: 'chars', charId: delta.id, ...state }, item: {}, ...extra };
  for (const [k, v] of Object.entries(saved)) localStorage.setItem('ogc.' + k, JSON.stringify(v));
  await render();
}
async function render() {
  const { App } = await import('@/app/App');
  const { IndexContext } = await import('@/game/data/IndexContext');
  const { createIndex } = await import('@/game/data');
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  await act(async () => root!.render(createElement(IndexContext.Provider, { value: createIndex(D) }, createElement(App))));
}
const unmount = async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ''; };
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const click = async (el: HTMLElement | null | undefined) => { if (!el) throw new Error('нет элемента'); await act(async () => el.click()); };
const byText = (sel: string, text: string) => $$(sel).find((e) => e.textContent?.includes(text));
const stored = () => JSON.parse(localStorage.getItem('ogc.gear') ?? 'null');
const note = () => $('#aimsnote')?.textContent ?? '';

describe('плашка «Выбрал билды…»', () => {
  it('есть герой без выбранного билда — плашка с числом героев и «Проверить»', async () => {
    await mount({ gear: deltaGear(false).gear });
    expect(note()).toContain('Picked builds from your pieces for 1 hero — please check.');
    expect(byText('#aimsnote button', 'Check')).toBeTruthy();
  });

  it('загрузка ничего не пишет в ogc.gear', async () => {
    const { gear } = deltaGear(false);
    localStorage.setItem('ogc.gear', JSON.stringify(gear));
    const before = JSON.stringify(gear);
    await mount({ gear });
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });

  it('билд выбран у всех — плашки нет', async () => {
    await mount({ gear: deltaGear(true).gear });
    expect(note()).toBe('');
  });

  it('✕ скрывает плашку и после перезагрузки её нет; вещи не тронуты', async () => {
    const { gear } = deltaGear(false);
    await mount({ gear });
    await click($('#aimsnote .notice-x'));
    expect(note()).toBe('');
    await unmount();
    await render();
    expect(note()).toBe('');
    expect(stored().aim).toBeUndefined();
  });
});

describe('«Билды героев»', () => {
  const open = async (gear: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    await mount({ gear, ...extra });
    await click(byText('#aimsnote button', 'Check'));
  };

  const reason = async (c: { id: string }, piece: Pc) => {
    await open(G([piece], { [c.id]: [piece.id as string] }), { roster: [c.id], state: { tab: 'chars', charId: c.id } });
    return $('[role="dialog"] .tlist li .tl-t')?.textContent;
  };
  const alice = D.chars.find((c) => c.name === 'Alice')!;

  it('единственный билд героя — причина «only build»', async () => {
    expect(await reason(alice, P('helmet', 'Speed'))).toBe('AliceSpeed · only build');
  });

  it('у билдов нет вещей — «no build pieces — first»', async () => {
    expect(await reason(caren, P('helmet', 'Attack'))).toBe('CarenSpeed · no build pieces — first');
  });

  it('поровну, но вещи билдов есть — «tie — first», а не «no build pieces»', async () => {
    expect(await reason(caren, P('helmet', 'Speed'))).toBe('CarenSpeed · tie — first');
  });

  it('заголовок шторки и кнопка «▾» с именем героя', async () => {
    await open(deltaGear(false).gear);
    expect($('[role="dialog"]')?.getAttribute('aria-label')).toBe("Heroes' builds");
    expect($('[role="dialog"] .tlist li .btn')?.getAttribute('aria-label')).toBe('Build for Heatwave Cop Delta');
  });

  it('«▾» открывает «Билд для X» поверх списка', async () => {
    await open(deltaGear(false).gear);
    await click($('[role="dialog"] .tlist li .btn'));
    expect($$('[role="dialog"]').map((d) => d.getAttribute('aria-label'))).toEqual(["Heroes' builds", 'Build for Heatwave Cop Delta']);
  });

  it('«Всё верно» записывает билд каждому из списка, плашка исчезает, «Вернуть» убирает запись', async () => {
    await open(deltaGear(false).gear);
    await click(byText('[role="dialog"] button', 'All correct'));

    expect(typeof stored().aim[delta.id]).toBe('string');
    expect(note()).toBe('');
    expect($('[role="dialog"]')).toBeNull();
    expect($('.gear-toast')?.textContent).toContain("Heroes' builds saved");
    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().aim).toBeUndefined();
    expect(note()).toBe(''); // флаг «показано» остаётся: плашка не возвращается
  });
});

describe('шторка «Билд для X»', () => {
  const openSheet = async (aim: boolean) => {
    const g = deltaGear(aim);
    await mount({ gear: g.gear });
    await click(byText('.cd-trade button', 'Trade'));
    await click($('.tline.to .aimb'));
    return g;
  };

  it('«… ▾» в плане обмена открывает шторку с вариантами и строками частей связки', async () => {
    await openSheet(true);
    const sheet = $$('[role="dialog"]').at(-1)!;
    expect(sheet.getAttribute('aria-label')).toBe('Build for Heatwave Cop Delta');
    const rows = [...sheet.querySelectorAll<HTMLElement>('.arow')].map((r) => r.textContent!);
    expect(rows[0]).toContain('current');
    expect(rows[0]).toContain('Speed ×4 · worn 4 of 4');
    expect(rows.find((r) => r.includes('Penetration ×4'))).toContain('Penetration ×4 · 4 of 4 in pieces');
    expect(rows.find((r) => r.includes('Penetration ×4'))).toContain('can re-dress');
    expect(rows.at(-1)).toContain("best by the stat chain from Heatwave Cop Delta's pieces");
  });

  it('нажатие на текущий билд закрывает шторку, ничего не записывая', async () => {
    await openSheet(true);
    const before = localStorage.getItem('ogc.gear');
    await click($('.aimsheet .arow'));
    expect($('.aimsheet')).toBeNull();
    expect(localStorage.getItem('ogc.gear')).toBe(before);
  });
});

// вкладка DPS (лучший вариант — Penetration ×4: все четыре в вещах), «Переодеть в …» под вкладками
const dress = async () => {
  await click(byText('.btabs [role="tab"]', 'DPS'));
  await click($('.cd-dress button'));
};

describe('«Переодеть»', () => {
  it('«Переодеть в …» — только у показанного билда, если герой одет не в него; билд героя обведён', async () => {
    await mount({ gear: deltaGear(true).gear });
    await click(byText('.btabs [role="tab"]', 'Priority Support'));
    expect($('.cd-dress button')).toBeNull();
    expect($('.btabs .bt-aim')?.textContent).toContain('Priority Support');

    await click(byText('.btabs [role="tab"]', 'DPS'));
    expect($('.cd-dress button')?.textContent).toContain('Re-dress for DPS');
  });


  it('другой билд → «Переодеть» → «Надеть все» → надето по раскладке; «Вернуть» — как было', async () => {
    const { speed, pen } = await (async () => {
      const g = deltaGear(true);
      await mount({ gear: g.gear });
      return g;
    })();
    await dress();

    expect(stored().aim[delta.id]).toBe(PEN4);
    expect($('.gear-toast')?.textContent).toContain("Heatwave Cop Delta's build: DPS · Penetration ×4");
    expect($('.redress .rd-title')?.textContent).toContain('Heatwave Cop Delta → ');
    expect($$('.rchip.on').map((x) => x.textContent)).toEqual(['turns on: Penetration ×4']);
    expect($$('.rchip.off').map((x) => x.textContent)).toEqual(['turns off: Speed ×4']);

    await click(byText('.redress .btn.primary', 'Wear all 4'));
    expect(stored().worn[delta.id]).toEqual(wornOf(pen));
    expect($('.gear-toast')?.textContent).toContain('Now worn by Heatwave Cop Delta: 4 pieces');
    expect($('.redress .rd-row .btn')).toBeNull(); // надевать больше нечего

    await click(byText('.gear-toast button', 'Undo'));
    expect(stored().worn[delta.id]).toEqual(wornOf(speed));
  });

  it('«Надеть» у одной вещи — только она, тост «Надето на …: слот»', async () => {
    const g = deltaGear(true);
    await mount({ gear: g.gear });
    await dress();
    await click($('.redress .rd-row .btn'));

    expect(Object.values(stored().worn[delta.id]).filter((id) => g.pen.some((p) => p.id === id))).toHaveLength(1);
    expect($('.gear-toast')?.textContent).toContain('Now worn by Heatwave Cop Delta: ');
  });

  it('«← имя» возвращает на карточку героя', async () => {
    await mount({ gear: deltaGear(true).gear });
    await dress();
    await click($('.rd-top button'));
    expect($('.redress')).toBeNull();
    expect($('.btabs')).toBeTruthy();
  });
});
