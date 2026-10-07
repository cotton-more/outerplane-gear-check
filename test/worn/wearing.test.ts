// Данные карточки героя (features/worn/wearing, .x/0085 этап 6): «Переодеть» — лучшая раскладка против надетого (+1 очко,
// FORMULA §3 п. 3), «Что искать» и варианты закрепления — по лучшей раскладке под набор, цвет сабстата по очкам (PLAN Д1),
// причины в списке вещей. Герои — из эталонных данных, вещи — синтетические.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { makeCtx } from '@/game/context';
import { setPin, type GearStore, type Piece } from '@/features/gear/model/gear';
import { poolView } from '@/features/gear/pool';
import type { Subs } from '@/game/item/subs';
import { comboSig } from '@/game/build/variants';
import { pinOptions } from '@/game/build/profile';
import { pinChoices, redressOf, undoWearMany, wearMany, wornView } from '@/features/worn/wearing';
import { heroPool } from '@/features/gear/verdict';
import { char as ch, ctx as c2, D as data, mk, prof } from '../gear/statSets';
import { reasonOf } from '@/features/gear/pool/info';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const ctx = makeCtx(idx, { rosterOnly: false, stage: 'grow', lv120: false, quirks: true }, new Set());
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
// Delta: DPS (CHC › ATK › SPD = CHD › DMG UP%; Penetration ×4 | Attack ×2 + Speed ×2 | Penetration ×2 + Attack ×2) и
// Priority Support/PvP (SPD › CHC › ATK › CHD › DMG UP%; Speed ×4). «По статам» — цепочка DPS (первый при равенстве)
const delta = char('Heatwave Cop Delta');
const SPEED = set('Speed'), ATTACK = set('Attack'), PEN = set('Penetration');
const pinBy = (sig: string) => pinOptions(delta).find((o) => comboSig(o.combo) === sig)!;

let seq = 0;
const ARMOR: SlotId[] = ['helmet', 'armor', 'gloves', 'shoes'];
const GOOD: Subs = { SPD: 4, CHC: 4, CHD: 4, ATK: 4 };
const WEAK: Subs = { RES: 2, EFF: 2, HP: 2, DEF: 2 };
const piece = (slot: SlotId, short: string | null, lit: Subs = GOOD, extra: Partial<Piece> = {}): Piece =>
  ({ id: 'p' + ++seq, slot, grade: 'unique', setId: short ? set(short) : null, itemKey: null, main: null, yellow: lit, lit, bt: 4, at: '', ...extra });
const armorOf = (short: string | null, lit?: Subs) => ARMOR.map((slot) => piece(slot, short, lit));

const store = (pool: Piece[], worn: Piece[], extra: Partial<GearStore> = {}): GearStore => ({
  v: 3, seq: 999, pieces: Object.fromEntries(pool.map((p) => [p.id, p])), pools: { [delta.id]: pool.map((p) => p.id) },
  worn: { [delta.id]: Object.fromEntries(worn.map((p) => [p.slot, p.id])) }, ...extra,
});
const view = (st: GearStore) => wornView(ctx, delta, st, poolView(ctx, st).hero(delta.id));

describe('«Переодеть»: лучшая раскладка из своих вещей против надетого', () => {
  it('своя Speed-броня в пуле лучше надетой слабой — все четыре вещи, прирост в очках, включится Speed ×4', () => {
    const worn = armorOf('Attack', WEAK), speed = armorOf('Speed');
    const r = view(store([...worn, ...speed], worn)).redress!;
    expect(r.wear.map((w) => [w.piece.id, w.replaces?.id])).toEqual(speed.map((p, i) => [p.id, worn[i].id]));
    expect(r.pts).toBeGreaterThan(1);
    expect(r.on).toContainEqual({ set: SPEED, n: 4 });
  });

  it('надето = лучшая раскладка — «Переодеть» нет', () => {
    const speed = armorOf('Speed');
    expect(view(store(speed, speed)).redress).toBeNull();
  });

  it('лучше меньше чем на 1 очко — «Переодеть» нет (в раскладке она есть: честный максимум)', () => {
    const worn = [piece('helmet', 'Speed', { SPD: 3, CHC: 4, CHD: 4, ATK: 4 }), ...armorOf('Speed').slice(1)];
    const up = piece('helmet', 'Speed'); // SPD 4: +0,65 очк.
    const st = store([...worn, up], worn);
    expect(poolView(ctx, st).hero(delta.id)!.info.layout.helmet?.id).toBe(up.id);
    expect(view(st).redress).toBeNull();
  });

  it('такая же по содержимому запись — не «надеть»', () => {
    const speed = armorOf('Speed');
    const twin = { ...speed[0], id: 'twin' };
    const r = view(store([twin, ...speed], speed));
    expect(r.redress).toBeNull();
  });

  it('«Надеть все» надевает вещи по очереди, «Вернуть» — как было', () => {
    const worn = armorOf('Attack', WEAK), speed = armorOf('Speed');
    const st = store([...worn, ...speed], worn);
    const r = wearMany(ctx, st, delta.id, view(st).redress!.wear.map((w) => w.piece.id))!;
    expect(r.st.worn?.[delta.id]).toEqual(Object.fromEntries(speed.map((p) => [p.slot, p.id])));
    expect(view(r.st).redress).toBeNull();
    expect(undoWearMany(r.st, delta.id, r)).toEqual(st);
    expect(wearMany(ctx, r.st, delta.id, speed.map((p) => p.id))).toBeNull();
  });
});

