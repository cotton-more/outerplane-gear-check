// Выбранный билд героя (features/worn/aim, «Надето», В2, В11, Р17): правило выбора, когда игрок не выбрал; явный выбор и «Всё
// верно» пишут точечно; загрузка и «Надеть» выбор не создают. Герои — из эталонных данных, вещи — синтетические.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { aimOf, confirmAims, pickAim, savedAim, setAim, statsKey, undoAims, unconfirmed } from '@/features/worn/aim';
import { makeCtx } from '@/game/context';
import { type GearStore, type Piece } from '@/features/gear/model/gear';
import { buildKey } from '@/game/build/variants';
import { normalizeFusion } from '@/features/gear/model/fusion';
import { decodeGear, encodeGear, loadGear, restoreGear } from '@/features/gear/store/gearStore';
import { poolView, putOn, type Mark } from '@/features/gear/pool';
import type { Subs } from '@/game/item/subs';
import type { ItemInput } from '@/game/item/item';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const [caren, dahlia, eternal, cfEternal, aer, noBuilds] = ['Caren', 'Gnosis Dahlia', 'Eternal', 'Core Fusion Eternal', 'Aer', 'Hanbyul Lee'].map(char);
// Caren: Speed, Pen, Def, Speed/Immu (Immunity ×2 + Speed ×2), Def/Immu; Dahlia: Speed, Revenge, Swift Immune
const key = (c: { id: string }, build: string) => buildKey(c.id, build);
const GOOD: Subs = { 'DEF%': 3, CHC: 3, CHD: 3, SPD: 2 };

let seq = 0;
const SLOTS: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
// вещь брони сета short (null — без сета) в слоте i
const piece = (i: number, short: string | null, lit: Subs = GOOD): Piece =>
  ({ id: 'p' + ++seq, slot: SLOTS[i], grade: 'unique', setId: short ? set(short) : null, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '' });
const store = (pools: Record<string, Piece[]>, extra: Partial<GearStore> = {}): GearStore => ({
  v: 2, seq: 99, pieces: Object.fromEntries(Object.values(pools).flat().map((p) => [p.id, p])),
  pools: Object.fromEntries(Object.entries(pools).map(([c, ps]) => [c, ps.map((p) => p.id)])), ...extra,
});
const view = (st: GearStore, c: { id: string }) => poolView(ctx, st).of(c.id)!;
const shown = (st: GearStore, c: { id: string }) => aimOf(c, st, view(st, c));
const picked = (st: GearStore, c: { id: string }) => pickAim(c, view(st, c));
const speed4 = () => [0, 1, 2, 3].map((i) => piece(i, 'Speed'));
const marks = (m: Record<string, Mark>): Partial<GearStore> => ({ marks: m });

