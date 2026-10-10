// @vitest-environment jsdom
// Шапка карточки персонажа на живой странице 360px: стихия и класс — значками на портрете, подкласс текстом, звезда
// ростера у имени, ссылка на outerpedia; строка own-row — только у героя, которого заменил Core Fusion.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Dataset } from '@/game/data/types';
import { TIPS } from '@/tour/registry';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const DONE = { v: 1, first: 'done', invited: true, seen: {}, known: Object.fromEntries(TIPS.map((tp) => [tp.id, tp.rev])), tips: false };
const caren = D.chars.find((c) => c.name === 'Caren')!;
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

async function mountCard(charId: string, roster: string[]) {
  const saved = { lang: 'en', welcomeHidden: true, tour: DONE, roster, state: { tab: 'chars', charId }, item: {} };
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

describe('шапка карточки персонажа', () => {
  it('ссылка outerpedia — страница персонажа по slug, в новой вкладке, без доступа к окну приложения', async () => {
    // Arrange
    await mountCard(caren.id, [caren.id]);

    // Act
    const a = $('.cd-head a.cd-opedia') as HTMLAnchorElement | null;

    // Assert
    expect({ href: a?.getAttribute('href'), target: a?.target, noopener: a?.rel.split(' ').includes('noopener'), text: a?.textContent })
      .toEqual({ href: `https://outerpedia.com/characters/${caren.slug}`, target: '_blank', noopener: true, text: 'outerpedia ↗' });
  });

  it('строка под именем — подкласс и роль, без названия класса и стихии', async () => {
    // Arrange
    await mountCard(caren.id, [caren.id]);

    // Act
    const meta = $('.cd-head .meta')?.textContent;

    // Assert
    expect(meta).toBe('Bruiser · DPS');
  });

  it('класс в цвете стихии — один значок на портрете, подписан для экранного диктора', async () => {
    // Arrange
    await mountCard(caren.id, [caren.id]);

    // Act
    const labels = $$('.cd-face .cd-badge').map((b) => [b.getAttribute('role'), b.getAttribute('aria-label')]);

    // Assert
    expect(labels).toEqual([['img', 'Striker · Water']]);
  });

  it('оценки PvE и PvP и прозвище — в нижней строке шапки', async () => {
    // Arrange
    await mountCard(caren.id, [caren.id]);

    // Act
    const foot = { tiers: $$('.cd-foot .tier').map((x) => x.textContent), nick: $('.cd-foot .cd-nick')?.textContent };

    // Assert
    expect(foot).toEqual({ tiers: ['PvEA', 'PvPA'], nick: 'The Memorizer' });
  });

  it('герой без Core Fusion — строки own-row нет', async () => {
    // Arrange
    await mountCard(caren.id, [caren.id]);

    // Act
    const row = $('.own-row');

    // Assert
    expect(row).toBeNull();
  });

  it('звезда у имени: героя без вещей добавляет в ростер сразу, без окна', async () => {
    // Arrange
    await mountCard(caren.id, []);
    const star = $('.cd-name .cd-star')!;

    // Act
    await act(async () => star.click());

    // Assert
    expect({ pressed: star.getAttribute('aria-pressed'), text: star.textContent, roster: JSON.parse(localStorage.getItem('ogc.roster')!), ask: $('.roster-ask, .fusion-ask') })
      .toEqual({ pressed: 'true', text: '★', roster: [caren.id], ask: null });
  });
});
