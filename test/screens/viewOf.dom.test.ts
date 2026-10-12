// @vitest-environment jsdom
// «Надеть на / оценить для» Core Fusion X при X со ★: вид пула героя (useVerdictModel viewOf) — на хранилище после перехода, и ★ X
// там уже у Core Fusion, так что и крит Core Fusion считается с ними (ctx.stars профиля), как после «Да».
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeCtx, NO_STARS } from '@/game/context';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { en } from '@/i18n/en';
import type { FormState } from '@/features/eval/form/formState';
import { EMPTY_GEAR, type GearStore } from '@/features/gear/model/gear';
import { poolView } from '@/features/gear/pool';
import { useVerdictModel } from '@/screens/eval/useVerdictModel';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const lisha = D.chars.find((c) => c.name === 'Lisha')!.id;
const cfLisha = D.chars.find((c) => c.name === 'Core Fusion Lisha')!.id;
const settings = { rosterOnly: false, stage: 'grow' as const, lv120: false, quirks: true };
const form: FormState = { slot: 'helmet', grade: 'unique', setId: null, itemKey: null, main: null, unlisted: false, subs: {}, t4: false, expand: {}, settings, settingsOpen: false };
let root: Root | null = null;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { await act(async () => root?.unmount()); root = null; document.body.innerHTML = ''; });

// the hook's viewOf for a store and roster, the way App wires it (ctx and view from the real store)
async function viewOf(store: GearStore, roster: string[]) {
  const ros = new Set(roster);
  const ctx = makeCtx(idx, settings, ros, en, new Map(), store.stars ?? NO_STARS);
  const view = poolView(ctx, store);
  let get!: ReturnType<typeof useVerdictModel>['viewOf'];
  const Probe = () => {
    get = useVerdictModel({ idx, t: en, ctx, s: form, store, roster: ros, view, hero: null, replace: null, touring: false, narrow: false, onEval: true }).viewOf;
    return null;
  };
  root = createRoot(document.body.appendChild(document.createElement('div')));
  await act(async () => root!.render(createElement(Probe)));
  return get;
}

describe('viewOf: ★ X идут к Core Fusion вместе с переходом', () => {
  it('X в ростере со ★5 — вид Core Fusion считает её крит с ★5', async () => {
    const store: GearStore = { ...EMPTY_GEAR, stars: { [lisha]: 5 } };
    const of = await viewOf(store, [lisha]);
    expect(of(cfLisha).hero(cfLisha)!.P.ctx.stars).toEqual({ [cfLisha]: 5 });
  });

  it('★ нет у X — окно перехода ★ не двигает: ctx.stars общий', async () => {
    const store: GearStore = { ...EMPTY_GEAR, stars: { [cfLisha]: 4 } };
    const of = await viewOf(store, [lisha]);
    expect(of(cfLisha).hero(cfLisha)!.P.ctx.stars).toEqual({ [cfLisha]: 4 });
  });
});
