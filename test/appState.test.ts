import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '../src/data';
import type { Dataset } from '../src/data/types';
import { maxSubs } from '../src/logic/subs';
import { fromPersisted, reducer, restoreItem, toPersisted, toPersistedItem, type Action, type AppState } from '../src/state/appState';

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

  it('замена стата сохраняет его строку и жёлтые сегменты', () => {
    const s = fresh({ subs: { SPD: 2, CHC: 3, CHD: 1 } });
    const next = reducer(s, { type: 'replaceSub', from: 'CHC', to: 'ATK%' });
    expect(Object.entries(next.subs)).toEqual([['SPD', 2], ['ATK%', 3], ['CHD', 1]]);
    expect(reducer(s, { type: 'replaceSub', from: 'CHC', to: 'SPD' })).toBe(s); // уже отмечен
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

  it('отброшенный четвёртый можно отметить в другой строке, а у Legendary четвёртая строка вернётся пустой', () => {
    const s = run(fresh({ grade: 'unique', subs: { SPD: 2, CHC: 1, CHD: 3, 'ATK%': 1 } }),
      { type: 'grade', grade: 'rare' }, { type: 'replaceSub', from: 'CHC', to: 'ATK%' }, { type: 'grade', grade: 'unique' });
    expect(Object.entries(s.subs)).toEqual([['SPD', 2], ['ATK%', 1], ['CHD', 3]]);
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

describe('reducer: слот и «Сброс»', () => {
  it('нажатие на выбранный слот ничего не меняет', () => {
    const s = fresh({ slot: 'gloves', setId: '13' });
    expect(reducer(s, { type: 'slot', slot: 'gloves' })).toBe(s);
  });

  it('другой слот брони сбрасывает сабстаты, но оставляет сет', () => {
    const s = fresh({ slot: 'gloves', setId: '13', subs: subsOf('SPD'), expand: { x: true } });
    const next = reducer(s, { type: 'slot', slot: 'shoes' });
    expect([next.setId, next.subs, next.expand]).toEqual(['13', {}, {}]);
  });

  it('оружие и аксессуар сет не наследуют: вернувшись к броне, его выбирают заново', () => {
    const s = fresh({ slot: 'gloves', setId: '13' });
    expect(reducer(s, { type: 'slot', slot: 'weapon' }).setId).toBeNull();
    expect(run(s, { type: 'slot', slot: 'accessory' }, { type: 'slot', slot: 'helmet' }).setId).toBeNull();
  });

  it('«Сброс» очищает предмет вместе с сетом', () => {
    const next = reducer(fresh({ slot: 'gloves', setId: '13', subs: subsOf('SPD'), expand: { x: true } }), { type: 'reset' });
    expect([next.setId, next.subs, next.expand]).toEqual([null, {}, {}]);
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

  it('новичку фоддер включён, сохранённый выбор не трогаем', () => {
    expect(fromPersisted(null, idx).settings.fodder).toBe(true);
    expect(fromPersisted({ fodder: false }, idx).settings.fodder).toBe(false);
  });
});

describe('недовведённый предмет переживает перезапуск', () => {
  const weapon = D.weapons.find((i) => i.star === 6 && i.grade === 'unique' && i.mains.length)!;

  it('броня: сет и сабстаты восстанавливаются как были', () => {
    const s = fresh({ slot: 'gloves', grade: 'unique', setId: '13', subs: { SPD: 2, CHC: 1 } });
    const back = restoreItem(fresh({ slot: 'gloves', grade: 'unique' }), JSON.parse(JSON.stringify(toPersistedItem(s))), idx);
    expect(toPersistedItem(back)).toEqual(toPersistedItem(s));
  });

  it('Legendary оружие: предмет и main восстанавливаются', () => {
    const s = fresh({ slot: 'weapon', grade: 'unique', itemKey: weapon.key, main: weapon.mains[0], subs: { SPD: 1 } });
    const back = restoreItem(fresh({ slot: 'weapon', grade: 'unique' }), toPersistedItem(s), idx);
    expect([back.itemKey, back.main, back.subs]).toEqual([weapon.key, weapon.mains[0], { SPD: 1 }]);
  });

  it('то, что не сходится с данными, слотом и грейдом, отбрасывается', () => {
    const saved = { setId: 'nope', itemKey: weapon.key, main: 'ATK%', unlisted: true, subs: { SPD: 2, FOO: 1, CHC: 9, CHD: 1, 'HP%': 1, 'DEF%': 1 } };
    const armor = restoreItem(fresh({ slot: 'gloves', grade: 'rare' }), saved, idx);
    // у брони нет предмета и main; неизвестный стат и 9 жёлтых выброшены; у Epic не больше 3 сабстатов
    expect([armor.setId, armor.itemKey, armor.main, armor.unlisted, armor.subs]).toEqual([null, null, null, false, { SPD: 2, CHD: 1, 'HP%': 1 }]);
  });

  it('main stat не остаётся среди сабстатов', () => {
    const epic = restoreItem(fresh({ slot: 'weapon', grade: 'rare' }), { main: 'ATK%', subs: { 'ATK%': 1, SPD: 1 } }, idx);
    expect([epic.main, epic.subs]).toEqual(['ATK%', { SPD: 1 }]);
  });

  it('«Сброс» очищает сохранённый предмет', () => {
    const s = reducer(fresh({ setId: '13', subs: { SPD: 1 } }), { type: 'reset' });
    expect(toPersistedItem(s)).toEqual({ setId: null, itemKey: null, main: null, unlisted: false, subs: {} });
  });

  it('мусор в хранилище не роняет запуск', () => {
    for (const junk of [null, 'x', 42, [], { subs: 'x' }]) expect(restoreItem(fresh(), junk, idx).subs).toEqual({});
  });
});