describe('правило выбора билда (В11)', () => {
  it('у героя один билд — он, причина «единственный»', () => {
    const st = store({ [eternal.id]: [piece(0, null)] });

    expect(picked(st, eternal)).toEqual({ key: key(eternal, 'Speed'), why: { kind: 'only' } });
  });

  it('один билд с отметкой «Собираю» — он же, причина «единственный»', () => {
    const st = store({ [eternal.id]: [piece(0, null)] }, marks({ [key(eternal, 'Speed')]: 'want' }));

    expect(picked(st, eternal).why).toEqual({ kind: 'only' });
  });

  it('один «Собираю» среди билдов — этот, хотя вещи тянут к другому', () => {
    const st = store({ [caren.id]: speed4() }, marks({ [key(caren, 'Pen')]: 'want' }));

    expect(picked(st, caren)).toEqual({ key: key(caren, 'Pen'), why: { kind: 'want' } });
  });

  it('два «Собираю» — между ними по вещам; не отмеченный, но лучший по вещам, не участвует', () => {
    const pieces = [piece(0, 'Immunity'), piece(1, 'Immunity'), piece(2, 'Speed'), piece(3, 'Speed')];
    const st = store({ [caren.id]: pieces }, marks({ [key(caren, 'Pen')]: 'want', [key(caren, 'Def/Immu')]: 'want' }));

    expect(picked(st, caren).key).toBe(key(caren, 'Def/Immu')); // Speed/Immu собрал бы больше, но он не «Собираю»
  });

  it('два «Собираю» с равными вещами — первый в списке, причина «первый»', () => {
    const st = store({ [caren.id]: [piece(0, null)] }, marks({ [key(caren, 'Def')]: 'want', [key(caren, 'Pen')]: 'want' }));

    expect(picked(st, caren)).toEqual({ key: key(caren, 'Pen'), why: { kind: 'first' } });
  });

  it('включённый бонус побеждает больший прогресс: Dahlia, Swiftness 2P включён против Speed 2/4', () => {
    const st = store({ [dahlia.id]: [piece(0, 'Swiftness'), piece(1, 'Swiftness'), piece(2, 'Speed'), piece(3, 'Speed')] });
    const progress = (b: string) => view(st, dahlia).asm.get(key(dahlia, b))!.progress;

    expect({ speed: progress('Speed'), swiftImmune: progress('Swift Immune'), aim: picked(st, dahlia) })
      .toEqual({ speed: 2, swiftImmune: 2, aim: { key: key(dahlia, 'Swift Immune'), why: { kind: 'on', part: { set: set('Swiftness'), n: 2 } } } });
  });

  it('включённый бонус побеждает и там, где прогресс у другого больше', () => {
    const st = store({ [caren.id]: [piece(0, 'Immunity'), piece(1, 'Immunity'), piece(2, 'Penetration'), piece(3, 'Penetration')] });
    const p = (b: string) => view(st, caren).asm.get(key(caren, b))!.progress;

    expect({ pen: p('Pen'), defImmu: p('Def/Immu'), aim: picked(st, caren).key }).toEqual({ pen: 2, defImmu: 2, aim: key(caren, 'Speed/Immu') });
  });

  it('при равных бонусах — больше вещей связки, причина «больше вещей сета»', () => {
    const st = store({ [caren.id]: speed4() });

    expect(picked(st, caren)).toEqual({ key: key(caren, 'Speed'), why: { kind: 'more', set: set('Speed') } });
  });

  it('ничья по бонусам и вещам — первый в списке, причина «первый»', () => {
    const st = store({ [caren.id]: [piece(0, null)] });

    expect(picked(st, caren)).toEqual({ key: key(caren, 'Speed'), why: { kind: 'first' } });
  });

  it('одинаковые для игры варианты — один: Sigma «Support» (как «Speed») не даёт ничьей, причина «включён бонус», не «первый»', () => {
    const sigma = char('Sigma');
    const st = store({ [sigma.id]: speed4() });

    expect(picked(st, sigma)).toEqual({ key: key(sigma, 'Speed'), why: { kind: 'on', part: { set: set('Speed'), n: 4 } } });
  });
});

describe('«Не собираю» и «По статам»', () => {
  it('«Не собираю» — никогда: Speed ×4 собран, но отмечен — берётся другой', () => {
    const st = store({ [caren.id]: speed4() }, marks({ [key(caren, 'Speed')]: 'skip' }));

    expect(picked(st, caren).key).not.toBe(key(caren, 'Speed'));
  });

  it('«Не собираю» на билде целиком (ключ родителя у билда с несколькими связками) тоже исключает все связки', () => {
    const delta = char('Heatwave Cop Delta');
    const parent = delta.builds.find((b) => b.sets.length > 1)!;
    const st = store({ [delta.id]: [piece(0, null)] }, marks({ [key(delta, parent.name)]: 'skip' }));

    expect(picked(st, delta).key.startsWith(key(delta, parent.name) + '#')).toBe(false);
  });

  it('единственный билд с «Не собираю» — «По статам»', () => {
    const st = store({ [eternal.id]: [piece(0, null)] }, marks({ [key(eternal, 'Speed')]: 'skip' }));

    expect(picked(st, eternal)).toEqual({ key: statsKey(eternal.id), why: { kind: 'stats' } });
  });

  it('все билды «Не собираю» — «По статам»', () => {
    const skips = Object.fromEntries(caren.builds.map((b) => [key(caren, b.name), 'skip' as Mark]));
    const st = store({ [caren.id]: speed4() }, marks(skips));

    expect(picked(st, caren)).toEqual({ key: statsKey(caren.id), why: { kind: 'stats' } });
  });

  it('билдов вовсе нет — «По статам»', () => {
    const st = store({ [noBuilds.id]: [piece(0, null)] });

    expect(picked(st, noBuilds)).toEqual({ key: statsKey(noBuilds.id), why: { kind: 'stats' } });
  });
});

