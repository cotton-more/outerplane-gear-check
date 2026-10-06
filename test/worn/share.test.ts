// «Показать героя» (.x/0060-share-code SPEC 3.2): код героя туда и обратно, закреплённый набор по отпечатку (.x/0085 этап 6),
// длина, целостность.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { pinOptions } from '@/game/build/profile';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { decodeHero, encodeHero, heroCodeIn, type HeroShare } from '@/features/gear/store/heroCode';
import { shareCodeOf, shownStore } from '@/features/worn/share';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const char = (name: string) => D.chars.find((c) => c.name === name)!;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const [caren, anarky, cfEternal] = ['Caren', 'Anarky', 'Core Fusion Eternal'].map(char);

const P = (id: string, slot: SlotId, x: Partial<Piece> = {}): Piece =>
  ({ id, slot, grade: 'unique', setId: null, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: null, at: '2026-10-01', ...x });
const SIX = (): Piece[] => [
  P('p1', 'weapon', { grade: 'rare', main: 'ATK%', lit: { SPD: 3, CHC: 2, CHD: 1 }, yellow: { SPD: 3, CHC: 2, CHD: 1 }, bt: 4 }),
  P('p2', 'accessory', { itemKey: '1798:mage', main: 'PEN%', lit: { SPD: 6, CHC: 5, CHD: 4, 'ATK%': 3 }, yellow: { SPD: 4, CHC: 4, CHD: 4, 'ATK%': 3 }, bt: 0 }),
  ...(['helmet', 'armor', 'gloves', 'shoes'] as const).map((s, i) => P('p' + (3 + i), s, { setId: set('Speed'), lit: { 'DEF%': 2, CHC: 3, CHD: 1, SPD: i + 1 }, yellow: { 'DEF%': 2, CHC: 3, CHD: 1, SPD: i + 1 }, bt: i % 2 ? 4 : null })),
];
const wearing = (c: { id: string }, pieces: Piece[]): GearStore => ({
  v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools: { [c.id]: pieces.map((p) => p.id) },
  worn: { [c.id]: Object.fromEntries(pieces.map((p) => [p.slot, p.id])) },
});
const codeOf = (c: { id: string }, st: GearStore, pin: string | null = null) => shareCodeOf(idx.CHAR[c.id], st, Object.values(st.pieces), pin)!;
const back = (code: string) => decodeHero(code) as HeroShare;
const body = ({ id: _i, at: _a, ...p }: Piece) => p;

describe('3.2 код героя', () => {
  it('3.3 шесть надетых всех видов (Epic оружие на T4, Legendary аксессуар с классом), набор закреплён — всё совпадает', () => {
    const pin = pinOptions(caren)[1];
    const s = back(codeOf(caren, wearing(caren, SIX()), pin.key));
    const shown = shownStore(idx, s);

    expect(s.heroId).toBe(caren.id);
    expect(Object.fromEntries(Object.entries(s.slots).map(([k, p]) => [k, p]))).toEqual(Object.fromEntries(SIX().map((p) => [p.slot, body(p)])));
    expect(shown.pin).toEqual({ [caren.id]: pin.key });
    expect(shown.worn?.[caren.id]).toBeTruthy();
  });

  it('3.4 надето 4 из 6 — два слота пустые', () => {
    const s = back(codeOf(caren, wearing(caren, SIX().slice(2))));
    expect(Object.keys(s.slots).sort()).toEqual(['armor', 'gloves', 'helmet', 'shoes']);
  });

  it('3.5 не закреплён — в коде «По статам», карточка без набора; вариант связки — тот же набор', () => {
    expect(shownStore(idx, back(codeOf(caren, wearing(caren, SIX())))).pin).toBeUndefined();
    const combo = pinOptions(anarky)[2];
    expect(shownStore(idx, back(codeOf(anarky, wearing(anarky, SIX()), combo.key))).pin).toEqual({ [anarky.id]: combo.key });
  });

  it('3.6 билды героя переставлены — набор тот же; билд переименован — без набора', () => {
    const pin = pinOptions(caren).find((o) => o.build.name === 'Def')!;
    const code = codeOf(caren, wearing(caren, SIX()), pin.key);
    const swapped: Dataset = { ...D, chars: D.chars.map((c) => (c.id === caren.id ? { ...c, builds: [...c.builds].reverse() } : c)) };
    const renamed: Dataset = { ...D, chars: D.chars.map((c) => (c.id === caren.id ? { ...c, builds: c.builds.map((b) => (b.name === 'Def' ? { ...b, name: 'Defense' } : b)) } : c)) };

    expect(shownStore(createIndex(swapped), back(code)).pin).toEqual({ [caren.id]: pin.key });
    expect(shownStore(createIndex(renamed), back(code)).pin).toBeUndefined();
  });

  it('3.7 шесть вещей и самое длинное имя билда — после # не больше 64 знаков; Core Fusion — тоже', () => {
    const longest = D.chars.flatMap((c) => pinOptions(c).map((v) => ({ c, v }))).sort((a, z) => z.v.key.length - a.v.key.length)[0];
    const code = encodeHero(longest.c.id, Object.fromEntries(SIX().map((p) => [p.slot, p])), longest.v.key)!;
    const cf = encodeHero(cfEternal.id, Object.fromEntries(SIX().map((p) => [p.slot, p])), `${cfEternal.id}/${cfEternal.builds[0].name}`)!;
    expect(code.length).toBeLessThanOrEqual(64);
    expect(cf.length).toBeLessThanOrEqual(64);
    expect(back(cf).heroId).toBe(cfEternal.id);
  });

  it('ничего не надето — кода нет', () => {
    expect(shareCodeOf(caren, { ...wearing(caren, SIX()), worn: {} }, SIX(), null)).toBeNull();
  });

  describe('3.15 целостность', () => {
    const code = codeOf(caren, wearing(caren, SIX()));
    const flip = (i: number) => code.slice(0, i) + (code[i] === 'a' ? 'b' : 'a') + code.slice(i + 1);
    it.each([
      ['без последнего знака', code.slice(0, -1)],
      ['изменён знак', flip(10)],
      ['лишний знак', code.slice(0, 20) + 'Q' + code.slice(20)],
      ['переставлены соседние', code.slice(0, 8) + code[9] + code[8] + code.slice(10)],
    ])('%s — «повреждена»', (_, bad) => {
      expect(code[8]).not.toBe(code[9]);
      expect(decodeHero(bad)).toBe('broken');
    });
    it('обрезан на любую длину — «повреждена»', () => {
      for (let n = 3; n < code.length; n++) expect(decodeHero(code.slice(0, n))).toBe('broken');
    });
  });

  it('код новее этой версии — «новее»', async () => {
    const { BitWriter, seal } = await import('@/shared/bits');
    expect(decodeHero('OGH' + seal(new BitWriter().put(2, 4).put(0, 20).bits))).toBe('newer');
  });

  it('из ссылки, с пробелами и переносами — тот же код; не код героя — null', () => {
    const code = codeOf(caren, wearing(caren, SIX()));
    expect(heroCodeIn(`https://x.io/outerplane-gear/#${code}`)).toBe(code);
    expect(heroCodeIn(code.slice(0, 20) + '\n ' + code.slice(20))).toBe(code);
    expect([heroCodeIn('OGC KXRM TPWA'), heroCodeIn('#caren'), heroCodeIn('OGH')]).toEqual([null, null, null]);
  });
});
