// Данные карточки героя (features/worn/wearing, stat-sets этап 6): «Переодеть» — лучшая раскладка против надетого (+1 очко,
// MODEL.md §3 item 3; a Legendary instead of an Epic of the same slot — no +1, Q7), «Что искать» and pin variants — by the best layout for the set, the substat colour by points (PLAN Д1),
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
import { layoutValue, type Layout } from '@/features/gear/layout';
import { heroPool } from '@/features/gear/verdict';
import { redressLabel } from '@/features/worn/Redress';
import { TEXTS } from '@/i18n';
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

  // Q7 (owner, 2026-10-09): a Legendary not worse by points than the worn Epic of that slot — «Переодеть» without +1
  it('Q7: Legendary в пуле не хуже надетого Epic того же слота — «Переодеть» есть (равные очки и +0,65)', () => {
    const rest = armorOf('Speed').slice(1);
    const lit = { SPD: 3, CHC: 4, CHD: 4, ATK: 4 };
    const worn = [piece('helmet', 'Speed', lit, { grade: 'rare' }), ...rest];
    const same = piece('helmet', 'Speed', lit);
    const r0 = view(store([...worn, same], worn)).redress!;
    expect(r0.wear.map((w) => [w.piece.id, w.replaces?.id])).toEqual([[same.id, worn[0].id]]);
    expect(r0.pts).toBeCloseTo(0, 9);
    expect(r0.rankUp).toBe(false);
    // no named gain and no better passive: plain «Переодеть», not «пассивка лучше»
    expect([redressLabel(TEXTS.ru, r0), redressLabel(TEXTS.en, r0)]).toEqual(['Переодеть', 'Re-dress']);
    const up = piece('helmet', 'Speed', { ...lit, SPD: 4 });
    const r1 = view(store([...worn, up], worn)).redress!;
    expect(r1.wear[0].piece.id).toBe(up.id);
    expect(r1.pts).toBeCloseTo(0.65, 9);
    expect([redressLabel(TEXTS.ru, r1), redressLabel(TEXTS.en, r1)]).toEqual(['Переодеть: +0,6 очк.', 'Re-dress: +0.6 pts']);
  });

  it('Q7: Epic вместо Epic — порог 1 очко прежний (+0,65 — «Переодеть» нет)', () => {
    const lit = { SPD: 3, CHC: 4, CHD: 4, ATK: 4 };
    const worn = [piece('helmet', 'Speed', lit, { grade: 'rare' }), ...armorOf('Speed').slice(1)];
    const up = piece('helmet', 'Speed', { ...lit, SPD: 4 }, { grade: 'rare' });
    expect(view(store([...worn, up], worn)).redress).toBeNull();
  });

  it('Q7: Legendary вместо надетого Legendary при равных очках — «Переодеть» нет', () => {
    const lit = { SPD: 3, CHC: 4, CHD: 4, ATK: 4 };
    const worn = [piece('helmet', 'Speed', lit), ...armorOf('Speed').slice(1)];
    expect(view(store([...worn, piece('helmet', 'Speed', lit)], worn)).redress).toBeNull();
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

// «What to look for» rows carry what completing the set is worth (owner 2026-10-10): the set part of V after the row is completed
// minus before. The oracle is the same number measured on a layout with real pieces of the set in the needed slots
describe('«What to look for»: what a row is worth', () => {
  const hpOf = (st: GearStore) => poolView(ctx, st).hero(delta.id)!;
  const layoutOf = (ps: Piece[]): Layout => Object.fromEntries(ps.map((p) => [p.slot, p]));
  // the worn layout with a real piece of `short` in every slot the row needs: the set part of V, as the game would count it
  const measured = (st: GearStore, worn: Piece[], f: { need: { slot: SlotId; set: string | null }[]; pin: { combo: { set: string }[] } }) => {
    const hp = hpOf(st);
    const after = layoutOf(worn);
    for (const nd of f.need) after[nd.slot] = { ...piece(nd.slot, null), setId: nd.set ?? f.pin.combo[0].set, bt: 0 };
    return layoutValue(hp.P, after).setSum - layoutValue(hp.P, layoutOf(worn)).setSum;
  };

  it('Speed ×4 with two Speed pieces at T4: the gain is the set points, as on a layout with real pieces; it is above zero', () => {
    const two = [piece('helmet', 'Speed'), piece('armor', 'Speed')];
    const st = store(two, two);
    const row = view(st).seek.find((f) => comboSig(f.pin.combo) === `${SPEED}x4`)!;
    expect(row.gain).toBeGreaterThan(1);
    expect(row.gain).toBeCloseTo(measured(st, two, row), 9);
  });

  it('an empty slot is measured with a stub: three Speed worn, Speed ×4 is worth exactly the difference of the sets', () => {
    const three = armorOf('Speed').slice(0, 3);
    const st = store(three, three);
    const row = view(st).seek.find((f) => comboSig(f.pin.combo) === `${SPEED}x4`)!;
    expect(row.need).toEqual([{ slot: 'shoes', set: null }]);
    expect(row.gain).toBeCloseTo(measured(st, three, row), 9);
    expect(row.gain).toBeGreaterThan(1);
  });

  // Speed ×4 at T0–T3 is +25% on four pieces; Speed ×2 has no row below T4, so Attack ×2 + Speed ×2 would trade it for Attack ×2 alone
  const t0Speed = () => ARMOR.map((slot) => piece(slot, 'Speed', GOOD, { bt: 0 }));

  it('a row that leaves the worn set worth less (Speed ×4 worn, Attack ×2 + Speed ×2) is not shown; measured on real pieces it is negative', () => {
    const speed = t0Speed();
    const spare = [piece('gloves', 'Attack'), piece('shoes', 'Attack')];
    const st = store([...speed, ...spare], speed);
    expect(view(st).seek.some((f) => f.pin.combo.some((p) => p.set === ATTACK) && f.pin.combo.some((p) => p.set === SPEED))).toBe(false);
    const hp = hpOf(st);
    const f = pinChoices(hp).find((x) => comboSig(x.pin.combo) === `${ATTACK}x2+${SPEED}x2`)!;
    expect(f.k).toBeGreaterThan(0);
    expect(layoutValue(hp.P, { ...layoutOf(speed), gloves: spare[0], shoes: spare[1] }).setSum).toBeLessThan(layoutValue(hp.P, layoutOf(speed)).setSum - 1);
  });

  it('pinned hero: the row stays at a gain <= 0 (no number is printed for it); the same row on an unpinned hero is gone', () => {
    const speed = t0Speed();
    const st0 = store(speed, speed);
    const pin = pinBy(`${ATTACK}x2+${SPEED}x2`);
    const v = view(setPin(st0, delta.id, pin.key).st);
    expect(v.seek.map((f) => comboSig(f.pin.combo))).toEqual([`${ATTACK}x2+${SPEED}x2`]);
    expect(v.seek[0].gain).toBeLessThan(0.05);
    expect(view(st0).seek).toEqual([]);
  });

  it('order: closest first, at equal distance the bigger gain; nothing under 0.05 is listed', () => {
    const two = [piece('helmet', 'Speed'), piece('armor', 'Speed')];
    const seek = view(store(two, two)).seek;
    for (let i = 1; i < seek.length; i++) {
      const a = seek[i - 1], z = seek[i];
      expect(a.k > z.k || (a.k === z.k && a.gain >= z.gain)).toBe(true);
    }
    expect(seek.every((f) => f.gain >= 0.05)).toBe(true);
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
    expect([redressLabel(TEXTS.ru, r), redressLabel(TEXTS.en, r)]).toEqual(['Переодеть: пассивка лучше', 'Re-dress: better passive']);
    expect(r.wear.map((x) => x.piece.id)).toEqual(['p1']);
  });
});

// The chain on «Надето» (owner, 2026-10-07): the chain's own order, a stat — its segments summed over worn pieces
describe('цепочка с суммой сегментов надетого', () => {
  it('порядок цепочки, ATK% и flat ATK рядом через «/», стат, которого нет на вещах, — 0', () => {
    const helm = piece('helmet', 'Speed', { SPD: 4, CHC: 4, CHD: 4, ATK: 4 });
    const glov = piece('gloves', 'Speed', { CHC: 2, 'ATK%': 3, RES: 1, SPD: 1 });
    const v = view(store([helm, glov], [helm, glov]));
    // Delta's «По статам»: CHC › ATK › SPD = CHD › DMG UP%
    expect(v.chain.map((x) => [x.sep, x.key, x.seg])).toEqual([
      ['', 'CHC', 6], ['›', 'ATK%', 3], ['/', 'ATK', 4], ['›', 'SPD', 5], ['=', 'CHD', 4], ['›', 'DMG UP%', 0],
    ]);
    expect(v.chain.find((x) => x.key === 'ATK%')!.credit).toBe(1);
    expect(v.chain.find((x) => x.key === 'ATK')!.credit).toBeLessThan(1);
    // the second chain (Priority Support/PvP: SPD › CHC › ATK › CHD › DMG UP%) — same sums, its own order
    expect(v.build).toBe('DPS');
    expect(v.alt.map((a) => a.build)).toEqual(['Priority Support/PvP']);
    expect(v.alt[0].chain.map((x) => [x.sep, x.key, x.seg])).toEqual([
      ['', 'SPD', 5], ['›', 'CHC', 6], ['›', 'ATK%', 3], ['/', 'ATK', 4], ['›', 'CHD', 4], ['›', 'DMG UP%', 0],
    ]);
  });

  it('очки надетого — вещи плюс сеты, у каждой вещи свои', () => {
    const speed = armorOf('Speed');
    const v = view(store(speed, speed)).value!;
    expect(v.ptsBySlot.helmet).toBeGreaterThan(0);
    expect(v.v).toBeCloseTo(v.ptsSum + v.setSum, 9);
    expect(v.ptsSum).toBeCloseTo(Object.values(v.ptsBySlot).reduce((a, b) => a + b!, 0), 9);
  });
});
