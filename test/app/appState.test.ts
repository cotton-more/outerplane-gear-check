import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SubPicker } from '@/features/eval/form/SubPicker';
import { IndexContext } from '@/game/data/IndexContext';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { MAX_SUBS, dropSubs } from '@/game/item/subs';
import { fromPersisted, reducer, toPersisted, type Action, type AppState } from '@/app/appState';
import { itemInput, restoreItem, toPersistedItem } from '@/features/eval/form/formState';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const fresh = (patch: Partial<AppState> = {}): AppState => ({ ...fromPersisted(null, idx), ...patch });
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reducer, s);
const subsOf = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, 1]));

describe('число сабстатов', () => {
  it('из дропа у Legendary четыре сабстата, у Epic — три; ввести можно до четырёх у обоих', () => {
    expect([dropSubs('unique'), dropSubs('rare'), MAX_SUBS]).toEqual([4, 3, 4]);
  });
});

describe('reducer: сабстаты', () => {
  it('Legendary принимает четвёртый сабстат, пятый — нет', () => {
    const s = run(fresh({ grade: 'unique' }), ...['SPD', 'ATK%', 'CHC', 'CHD', 'HP%'].map((key): Action => ({ type: 'sub', key })));
    expect(Object.keys(s.subs)).toEqual(['SPD', 'ATK%', 'CHC', 'CHD']);
  });

  it('Epic принимает четвёртый сабстат (его добавляет первый Reforge), пятый — нет', () => {
    const s = run(fresh({ grade: 'rare' }), ...['SPD', 'ATK%', 'CHC', 'CHD', 'HP%'].map((key): Action => ({ type: 'sub', key })));
    expect(Object.keys(s.subs)).toEqual(['SPD', 'ATK%', 'CHC', 'CHD']);
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
    expect(reducer(s, { type: 'replaceSub', from: 'CHC', to: 'CHC' })).toBe(s);
  });

  it('стат из другой строки переезжает в заменяемую, а его прежняя строка освобождается', () => {
    // вещь вводят поверх прошлой: у новой первым идёт RES%, а у прошлой он стоял третьим
    const s = fresh({ subs: { HP: 2, CHC: 1, RES: 3 } });
    expect(Object.entries(reducer(s, { type: 'replaceSub', from: 'HP', to: 'RES' }).subs)).toEqual([['RES', 2], ['CHC', 1]]);
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

describe('reducer: уровень сабстата 1–6 (шаг 3)', () => {
  const roll = (n: number): Action => ({ type: 'roll', key: 'SPD', n });

  it('уровни 5 и 6 принимаются — вещь после Reforge вводят всеми сегментами', () => {
    const s = fresh({ subs: { SPD: 4 } });
    expect([reducer(s, roll(5)).subs, reducer(s, roll(6)).subs]).toEqual([{ SPD: 5 }, { SPD: 6 }]);
  });

  it('7, 0 и дробное — без изменений', () => {
    const s = fresh({ subs: { SPD: 4 } });
    for (const n of [7, 0, -1, 2.5]) expect(reducer(s, roll(n))).toBe(s);
  });
});

describe('reducer: предел суммы уровней (Legendary 22, Epic 17)', () => {
  const roll = (key: string, n: number): Action => ({ type: 'roll', key, n });

  it('Legendary 6/6/5/5 → 6/6/6/5 (23) — не срабатывает', () => {
    const s = fresh({ grade: 'unique', subs: { SPD: 6, CHC: 6, CHD: 5, 'ATK%': 5 } });
    expect(reducer(s, roll('CHD', 6))).toBe(s);
  });

  it('Legendary 6/6/5/4 → 6/6/5/5 (22) — срабатывает', () => {
    const s = fresh({ grade: 'unique', subs: { SPD: 6, CHC: 6, CHD: 5, 'ATK%': 4 } });
    expect(reducer(s, roll('ATK%', 5)).subs).toEqual({ SPD: 6, CHC: 6, CHD: 5, 'ATK%': 5 });
  });

  it('Epic — по 17: 6/6/4 → 6/6/5 да, 6/6/5 → 6/6/6 нет', () => {
    const s = fresh({ grade: 'rare', subs: { SPD: 6, CHC: 6, CHD: 4 } });
    const at17 = reducer(s, roll('CHD', 5));
    expect(at17.subs).toEqual({ SPD: 6, CHC: 6, CHD: 5 });
    expect(reducer(at17, roll('CHD', 6))).toBe(at17);
  });

  it('новый сабстат (+1) сверх предела — не срабатывает, в пределе — да', () => {
    const full = fresh({ grade: 'rare', subs: { SPD: 6, CHC: 6, CHD: 5 } });
    expect(reducer(full, { type: 'sub', key: 'HP%' })).toBe(full);
    const room = fresh({ grade: 'rare', subs: { SPD: 6, CHC: 6, CHD: 4 } });
    expect(reducer(room, { type: 'sub', key: 'HP%' }).subs).toEqual({ SPD: 6, CHC: 6, CHD: 4, 'HP%': 1 });
  });

  it('сумма уже выше предела (старая запись 6/6/6/6) — уменьшение и снятие стата срабатывают, рост — нет', () => {
    const s = fresh({ grade: 'unique', subs: { SPD: 6, CHC: 6, CHD: 6, 'ATK%': 6 } });
    expect(reducer(s, roll('SPD', 5)).subs).toEqual({ SPD: 5, CHC: 6, CHD: 6, 'ATK%': 6 });
    expect(reducer(s, { type: 'sub', key: 'SPD' }).subs).toEqual({ CHC: 6, CHD: 6, 'ATK%': 6 });
    const over = fresh({ grade: 'unique', subs: { SPD: 6, CHC: 6, CHD: 6, 'ATK%': 5 } });
    expect(reducer(over, roll('ATK%', 6))).toBe(over);
  });

  it('Legendary → Epic с суммой выше 17 — сабстаты остаются: смена грейда сумму не растит', () => {
    const subs = { SPD: 6, CHC: 6, CHD: 5, 'ATK%': 5 };
    expect(reducer(fresh({ grade: 'unique', subs }), { type: 'grade', grade: 'rare' }).subs).toBe(subs);
  });
});

describe('reducer: «T4» (Breakthrough брони, В4; у Legendary оружия и аксессуара — вопрос 7 ревью eval-only)', () => {
  const t4 = (patch: Partial<AppState> = {}) => reducer(fresh({ slot: 'helmet', grade: 'unique', setId: '13', subs: { SPD: 2 }, ...patch }), { type: 't4' });

  it('у брони нажатие включает и снимает «T4»', () => {
    const on = t4();
    expect(on.t4).toBe(true);
    expect(reducer(on, { type: 't4' }).t4).toBe(false);
  });

  // было (В4): «T4» только у брони. Вопрос 7 (б): и у оружия, и у аксессуара — для материала такого же предмета
  it.each(['weapon', 'accessory'] as const)('у Legendary %s нажатие включает и снимает «T4»', (slot) => {
    const on = reducer(fresh({ slot, grade: 'unique', itemKey: 'x' }), { type: 't4' });
    expect(on.t4).toBe(true);
    expect(reducer(on, { type: 't4' }).t4).toBe(false);
  });

  // у Epic оружия и аксессуара предмета на форме нет — такую же вещь не найти: «T4» ни на что бы не влияла
  it.each(['weapon', 'accessory'] as const)('у Epic %s не срабатывает', (slot) => {
    const s = fresh({ slot, grade: 'rare', main: 'ATK%' });
    expect(reducer(s, { type: 't4' })).toBe(s);
  });

  it('сбрасывают «Следующий», смена слота, грейда и сета', () => {
    const on = t4();
    expect(reducer(on, { type: 'reset' }).t4).toBe(false);
    expect(reducer(on, { type: 'slot', slot: 'shoes' }).t4).toBe(false);
    expect(reducer(on, { type: 'grade', grade: 'rare' }).t4).toBe(false);
    expect(reducer(on, { type: 'set', setId: '21' }).t4).toBe(false);
    expect(reducer(on, { type: 'set', setId: null }).t4).toBe(false);
  });

  describe('у Legendary оружия и аксессуара', () => {
    const on = (slot: 'weapon' | 'accessory' = 'weapon', patch: Partial<AppState> = {}) =>
      reducer(fresh({ slot, grade: 'unique', itemKey: 'x', main: 'ATK%', subs: { SPD: 2, CHC: 1 }, ...patch }), { type: 't4' });

    it('сбрасывают «Следующий», смена слота и грейда', () => {
      expect([reducer(on(), { type: 'reset' }).t4, reducer(on(), { type: 'slot', slot: 'accessory' }).t4,
        reducer(on(), { type: 'grade', grade: 'rare' }).t4]).toEqual([false, false, false]);
    });

    // другой предмет — другая вещь, как другой сет у брони: такая же для Breakthrough — тот же предмет
    it('другой предмет, «нет в списке» и снятый предмет сбрасывают «T4»; тот же предмет ещё раз — нет', () => {
      expect(reducer(on(), { type: 'item', itemKey: 'y', mains: ['ATK%'] }).t4).toBe(false);
      expect(reducer(on(), { type: 'unlisted' }).t4).toBe(false);
      expect(reducer(on(), { type: 'item', itemKey: null }).t4).toBe(false);
      expect(reducer(on(), { type: 'item', itemKey: 'x', mains: ['ATK%'] }).t4).toBe(true);
      expect(reducer(on('accessory', { itemKey: null, unlisted: true }), { type: 'unlisted' }).t4).toBe(true);
    });

    // main у того же предмета — та же вещь для Breakthrough (материал features/gear/model/material — по предмету, при любом main)
    it('смена main и правка сабстатов «T4» не трогают', () => {
      const after = run(on(), { type: 'main', main: 'HP%' }, { type: 'sub', key: 'CHD' }, { type: 'roll', key: 'SPD', n: 3 },
        { type: 'replaceSub', from: 'CHC', to: 'HP' }, { type: 'clearSubs' });
      expect(after.t4).toBe(true);
    });
  });

  it('тот же слот, грейд или сет ещё раз — «T4» остаётся', () => {
    const on = t4();
    expect(run(on, { type: 'slot', slot: 'helmet' }, { type: 'grade', grade: 'unique' }, { type: 'set', setId: '13' }).t4).toBe(true);
  });

  it('правка сабстатов «T4» не трогает', () => {
    const on = t4({ subs: { SPD: 2, CHC: 1 } });
    const after = run(on, { type: 'sub', key: 'CHD' }, { type: 'roll', key: 'SPD', n: 3 }, { type: 'replaceSub', from: 'CHC', to: 'HP%' },
      { type: 'sub', key: 'CHD' }, { type: 'clearSubs' });
    expect(after.t4).toBe(true);
  });

  it('load — другая вещь: «T4» по её Breakthrough (bt 4), само поле bt в состояние не попадает', () => {
    const item = { slot: 'shoes' as const, grade: 'unique' as const, setId: '13', itemKey: null, main: null, unlisted: false, subs: { SPD: 2 } };
    const on = t4();
    expect(reducer(on, { type: 'load', item }).t4).toBe(false);
    expect(reducer(on, { type: 'load', item: { ...item, bt: 0 } }).t4).toBe(false);
    const t = reducer(fresh(), { type: 'load', item: { ...item, bt: 4 } });
    expect(t.t4).toBe(true);
    expect(t).not.toHaveProperty('bt');
    expect(reducer(fresh(), { type: 'load', item: { ...item, slot: 'weapon', setId: null, itemKey: 'x', bt: 4 } }).t4).toBe(true);
    expect(reducer(fresh(), { type: 'load', item: { ...item, slot: 'weapon', setId: null, itemKey: 'x', bt: 0 } }).t4).toBe(false);
    expect(reducer(fresh(), { type: 'load', item: { ...item, slot: 'accessory', grade: 'rare', setId: null, main: 'CHD', bt: 4 } }).t4).toBe(false);
  });

  it('itemInput: броня и Legendary оружие и аксессуар — bt 4 с «T4», 0 без неё; Epic оружие и аксессуар — без bt', () => {
    expect(itemInput(t4()).bt).toBe(4);
    expect(itemInput(fresh({ slot: 'helmet' })).bt).toBe(0);
    for (const slot of ['weapon', 'accessory'] as const) {
      expect(itemInput(reducer(fresh({ slot, grade: 'unique', itemKey: 'x' }), { type: 't4' })).bt).toBe(4);
      expect(itemInput(fresh({ slot, grade: 'unique' })).bt).toBe(0);
      expect(itemInput(fresh({ slot, grade: 'rare' }))).not.toHaveProperty('bt');
    }
  });

  it('«Вернуть» после «Следующий» (load прежней) возвращает и «T4»', () => {
    const on = t4();
    const back = reducer(reducer(on, { type: 'reset' }), { type: 'load', item: itemInput(on) });
    expect(back.t4).toBe(true);
  });
});

describe('reducer: смена грейда', () => {
  it('Legendary → Epic сохраняет все четыре сабстата: четвёртый у Epic бывает после Reforge', () => {
    const subs = { SPD: 2, 'ATK%': 1, CHC: 3, CHD: 1 };
    expect(reducer(fresh({ grade: 'unique', subs }), { type: 'grade', grade: 'rare' }).subs).toBe(subs);
  });

  it('сабстаты сохраняются при смене грейда в обе стороны', () => {
    const subs = subsOf('SPD', 'CHC');
    expect(reducer(fresh({ grade: 'unique', subs }), { type: 'grade', grade: 'rare' }).subs).toBe(subs);
    expect(reducer(fresh({ grade: 'rare', subs }), { type: 'grade', grade: 'unique' }).subs).toBe(subs);
  });

  it('у оружия смена грейда сбрасывает предмет, main остаётся — он тот же на обоих грейдах; у брони — сет остаётся', () => {
    const gear = reducer(fresh({ slot: 'weapon', grade: 'unique', itemKey: 'x', main: 'ATK%' }), { type: 'grade', grade: 'rare' });
    expect([gear.itemKey, gear.main]).toEqual([null, 'ATK%']);
    expect(reducer(fresh({ slot: 'gloves', setId: '13' }), { type: 'grade', grade: 'rare' }).setId).toBe('13');
  });
});

describe('reducer: слот и «Следующий»', () => {
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

  it('«Следующий» очищает сабстаты, а слот, грейд и сет брони оставляет', () => {
    const next = reducer(fresh({ slot: 'gloves', grade: 'rare', setId: '13', subs: subsOf('SPD'), expand: { x: true } }), { type: 'reset' });
    expect([next.slot, next.grade, next.setId, next.subs, next.expand]).toEqual(['gloves', 'rare', '13', {}, {}]);
  });

  it('main, отмеченный до предмета, остаётся, если у предмета такой бывает; иначе снимается', () => {
    const s = fresh({ slot: 'weapon', grade: 'unique', main: 'DEF%' });
    expect(reducer(s, { type: 'item', itemKey: 'x', mains: ['ATK%', 'DEF%', 'HP%'] }).main).toBe('DEF%');
    expect(reducer(s, { type: 'item', itemKey: 'y', mains: ['HP%'] }).main).toBe(null);
    expect(reducer(s, { type: 'unlisted' }).main).toBe('DEF%');
  });

  it('у оружия и аксессуара «Следующий» очищает предмет и сабстаты, а main оставляет — как фильтр по main в игре', () => {
    const next = reducer(fresh({ slot: 'weapon', grade: 'unique', itemKey: 'x', main: 'ATK%', unlisted: false, subs: subsOf('SPD') }), { type: 'reset' });
    expect([next.slot, next.itemKey, next.main, next.subs]).toEqual(['weapon', null, 'ATK%', {}]);
    const acc = reducer(fresh({ slot: 'accessory', grade: 'rare', main: 'SPD', subs: subsOf('CHC') }), { type: 'reset' });
    expect([acc.main, acc.subs]).toEqual(['SPD', {}]);
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
    // у брони нет предмета и main; неизвестный стат и 9 жёлтых выброшены; сабстатов не больше четырёх
    expect([armor.setId, armor.itemKey, armor.main, armor.unlisted, armor.subs]).toEqual([null, null, null, false, { SPD: 2, CHD: 1, 'HP%': 1, 'DEF%': 1 }]);
  });

  it('main stat не остаётся среди сабстатов', () => {
    const epic = restoreItem(fresh({ slot: 'weapon', grade: 'rare' }), { main: 'ATK%', subs: { 'ATK%': 1, SPD: 1 } }, idx);
    expect([epic.main, epic.subs]).toEqual(['ATK%', { SPD: 1 }]);
  });

  it('«Следующий» очищает сохранённый предмет, кроме сета брони и main', () => {
    const s = reducer(fresh({ slot: 'gloves', setId: '13', subs: { SPD: 1 } }), { type: 'reset' });
    expect(toPersistedItem(s)).toEqual({ setId: '13', itemKey: null, main: null, unlisted: false, subs: {} });
    const w = reducer(fresh({ slot: 'weapon', main: 'HP%', subs: { SPD: 1 } }), { type: 'reset' });
    expect(toPersistedItem(w)).toEqual({ setId: null, itemKey: null, main: 'HP%', unlisted: false, subs: {} });
  });

  it('уровни 5–6 и «T4» брони восстанавливаются', () => {
    const s = run(fresh({ slot: 'gloves', grade: 'unique', setId: '13', subs: { SPD: 6, CHC: 5 } }), { type: 't4' });
    const saved = JSON.parse(JSON.stringify(toPersistedItem(s)));
    expect(saved.t4).toBe(true);
    const back = restoreItem(fresh({ slot: 'gloves', grade: 'unique' }), saved, idx);
    expect([back.subs, back.t4]).toEqual([{ SPD: 6, CHC: 5 }, true]);
  });

  it('«T4» сохраняется только нажатая и только там, где она есть (у Epic оружия и аксессуара её нет)', () => {
    expect(toPersistedItem(fresh({ slot: 'gloves' }))).not.toHaveProperty('t4');
    expect(toPersistedItem(fresh({ slot: 'weapon', grade: 'rare', t4: true }))).not.toHaveProperty('t4');
    expect(restoreItem(fresh({ slot: 'weapon', grade: 'rare' }), { main: 'ATK%', t4: true }, idx).t4).toBe(false);
    expect(restoreItem(fresh({ slot: 'gloves' }), { t4: 'yes' }, idx).t4).toBe(false);
  });

  // вопрос 7 (б): у Legendary оружия «T4» переживает перезапуск, как у брони
  it('Legendary оружие: нажатая «T4» сохраняется и возвращается вместе с предметом', () => {
    const w = D.weapons.find((i) => i.grade === 'unique' && i.star === 6)!;
    const s = reducer(fresh({ slot: 'weapon', grade: 'unique', itemKey: w.key, main: w.mains[0], subs: { SPD: 2 } }), { type: 't4' });
    const saved = JSON.parse(JSON.stringify(toPersistedItem(s)));
    expect(saved.t4).toBe(true);

    const back = restoreItem(fresh({ slot: 'weapon', grade: 'unique' }), saved, idx);

    expect([back.itemKey, back.t4, itemInput(back).bt]).toEqual([w.key, true, 4]);
  });

  it('уровень 7 — битый сабстат: отброшен', () => {
    const back = restoreItem(fresh({ slot: 'gloves', grade: 'unique' }), { subs: { SPD: 7, CHC: 2 } }, idx);
    expect(back.subs).toEqual({ CHC: 2 });
  });

  it('сумма выше 22 — битая запись: сабстаты отброшены целиком (не обрезаны), сет остаётся', () => {
    const back = restoreItem(fresh({ slot: 'gloves', grade: 'unique' }), { setId: '13', subs: { SPD: 6, CHC: 6, CHD: 6, 'ATK%': 5 } }, idx);
    expect([back.setId, back.subs]).toEqual(['13', {}]);
  });

  it('Epic с суммой до 22 (набрана у Legendary, грейд сменили) — возвращается как была', () => {
    const subs = { SPD: 6, CHC: 6, CHD: 5, 'ATK%': 5 };
    expect(restoreItem(fresh({ slot: 'gloves', grade: 'rare' }), { subs }, idx).subs).toEqual(subs);
  });

  it('мусор в хранилище не роняет запуск', () => {
    for (const junk of [null, 'x', 42, [], { subs: 'x' }]) expect(restoreItem(fresh(), junk, idx).subs).toEqual({});
  });
});

describe('окно замены сабстата', () => {
  const ctx = makeCtx(idx, fresh().settings, new Set());
  const picker = (editing: string | null) => renderToStaticMarkup(createElement(IndexContext.Provider, { value: idx },
    createElement(SubPicker, { ctx, subs: { HP: 2, CHC: 1, RES: 3 }, blocked: new Set<string>(), editing, onPick: () => {}, onRemove: () => {} })));
  const cell = (html: string, label: string) => html.split('<button').find((b) => b.includes(`<span>${label}</span>`))!;

  it('при замене стат из другой строки можно выбрать, у него номер строки', () => {
    const res = cell(picker('HP'), 'RES%');
    expect(res).not.toContain('disabled');
    expect(res).toContain('<small class="row-n">3</small>');
  });

  it('новый сабстат (не замена) — отмеченные статы выбрать нельзя, номеров нет', () => {
    const res = cell(picker(null), 'RES%');
    expect(res).toContain('disabled');
    expect(res).not.toContain('row-n');
  });
});