describe('«Что искать» и варианты закрепления — по лучшей раскладке под набор', () => {
  it('Speed-шлем и Speed-броня: Speed ×4 — 2 из 4, нужны перчатки и ботинки (без сета); Attack ×2 + Speed ×2 — с сетом', () => {
    const two = [piece('helmet', 'Speed'), piece('armor', 'Speed')];
    const seek = view(store(two, two)).seek;
    const speed4 = seek.find((f) => comboSig(f.pin.combo) === `${SPEED}x4`)!;
    expect({ k: speed4.k, n: speed4.n, need: speed4.need }).toEqual({ k: 2, n: 4, need: [{ slot: 'gloves', set: null }, { slot: 'shoes', set: null }] });
    const mix = seek.find((f) => f.pin.combo.some((p) => p.set === ATTACK) && f.pin.combo.some((p) => p.set === SPEED))!;
    expect({ k: mix.k, need: mix.need }).toEqual({ k: 2, need: [{ slot: 'gloves', set: ATTACK }, { slot: 'shoes', set: ATTACK }] });
    // 0 из 4 (Penetration ×4) — нет
    expect(seek.some((f) => comboSig(f.pin.combo) === `${PEN}x4`)).toBe(false);
  });

  it('собранный набор не показывается; от ближнего', () => {
    const speed = armorOf('Speed');
    const seek = view(store(speed, speed)).seek;
    expect(seek.some((f) => comboSig(f.pin.combo) === `${SPEED}x4`)).toBe(false);
    expect(seek.map((f) => f.k)).toEqual([...seek.map((f) => f.k)].sort((a, z) => z - a));
  });

  it('у недостающей части — свой сет: Penetration ×2 + Attack ×2 при трёх Penetration и одном Attack — нужна Attack-вещь', () => {
    const pool = [piece('helmet', 'Penetration'), piece('armor', 'Penetration'), piece('gloves', 'Penetration'), piece('shoes', 'Attack')];
    const f = view(store(pool, pool)).seek.find((x) => comboSig(x.pin.combo) === `${ATTACK}x2+${PEN}x2`)!;
    expect(f.k).toBe(3);
    expect(f.need).toHaveLength(1);
    expect(f.need[0].set).toBe(ATTACK);
  });

  it('закреплён — только его набор', () => {
    const two = [piece('helmet', 'Speed'), piece('armor', 'Speed')];
    const st = setPin(store(two, two), delta.id, pinBy(`${SPEED}x4`).key).st;
    expect(view(st).seek.map((f) => comboSig(f.pin.combo))).toEqual([`${SPEED}x4`]);
  });

  it('варианты закрепления — все наборы, от ближнего; 0 из 4 тоже', () => {
    const two = [piece('helmet', 'Speed'), piece('armor', 'Speed')];
    const hp = poolView(ctx, store(two, two)).hero(delta.id)!;
    const list = pinChoices(hp);
    expect(list).toHaveLength(pinOptions(delta).length);
    expect(list.map((f) => f.k)).toEqual([...list.map((f) => f.k)].sort((a, z) => z - a));
    expect(list.at(-1)!.k).toBe(0);
  });
});

