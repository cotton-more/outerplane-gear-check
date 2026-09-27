// Свои значки вместо картинок из игры (src/icons/own.ts): у всего, что страница показывает, есть свой значок,
// а %-версия стата помечена «%» — DEF щит, DEF% щит с %.
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatGrid } from '../src/components/eval/StatGrid';
import { GameIconsContext } from '../src/components/Img';
import { IndexContext } from '../src/components/IndexContext';
import { MAIN_GRID, SLOTS, createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { CLASS_ICON, ELEMENT_ICON, SET_ICON, SLOT_ICON, statIcon } from '../src/icons/own';
import { TABLER } from '../src/icons/tabler';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);

describe('значки статов', () => {
  it('flat и % одного параметра — один контур, у %-версии «%»', () => {
    expect([statIcon('DEF'), statIcon('DEF%')]).toEqual([{ name: 'shield', badge: undefined }, { name: 'shield', badge: '%' }]);
    expect([statIcon('ATK'), statIcon('ATK%')]).toEqual([{ name: 'sword', badge: undefined }, { name: 'sword', badge: '%' }]);
    expect([statIcon('HP'), statIcon('HP%')]).toEqual([{ name: 'heart', badge: undefined }, { name: 'heart', badge: '%' }]);
  });

  it('сабстат EFF — это EFF%, с «%»; main EFF — flat, без «%»; так же RES', () => {
    expect([statIcon('EFF'), statIcon('EFF', true)]).toEqual([{ name: 'eye', badge: '%' }, { name: 'eye', badge: undefined }]);
    expect([statIcon('RES'), statIcon('RES', true)]).toEqual([{ name: 'umbrella', badge: '%' }, { name: 'umbrella', badge: undefined }]);
  });

  it('у статов без flat-пары «%» нет, у CD↓% — «↓»', () => {
    expect([statIcon('DMG UP%')?.badge, statIcon('PEN%', true)?.badge, statIcon('CDMG RED%', true)]).toEqual([undefined, undefined, { name: 'sparkles', badge: '↓' }]);
  });

  it('свой значок есть у каждого сабстата и у каждого main аксессуара', () => {
    expect(D.substats.filter((s) => !statIcon(s.key)).map((s) => s.key)).toEqual([]);
    expect(MAIN_GRID.filter((k) => !statIcon(k, true))).toEqual([]);
  });
});

describe('значки слотов, сетов, стихий и классов', () => {
  it('у каждого слота, сета, стихии и класса из данных — свой значок, и такой контур скачан', () => {
    expect(SLOTS.filter((s) => !TABLER[SLOT_ICON[s.id]]).map((s) => s.id)).toEqual([]);
    expect(D.sets.filter((s) => !SET_ICON[s.short]).map((s) => s.short)).toEqual([]);
    expect(Object.keys(D.elements).filter((k) => !ELEMENT_ICON[k])).toEqual([]);
    expect(Object.keys(D.classes).filter((k) => !CLASS_ICON[k])).toEqual([]);
    const used = [...Object.values(SLOT_ICON), ...Object.values(SET_ICON), ...Object.values(ELEMENT_ICON), ...Object.values(CLASS_ICON)];
    expect(used.filter((n) => !TABLER[n])).toEqual([]);
  });
});

describe('переключатель «свои · из игры»', () => {
  const grid = (game: boolean) => renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx },
    createElement(GameIconsContext.Provider, { value: game }, createElement(StatGrid, {
      subs: {}, main: null, blocked: new Set<string>(), full: false, useful: null, mains: null, onPick: () => {}, onMain: () => {},
    }))));

  it('свои — контуры в самой странице, без картинок из игры; из игры — картинки (или заглушки, если их нет в данных)', () => {
    const own = grid(false);
    expect(own).toContain('<span class="ico" aria-hidden="true"><svg');
    expect(own).not.toMatch(/<img|noimg/);
    expect(grid(true)).toMatch(/<img|noimg/);
    expect(grid(true)).not.toContain('class="ico"');
  });

  it('DEF% в сетке — щит с «%», DEF — щит без него', () => {
    const cells = grid(false).split('<button').slice(1);
    const cell = (label: string) => cells.find((c) => c.includes(`<span>${label}</span>`))!;
    expect(cell('DEF%')).toContain('<span class="ico-b">%</span>');
    expect(cell('DEF')).not.toContain('ico-b');
  });
});
