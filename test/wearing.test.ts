// Данные «Надето» (features/worn/wearing, шаг 4): вкладка (совет «лучше из своих», сет k из n), шторка «Билд для X» (варианты, флаги),
// экран «Переодеть» (надень, снимешь, не хватает, включится / выключится). Герои — из эталонных данных, вещи — синтетические.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, Grade, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { buildKey, type GearStore, type Piece } from '@/features/gear/model/gear';
import { poolView, type Mark } from '@/features/gear/pool';
import type { Subs } from '@/game/item/subs';
import { variantsOf } from '@/game/build/variants';
import { aimOf } from '@/features/worn/aim';
import { aimOptions, missingParts, reasonOf, redressPlan, t4Parts, undoWearMany, wearMany, wornView } from '@/features/worn/wearing';

const D: Dataset = JSON.parse(readFileSync(new URL('./fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, fodder: true, stage: 'grow', lv120: false, quirks: true }, new Set());
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const [valentine, delta] = ['Valentine', 'Heatwave Cop Delta'].map(char);
// Delta: DPS (Penetration ×4 | Attack ×2 + Speed ×2 | Penetration ×2 + Attack ×2) и Priority Support/PvP (Speed ×4)
const variant = (c: { id: string }, build: string, sig?: string) => `${buildKey(c.id, build)}${sig ? '#' + sig : ''}`;
const PEN4 = variant(delta, 'DPS', '11x4'), ATK_SPD = variant(delta, 'DPS', '1x2+13x2'), PEN_ATK = variant(delta, 'DPS', '1x2+11x2');
const SUPPORT = variant(delta, 'Priority Support/PvP');
const STATS = variant(delta, '#stats');

let seq = 0;
const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const GOOD: Subs = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };
const piece = (slot: SlotId, short: string | null, lit: Subs = GOOD, extra: Partial<Piece> = {}): Piece =>
  ({ id: 'p' + ++seq, slot, grade: 'unique', setId: short ? set(short) : null, itemKey: null, main: null, yellow: lit, lit, bt: null, at: '', ...extra });
const armorOf = (short: string | null, lit?: Subs) => ARMOR.map((slot) => piece(slot, short, lit));
const weapon = (grade: Grade, itemKey: string | null): Piece => piece('weapon', null, GOOD, { grade, itemKey, main: 'ATK%' });

// pool — вещи героя, worn — надетое (по слотам)
const store = (c: { id: string }, pool: Piece[], worn: Piece[], extra: Partial<GearStore> = {}): GearStore => ({
  v: 2, seq: 999, pieces: Object.fromEntries(pool.map((p) => [p.id, p])), pools: { [c.id]: pool.map((p) => p.id) },
  worn: { [c.id]: Object.fromEntries(worn.map((p) => [p.slot, p.id])) }, ...extra,
});
const cpOf = (st: GearStore, c: { id: string }) => poolView(ctx, st).of(c.id)!;
const wornOf = (c: typeof valentine, st: GearStore) => wornView(ctx, c, st, cpOf(st, c));
const adviceOf = (c: typeof valentine, st: GearStore, slot: SlotId) => wornOf(c, st).slots.find((s) => s.slot === slot)!.advice;
const options = (st: GearStore) => aimOptions(ctx, delta, st, cpOf(st, delta));
const optionOf = (st: GearStore, key: string) => options(st).find((o) => o.key === key)!;
const plan = (st: GearStore, key: string) => redressPlan(ctx, delta, st, cpOf(st, delta), key)!;
const ids = (ps: Piece[]) => ps.map((p) => p.id);

// Delta носит Speed ×4 (и слабое оружие с чужим аксессуаром), в вещах лежат ещё четыре Penetration
function deltaStore(extra: Partial<GearStore> = {}, more: Piece[] = []) {
  const speed = armorOf('Speed'), pen = armorOf('Penetration');
  const st = store(delta, [...speed, ...pen, ...more], speed, { aim: { [delta.id]: SUPPORT }, ...extra });
  return { st, speed, pen };
}

describe('вкладка «Надето»: совет «лучше из своих»', () => {
  it('M1: вещь раскладки лучше надетой на ≥ 1 очк. — совет со стрелкой вверх и выигрышем', () => {
    const [h1, ...rest] = armorOf('Speed');
    const h2 = piece('helmet', 'Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 6 });
    const weak = { ...h1, lit: { SPD: 1 }, yellow: { SPD: 1 } };
    const st = store(valentine, [weak, h2, ...rest], [weak, ...rest]);

    const advice = adviceOf(valentine, st, 'helmet');

    expect(advice).toMatchObject({ piece: { id: h2.id }, up: true });
    expect(advice!.delta).toBeGreaterThan(0);
  });

  it('M1: вещь раскладки лучше надетой на 0,8 очк. и сет не включает — совета нет', () => {
    const [h1, ...rest] = armorOf('Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 5 });
    const h2 = piece('helmet', 'Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 6 });
    const st = store(valentine, [h1, h2, ...rest], [h1, ...rest]);

    expect(adviceOf(valentine, st, 'helmet')).toBeNull();
  });

  it('M1: лучше надетой на 1,6 очк. (ATK 4 против 6) — совет есть', () => {
    const [h1, ...rest] = armorOf('Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 4 });
    const h2 = piece('helmet', 'Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 6 });
    const st = store(valentine, [h1, h2, ...rest], [h1, ...rest]);

    expect(adviceOf(valentine, st, 'helmet')).toMatchObject({ piece: { id: h2.id }, up: true });
  });

  it('M2: запасная включает бонус конвертируемого сета (Speed), но очков меньше чем на 1 — совета нет', () => {
    const [, ...rest] = armorOf('Speed');
    const stylish = piece('helmet', null, { SPD: 6, CHC: 6, CHD: 6, ATK: 6 });
    const speedHelmet = piece('helmet', 'Speed', { SPD: 1, CHC: 1 });
    const st = store(valentine, [stylish, speedHelmet, ...rest], [stylish, ...rest]);

    expect(adviceOf(valentine, st, 'helmet')).toBeNull();
  });

  it('M4: вещь, снятая обменом (хуже надетой), лежит в пуле — вернуть её «Надето» не советует', () => {
    const [h1, ...rest] = armorOf('Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 4 });
    const h2 = piece('helmet', 'Speed', { SPD: 6, CHC: 6, CHD: 6, ATK: 6 });
    const st = store(valentine, [h1, h2, ...rest], [h2, ...rest]);

    expect(adviceOf(valentine, st, 'helmet')).toBeNull();
  });

  it('надета такая же по содержимому запись — совета нет', () => {
    const [h1, ...rest] = armorOf('Speed');
    const twin = piece('helmet', 'Speed');
    const st = store(valentine, [h1, twin, ...rest], [twin, ...rest]);

    expect(adviceOf(valentine, st, 'helmet')).toBeNull();
  });

  it('M2: вещь хуже по статам, но включает неконвертируемый сет, — совет есть: Penetration ×4 включится', () => {
    const [, ...pen] = armorOf('Penetration');
    const stylish = piece('helmet', null, { CHC: 6, CHD: 6, ATK: 6, SPD: 6 });
    const penHelmet = piece('helmet', 'Penetration', { CHC: 1 });
    const st = store(delta, [stylish, penHelmet, ...pen], [stylish, ...pen], { aim: { [delta.id]: PEN4 } });

    const advice = adviceOf(delta, st, 'helmet');

    expect(advice).toMatchObject({ piece: { id: penHelmet.id }, up: false, setOn: [{ set: set('Penetration'), n: 4 }] });
  });

  it('пустой слот — вещь раскладки без выигрыша', () => {
    const [h, ...rest] = armorOf('Speed');
    const st = store(valentine, [h, ...rest], rest);

    const advice = adviceOf(valentine, st, 'helmet');

    expect(advice).toEqual({ piece: h, delta: null, up: false, setOn: [], gained: [], lost: [] });
  });

  it('M3: рекомендованное оружие вместо временного — совет со стрелкой вверх', () => {
    const epic = weapon('rare', null), rec = weapon('unique', '23');
    const st = store(delta, [epic, rec], [epic], { aim: { [delta.id]: PEN4 } });

    expect(adviceOf(delta, st, 'weapon')).toMatchObject({ piece: { id: rec.id }, up: true });
  });
});

describe('вкладка «Надето»: раскладка надетого', () => {
  it('сет k из n по надетому и «надето · k из 6»', () => {
    const [h, a, g, s] = armorOf('Speed');
    const st = store(valentine, [h, a, g, s], [h, a, g]);

    const v = wornOf(valentine, st);

    expect({ set: v.set, count: v.count, pool: v.pool }).toEqual({ set: { k: 3, n: 4 }, count: 3, pool: 4 });
  });

  it('токены: засчитанный стат цепочки билда — 1, чужой — 0', () => {
    const h = piece('helmet', 'Speed', { SPD: 2, 'RES%': 2 });
    const st = store(valentine, [h], [h]);

    const tokens = wornOf(valentine, st).slots.find((s) => s.slot === 'helmet')!.tokens;

    expect(tokens).toEqual([{ key: 'SPD', lit: 2, credit: 1 }, { key: 'RES%', lit: 2, credit: 0 }]);
  });

  it('бонусы надетых сетов и билд героя — выбранный', () => {
    const { st } = deltaStore();

    const v = wornOf(delta, st);

    expect({ aim: v.aim.key, bonuses: v.bonuses.map((r) => `${r.set}:${r.n}:${r.tier}`) }).toEqual({ aim: SUPPORT, bonuses: [`${set('Speed')}:4:T0`] });
  });

  it('часть связки с бонусом только на T4, пока его нет, — в t4', () => {
    const [h, a] = armorOf('Speed');
    const st = store(delta, [h, a], [h, a], { aim: { [delta.id]: ATK_SPD } });

    expect(wornOf(delta, st).t4).toEqual([{ set: set('Speed'), n: 2, k: 2 }]);
  });

  it('у героя без билдов — надетое без билда и без совета', () => {
    const noBuilds = char('Hanbyul Lee');
    const h = piece('helmet', 'Speed');
    const st = store(noBuilds, [h], [h]);

    const v = wornView(ctx, noBuilds, st, cpOf(st, noBuilds));

    expect({ variant: v.variant, set: v.set, advice: v.slots.map((s) => s.advice) }).toEqual({ variant: null, set: null, advice: Array(6).fill(null) });
  });
});

describe('шторка «Билд для X»', () => {
  it('Delta: сейчас — первым, три связки DPS и «По статам», не хватает и что можно переодеть', () => {
    const { st } = deltaStore();

    const keys = options(st).map((o) => ({ key: o.key, now: o.now, canRedress: o.canRedress, missing: o.missing }));

    expect(keys).toEqual([
      { key: SUPPORT, now: true, canRedress: false, missing: 0 },
      { key: PEN4, now: false, canRedress: true, missing: 0 },
      { key: PEN_ATK, now: false, canRedress: true, missing: 2 },
      { key: ATK_SPD, now: false, canRedress: false, missing: 2 },
      { key: STATS, now: false, canRedress: false, missing: 0 },
    ]);
  });

  it('«Не собираю» — последним, после «По статам»', () => {
    const { st } = deltaStore({ marks: { [PEN4]: 'skip' as Mark } });

    expect(options(st).map((o) => o.key).slice(-2)).toEqual([STATS, PEN4]);
  });

  it('части связки: надето, в вещах, не хватает, T4 и включён ли бонус', () => {
    const { st } = deltaStore();

    const parts = (key: string) => optionOf(st, key).parts.map((p) => ({ ...p.part, worn: p.worn, owned: p.owned, missing: p.missing, t4: p.t4, on: p.on }));

    expect({ support: parts(SUPPORT), atkSpeed: parts(ATK_SPD) }).toEqual({
      support: [{ set: set('Speed'), n: 4, worn: 4, owned: 4, missing: 0, t4: false, on: true }],
      atkSpeed: [
        { set: set('Attack'), n: 2, worn: 0, owned: 0, missing: 2, t4: false, on: false },
        { set: set('Speed'), n: 2, worn: 2, owned: 2, missing: 0, t4: true, on: true },
      ],
    });
  });

  it('«По статам» — вариант без частей связки', () => {
    const { st } = deltaStore();

    expect(optionOf(st, STATS)).toMatchObject({ stats: true, parts: [], now: false, canRedress: false });
  });

  it('«По статам»: можно переодеть, когда лучшее по цепочке из вещей не надето', () => {
    const { st } = deltaStore({}, [piece('helmet', 'Speed', { CHC: 6, CHD: 6, ATK: 6, SPD: 6 })]);

    expect(optionOf(st, STATS).canRedress).toBe(true);
  });

  it('выбран «По статам» — он первым и «сейчас»', () => {
    const { st } = deltaStore({ aim: { [delta.id]: STATS } });

    expect(options(st)[0]).toMatchObject({ key: STATS, now: true });
  });
});

describe('экран «Переодеть»', () => {
  it('надень из своих — вещи раскладки, не надетые; снимешь — надетое, которое она заменит', () => {
    const { st, speed, pen } = deltaStore();

    const p = plan(st, PEN4);

    expect({ wear: ids(p.wear.map((w) => w.piece)), replaces: ids(p.wear.map((w) => w.replaces!)), remove: ids(p.remove) })
      .toEqual({ wear: ids(pen), replaces: ids(speed), remove: ids(speed) });
  });

  it('включится и выключится — бонусы до и после «Надеть все»', () => {
    const { st } = deltaStore();

    const p = plan(st, PEN4);

    expect({ on: p.on.map((r) => `${r.set}:${r.n}`), off: p.off.map((r) => `${r.set}:${r.n}`) })
      .toEqual({ on: [`${set('Penetration')}:4`], off: [`${set('Speed')}:4`] });
  });

  it('не хватает — часть связки, которой нет в вещах, как у карточки билда', () => {
    const { st } = deltaStore();

    const p = plan(st, ATK_SPD);

    expect(p.missing).toMatchObject([{ set: set('Attack'), n: 2, have: 0, need: 2, t4: false }]);
    expect(p.missing).toEqual(missingParts(ctx, cpOf(st, delta).reach.get(ATK_SPD)!));
  });

  it('оружие и аксессуар — строками в «Надень из своих», если в раскладке другие', () => {
    const epic = weapon('rare', null), rec = weapon('unique', '23');
    const own = piece('accessory', null, GOOD, { itemKey: '1017', main: 'SPD' });
    const burning = piece('accessory', null, GOOD, { itemKey: '1012', main: 'PEN%' });
    const { st } = deltaStore({}, [epic, rec, own, burning]);
    const worn = { ...st, worn: { [delta.id]: { ...st.worn![delta.id], weapon: epic.id, accessory: own.id } } };

    const p = plan(worn, PEN4);

    expect(p.wear.filter((w) => w.piece.slot === 'weapon' || w.piece.slot === 'accessory').map((w) => [w.piece.id, w.replaces!.id]))
      .toEqual([[rec.id, epic.id], [burning.id, own.id]]);
  });

  it('раскладка совпадает с надетым — ничего не надеть и не снять', () => {
    const { st } = deltaStore();

    const p = plan(st, SUPPORT);

    expect({ wear: p.wear, remove: p.remove, on: p.on, off: p.off }).toEqual({ wear: [], remove: [], on: [], off: [] });
  });

  it('неизвестный ключ — null', () => {
    const { st } = deltaStore();

    expect(redressPlan(ctx, delta, st, cpOf(st, delta), 'nope')).toBeNull();
  });
});

describe('общие с карточкой билда', () => {
  it('t4Parts совпадает с тем, что считал BuildGear: часть с бонусом только на T4 и без него', () => {
    const [h, a] = armorOf('Speed');
    const st = store(delta, [h, a], [h, a]);
    const asm = cpOf(st, delta).asm.get(ATK_SPD)!;

    expect(t4Parts(ctx, asm)).toEqual([{ set: set('Speed'), n: 2, k: 2 }]);
  });

  it('вариантов Delta — те, что в тесте (ключи сверены с данными)', () => {
    expect(variantsOf(idx, delta).map((v) => v.key)).toEqual([PEN4, ATK_SPD, PEN_ATK, SUPPORT]);
  });
});

describe('«Надеть все» на «Переодеть»: wearMany', () => {
  it('надевает вещи раскладки по очереди — надетое = раскладка', () => {
    const { st, pen } = deltaStore();
    const r = wearMany(ctx, st, delta.id, ids(plan(st, PEN4).wear.map((w) => w.piece)))!;
    expect(Object.values(r.st.worn![delta.id]).sort()).toEqual(ids(pen).sort());
  });

  it('«Вернуть» возвращает прежнее надетое', () => {
    const { st, speed } = deltaStore();
    const r = wearMany(ctx, st, delta.id, ids(plan(st, PEN4).wear.map((w) => w.piece)))!;
    expect(Object.values(undoWearMany(r.st, delta.id, r).worn![delta.id]).sort()).toEqual(ids(speed).sort());
  });

  it('надевать нечего (всё надето) — null', () => {
    const { st, speed } = deltaStore();
    expect(wearMany(ctx, st, delta.id, ids(speed))).toBeNull();
  });
});

describe('причина выбора билда: reasonOf', () => {
  it('«поровну — первый» при вещах билдов в пуле — ничья (tie)', () => {
    const { st } = deltaStore({ aim: undefined });
    const cp = cpOf(st, delta);
    expect(reasonOf(cp, aimOf(delta, st, cp))).toEqual({ kind: 'tie' });
  });

  it('«поровну — первый», когда вещей билдов нет, — остаётся', () => {
    const st = store(delta, [piece('helmet', 'Counterattack')], []);
    const cp = cpOf(st, delta);
    expect(reasonOf(cp, aimOf(delta, st, cp))?.kind).toBe('first');
  });

  it('«По статам» — причина stats', () => {
    expect(reasonOf({ asm: new Map() }, { key: STATS, why: { kind: 'stats' } })).toEqual({ kind: 'stats' });
  });
});