describe('слоты «Надето» и причины в списке вещей', () => {
  it('цвет сабстата — по очкам: стат цепочки на 5-м месте засчитан, чужой — нет; закреплённый — по цепочке своего билда', () => {
    const h = piece('helmet', 'Speed', { 'DMG UP%': 2, RES: 2, CHC: 2, HP: 2 });
    const credit = (st: GearStore) => Object.fromEntries(view(st).slots.find((s) => s.slot === 'helmet')!.tokens.map((k) => [k.key, k.credit]));
    expect(credit(store([h], [h]))).toMatchObject({ 'DMG UP%': 1, RES: 0, CHC: 1, HP: 0 });
    expect(view(store([h], [h])).count).toBe(1);
  });

  it('бонусы — только включённые надетыми сетами', () => {
    const speed = armorOf('Speed');
    expect(view(store(speed, speed)).bonuses.map((r) => [r.set, r.n])).toContainEqual([SPEED, 4]);
    expect(view(store([speed[0]], [speed[0]])).bonuses).toEqual([]);
  });

  it('причина: надета · лучший сета · по статам · не держится — null', () => {
    const worn = piece('helmet', 'Speed');
    const best = piece('armor', 'Speed');
    const junk = piece('gloves', 'Speed', { RES: 1 });
    const st = store([worn, best, junk], [worn]);
    const hp = poolView(ctx, st).hero(delta.id)!;
    expect(reasonOf(hp.info, worn)).toEqual({ kind: 'worn' });
    expect(reasonOf(hp.info, best)?.kind).toMatch(/best|stats/);
    expect(reasonOf(hp.info, junk)).toBeNull();
  });
});

// ревью этапа 10, находка 4: «Переодеть» только по пассивке — rankUp, очки могут упасть (кнопка без «+N»)
describe('«Переодеть» по рангу оружия', () => {
  it('рекомендованное оружие на 0 очков вместо надетого не из билдов на 9,65 — rankUp, pts −9,65', () => {
    const rin = ch('Rin');
    const listed = prof(rin).chain.weapons[0];
    const item = data.weapons.find((i) => i.key === listed.key)!;
    const other = data.weapons.find((i) => i.grade === 'unique' && i.key !== listed.key && !rin.builds.some((b) => b.weapons.some((w) => w.key === i.key))
      && (!i.classLimits.length || i.classLimits.includes(rin.class)) && i.mains.includes('HP%'))!;
    const rec = mk('p1', 'weapon', null, { RES: 1, EFF: 1, 'HP%': 1, 'DEF%': 1 }, 4, { itemKey: item.key, main: listed.mains[0] ?? item.mains[0] });
    const non = mk('p2', 'weapon', null, { CHC: 4, CHD: 3, SPD: 3, 'ATK%': 3 }, 4, { itemKey: other.key, main: 'HP%' });
    const r = redressOf(heroPool(c2, rin, [rec, non], new Set(['p2']))!, { weapon: non })!;
    expect(r.rankUp).toBe(true);
    expect(r.pts).toBeCloseTo(-9.65, 6);
    expect(r.wear.map((x) => x.piece.id)).toEqual(['p1']);
  });
});

// The chain on «Надето» (owner, 2026-10-07): the chain's own order, a stat — its segments summed over worn pieces
describe('цепочка с суммой сегментов надетого', () => {
  it('порядок цепочки, ATK% и flat ATK рядом через «/», стат, которого нет на вещах, — 0', () => {
    const helm = piece('helmet', 'Speed', { SPD: 4, CHC: 4, CHD: 4, ATK: 4 });
    const glov = piece('gloves', 'Speed', { CHC: 2, 'ATK%': 3, RES: 1, SPD: 1 });
    const v = view(store([helm, glov], [helm, glov]));
    // «По статам» у Delta — CHC › ATK › SPD = CHD › DMG UP%
    expect(v.chain.map((x) => [x.sep, x.key, x.seg])).toEqual([
      ['', 'CHC', 6], ['›', 'ATK%', 3], ['/', 'ATK', 4], ['›', 'SPD', 5], ['=', 'CHD', 4], ['›', 'DMG UP%', 0],
    ]);
    expect(v.chain.find((x) => x.key === 'ATK%')!.credit).toBe(1);
    expect(v.chain.find((x) => x.key === 'ATK')!.credit).toBeLessThan(1);
  });

  it('очки надетого — вещи плюс сеты, у каждой вещи свои', () => {
    const speed = armorOf('Speed');
    const v = view(store(speed, speed)).value!;
    expect(v.ptsBySlot.helmet).toBeGreaterThan(0);
    expect(v.v).toBeCloseTo(v.ptsSum + v.setSum, 9);
    expect(v.ptsSum).toBeCloseTo(Object.values(v.ptsBySlot).reduce((a, b) => a + b!, 0), 9);
  });
});
