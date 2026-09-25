import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { maxSubs } from '../src/logic/subs';
import { fromPersisted, reducer, toPersisted, type Action, type AppState } from '../src/state/appState';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const fresh = (patch: Partial<AppState> = {}): AppState => ({ ...fromPersisted(null, idx), ...patch });
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const subsOf = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, 1]));

describe('maxSubs', () => {
  it('у Legendary четыре сабстата, у Epic — три', () => {
    expect(maxSubs('unique')).toBe(4);
    expect(maxSubs('rare')).toBe(3);
  });
});

describe('reducer: сабстаты', () => {
  it('Legendary принимает четвёртый сабстат, пятый — нет', () => {
    const s = run(fresh({ grade: 'unique' }), ...['SPD', 'ATK%', 'CHC', 'CHD', 'HP%'].map((key): Action => ({ type: 'sub', key })));
    expect(Object.keys(s.subs)).toEqual(['SPD', 'ATK%', 'CHC', 'CHD']);
  });

  it('Epic не принимает четвёртый сабстат', () => {
    const three = run(fresh({ grade: 'rare' }), ...['SPD', 'ATK%', 'CHC'].map((key): Action => ({ type: 'sub', key })));
    expect(reducer(three, { type: 'sub', key: 'CHD' })).toBe(three);
  });

  it('отмеченный стат получает 1 жёлтый сегмент, повторное нажатие снимает его', () => {
    const on = reducer(fresh(), { type: 'sub', key: 'SPD' });
    expect(on.subs).toEqual({ SPD: 1 });
    expect(reducer(on, { type: 'sub', key: 'SPD' }).subs).toEqual({});
  });

  it('жёлтые сегменты ставятся только отмеченному стату', () => {
    const s = fresh({ subs: subsOf('SPD') });
    expect(reducer(s, { type: 'roll', key: 'SPD', n: 3 }).subs).toEqual({ SPD: 3 });
    expect(reducer(s, { type: 'roll', key: 'CHC', n: 3 })).toBe(s);
  });

  it('выбранный main stat снимает такой же сабстат', () => {
    const s = reducer(fresh({ slot: 'weapon', grade: 'rare', subs: subsOf('ATK%', 'SPD') }), { type: 'main', main: 'ATK%' });
    expect(s.main).toBe('ATK%');
    expect(Object.keys(s.subs)).toEqual(['SPD']);
  });
});

describe('reducer: смена грейда', () => {
  it('Legendary → Epic с четырьмя сабстатами отбрасывает последний отмеченный', () => {
    const s = reducer(fresh({ grade: 'unique', subs: { SPD: 2, 'ATK%': 1, CHC: 3, CHD: 1 } }), { type: 'grade', grade: 'rare' });
    expect(s.subs).toEqual({ SPD: 2, 'ATK%': 1, CHC: 3 });
  });

  it('сабстаты, которые помещаются, сохраняются', () => {
    const subs = subsOf('SPD', 'CHC');
    expect(reducer(fresh({ grade: 'unique', subs }), { type: 'grade', grade: 'rare' }).subs).toBe(subs);
    expect(reducer(fresh({ grade: 'rare', subs }), { type: 'grade', grade: 'unique' }).subs).toBe(subs);
  });

  it('у оружия смена грейда сбрасывает предмет и main, у брони — сет остаётся', () => {
    const gear = reducer(fresh({ slot: 'weapon', grade: 'unique', itemKey: 'x', main: 'ATK%' }), { type: 'grade', grade: 'rare' });
    expect([gear.itemKey, gear.main]).toEqual([null, null]);
    expect(reducer(fresh({ slot: 'gloves', setId: '13' }), { type: 'grade', grade: 'rare' }).setId).toBe('13');
  });
});

describe('reducer: слот и «Далее»', () => {
  it('нажатие на выбранный слот ничего не меняет', () => {
    const s = fresh({ slot: 'gloves', setId: '13' });
    expect(reducer(s, { type: 'slot', slot: 'gloves' })).toBe(s);
  });

  it('другой слот и «Далее» сбрасывают предмет', () => {
    const s = fresh({ slot: 'gloves', setId: '13', subs: subsOf('SPD'), expand: { x: true } });
    for (const next of [reducer(s, { type: 'slot', slot: 'shoes' }), reducer(s, { type: 'next' })]) {
      expect([next.setId, next.subs, next.expand]).toEqual([null, {}, {}]);
    }
  });
});

describe('сохранение в localStorage', () => {
  it('тот же набор из 14 полей, что у прежней страницы', () => {
    expect(Object.keys(toPersisted(fresh())).sort()).toEqual(
      ['cAll', 'cOwned', 'ccl', 'cel', 'charId', 'fodder', 'grade', 'lv120', 'quirks', 'rosterOnly', 'settingsOpen', 'slot', 'stage', 'tab'].sort());
  });

  it('сохранённое состояние восстанавливается без потерь', () => {
    const s = fresh({ tab: 'chars', slot: 'shoes', grade: 'rare', settingsOpen: true, charId: D.chars[0].id, ccl: 'mage', cAll: true,
      settings: { rosterOnly: false, fodder: true, stage: 'end', lv120: true, quirks: false } });
    expect(toPersisted(fromPersisted(JSON.parse(JSON.stringify(toPersisted(s))), idx))).toEqual(toPersisted(s));
  });

  it('битые и незнакомые значения заменяются значениями по умолчанию', () => {
    const s = fromPersisted({ slot: 'bogus', grade: 'mythic', tab: 'x', stage: 'late', charId: 'nobody', rosterOnly: 'yes' } as never, idx);
    expect([s.slot, s.grade, s.tab, s.settings.stage, s.charId, s.settings.rosterOnly]).toEqual(['gloves', 'unique', 'eval', 'grow', null, true]);
  });
});