describe('сохранённый ключ', () => {
  it('сохранённый билд среди вариантов героя показывается как есть, правило не работает (why: null)', () => {
    const st = store({ [caren.id]: speed4() }, { aim: { [caren.id]: key(caren, 'Pen') } });

    expect(shown(st, caren)).toEqual({ key: key(caren, 'Pen'), why: null });
  });

  it('сохранённая «По статам» годится всегда, в том числе у героя без билдов', () => {
    const st = store({ [noBuilds.id]: [piece(0, null)] }, { aim: { [noBuilds.id]: statsKey(noBuilds.id) } });

    expect(savedAim(noBuilds, st, view(st, noBuilds))).toBe(statsKey(noBuilds.id));
  });

  it('невалидный сохранённый ключ (билда больше нет) — правило на лету, как без него', () => {
    const st = store({ [caren.id]: speed4() }, { aim: { [caren.id]: key(caren, 'Gone') } });

    expect(shown(st, caren)).toEqual(picked(st, caren));
  });

  it('ключ чужого героя не годится: aim Core Fusion не берёт ключ Eternal', () => {
    const st = store({ [cfEternal.id]: [piece(0, null)] }, { aim: { [cfEternal.id]: key(eternal, 'Speed') } });

    expect(shown(st, cfEternal).key).toBe(key(cfEternal, 'Speed'));
  });

  it('Core Fusion — свой выбор: вещи X перешли к CF, выбор X не перешёл', () => {
    const st = store({ [eternal.id]: [piece(0, null)] }, { aim: { [eternal.id]: key(eternal, 'Speed') } });

    const moved = normalizeFusion(idx, [cfEternal.id], st).st;

    expect({ aim: moved.aim, shown: shown(moved, cfEternal).key, unconfirmed: unconfirmed(ctx, moved) })
      .toEqual({ aim: undefined, shown: key(cfEternal, 'Speed'), unconfirmed: [cfEternal.id] });
  });
});

describe('запись выбора: setAim, confirmAims, undoAims', () => {
  const base = () => {
    const mine = speed4();
    return store({ [caren.id]: mine, [aer.id]: [piece(0, null)] }, { worn: { [caren.id]: { helmet: mine[0].id } } });
  };

  it('setAim пишет только aim героя', () => {
    const st = base();

    const r = setAim(st, caren.id, key(caren, 'Pen'));

    expect(r.st).toEqual({ ...st, aim: { [caren.id]: key(caren, 'Pen') } });
  });

  it('setAim у героя без пула ничего не пишет и возвращает то же хранилище', () => {
    const st = base();

    const r = setAim(st, eternal.id, key(eternal, 'Speed'));

    expect(r.st).toBe(st);
  });

  it('setAim тем же ключом, что уже сохранён, — то же хранилище, «Вернуть» ничего не меняет', () => {
    const st = { ...base(), aim: { [caren.id]: key(caren, 'Pen') } };

    const r = setAim(st, caren.id, key(caren, 'Pen'));

    expect({ same: r.st === st, undo: undoAims(r.st, r) }).toEqual({ same: true, undo: st });
  });

  it('«Вернуть» после setAim снимает выбор: хранилище как было, поля aim нет', () => {
    const st = base();
    const r = setAim(st, caren.id, key(caren, 'Pen'));

    const back = undoAims(r.st, r);

    expect({ back, hasAim: 'aim' in back }).toEqual({ back: st, hasAim: false });
  });

  it('«Вернуть» после смены выбора возвращает прежний ключ на прежнее место', () => {
    const st = { ...base(), aim: { [caren.id]: key(caren, 'Speed'), [aer.id]: key(aer, 'Speed') } };
    const r = setAim(st, caren.id, key(caren, 'Pen'));

    const back = undoAims(r.st, r);

    expect(JSON.stringify(back)).toBe(JSON.stringify(st));
  });

  it('«Вернуть» точечно: выбор другого героя, сделанный после, не тронут', () => {
    const first = setAim(base(), caren.id, key(caren, 'Pen'));
    const second = setAim(first.st, aer.id, key(aer, 'Penetration'));

    const back = undoAims(second.st, first);

    expect(back.aim).toEqual({ [aer.id]: key(aer, 'Penetration') });
  });

  it('«Вернуть» не трогает выбор того же героя, если его за эти секунды выбрали заново', () => {
    const first = setAim(base(), caren.id, key(caren, 'Pen'));
    const again = setAim(first.st, caren.id, key(caren, 'Def'));

    const back = undoAims(again.st, first);

    expect(back.aim).toEqual({ [caren.id]: key(caren, 'Def') });
  });

  it('«Вернуть» не пишет выбор герою, у которого за это время опустел пул', () => {
    const st = base();
    const r = setAim(st, aer.id, key(aer, 'Speed'));
    const { [aer.id]: _, ...pools } = r.st.pools;
    const { aim: _a, ...rest } = r.st;

    const back = undoAims({ ...rest, pools }, r);

    expect('aim' in back).toBe(false);
  });

  it('confirmAims записывает каждому показанное правилом, остальное не трогает', () => {
    const st = base();

    const r = confirmAims(ctx, st, [caren.id, aer.id]);

    expect(r.st).toEqual({ ...st, aim: { [caren.id]: picked(st, caren).key, [aer.id]: picked(st, aer).key } });
  });

  it('confirmAims не перезаписывает уже выбранное игроком', () => {
    const st = { ...base(), aim: { [caren.id]: key(caren, 'Def') } };

    const r = confirmAims(ctx, st, [caren.id, aer.id]);

    expect({ aim: r.st.aim, was: r.was }).toEqual({ aim: { [caren.id]: key(caren, 'Def'), [aer.id]: picked(st, aer).key }, was: { [aer.id]: null } });
  });

  it('confirmAims пропускает героя без пула', () => {
    const st = base();

    const r = confirmAims(ctx, st, [eternal.id]);

    expect({ same: r.st === st, now: r.now }).toEqual({ same: true, now: {} });
  });

  it('«Вернуть» после confirmAims — хранилище как было', () => {
    const st = base();
    const r = confirmAims(ctx, st, [caren.id, aer.id]);

    const back = undoAims(r.st, r);

    expect({ back, hasAim: 'aim' in back }).toEqual({ back: st, hasAim: false });
  });

  it('«Вернуть» после confirmAims точечно: выбор, сделанный после «Всё верно», остаётся', () => {
    const st = base();
    const r = confirmAims(ctx, st, [caren.id, aer.id]);
    const later = setAim(r.st, caren.id, key(caren, 'Def'));

    const back = undoAims(later.st, r);

    expect(back.aim).toEqual({ [caren.id]: key(caren, 'Def') });
  });
});

describe('«Выбрал билды»: кто без сохранённого выбора (unconfirmed)', () => {
  it('герои с пулом без aim — в списке; герои без пула — нет', () => {
    const st = store({ [caren.id]: speed4(), [aer.id]: [piece(0, null)] });

    expect(unconfirmed(ctx, st).sort()).toEqual([caren.id, aer.id].sort());
  });

  it('герой с валидным сохранённым выбором (билд или «По статам») — не в списке', () => {
    const st = store({ [caren.id]: speed4(), [aer.id]: [piece(0, null)] }, { aim: { [caren.id]: key(caren, 'Pen'), [aer.id]: statsKey(aer.id) } });

    expect(unconfirmed(ctx, st)).toEqual([]);
  });

  it('невалидный сохранённый ключ — в списке', () => {
    const st = store({ [caren.id]: speed4() }, { aim: { [caren.id]: key(caren, 'Gone') } });

    expect(unconfirmed(ctx, st)).toEqual([caren.id]);
  });

  it('герой без билдов — не в списке: выбирать не из чего', () => {
    const st = store({ [noBuilds.id]: [piece(0, null)] });

    expect(unconfirmed(ctx, st)).toEqual([]);
  });

  it('герой, у которого все билды «Не собираю», — в списке: правило выбрало «По статам»', () => {
    const skips = Object.fromEntries(caren.builds.map((b) => [key(caren, b.name), 'skip' as Mark]));
    const st = store({ [caren.id]: speed4() }, marks(skips));

    expect({ list: unconfirmed(ctx, st), aim: shown(st, caren).key }).toEqual({ list: [caren.id], aim: statsKey(caren.id) });
  });

  it('после confirmAims список пуст', () => {
    const st = store({ [caren.id]: speed4(), [aer.id]: [piece(0, null)] });

    expect(unconfirmed(ctx, confirmAims(ctx, st, unconfirmed(ctx, st)).st)).toEqual([]);
  });
});

describe('загрузка и «Надеть» выбор не создают (Р17)', () => {
  const stored = () => store({ [caren.id]: speed4() });

  it('restoreGear и loadGear хранилища без aim — поля aim нет', () => {
    const raw = stored();

    expect({ restored: 'aim' in restoreGear(raw, idx), loaded: 'aim' in loadGear(raw, idx, [caren.id]).st }).toEqual({ restored: false, loaded: false });
  });

  it('код копии: туда и обратно — aim не появляется', () => {
    const back = decodeGear(encodeGear(stored()), idx) as GearStore;

    expect('aim' in back).toBe(false);
  });

  it('«Надеть» не создаёт aim', () => {
    const x: ItemInput = { slot: 'helmet', grade: 'unique', setId: set('Speed'), itemKey: null, main: null, subs: GOOD };

    const r = putOn(ctx, stored(), caren.id, x);

    expect('aim' in r.st).toBe(false);
  });

  it('герой без выбора остаётся «не выбранным» после загрузки и показывает правило', () => {
    const loaded = loadGear(stored(), idx, [caren.id]).st;

    expect({ unconfirmed: unconfirmed(ctx, loaded), shown: shown(loaded, caren).key }).toEqual({ unconfirmed: [caren.id], shown: key(caren, 'Speed') });
  });
});
