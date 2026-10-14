// «Обмен вещами»: понятия (A1, A2) и кандидаты получателя (C1–C9; case tags — MODEL.md §10); сеанс и источники —
// stat-sets TESTS T7.4, вопрос 15; запас других не кандидат — Q1b (owner, 2026-10-12)
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { bestKit } from '@/features/trade/model/kit';
import { codeOf } from '@/features/trade/model/model';
import { candidates } from '@/features/trade/model/cands';
import { slotKey } from '@/features/trade/model/model';
import { advance } from '@/features/trade/model/moves';
import { heroPlan } from '@/features/trade/model/plan';
import { GOOD, HERO, piece, realWorld, store, synthWorld } from './helpers';

const ids = (c: ReturnType<typeof candidates>, slot: SlotId): string[] => (c[slot] ?? []).map((x) => x.item.id);

describe('A. понятия', () => {
  it('A1: вещи, разные только BT, — один код; разные уровни сабстата — разные коды', () => {
    const a = piece('helmet', 'Speed', GOOD, { bt: 0 });
    const b = piece('helmet', 'Speed', GOOD, { bt: 4 });
    const c = piece('helmet', 'Speed', { ...GOOD, SPD: 5 });
    expect(codeOf(a)).toBe(codeOf(b));
    expect(codeOf(a)).not.toBe(codeOf(c));
  });

  it('A2: одна запись в пулах Рин и Ноа, ни на ком не надета — запас обоих, Карен её не берёт (Q1b)', () => {
    const shared = piece('helmet', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [shared, piece('armor', 'Speed')], worn: [] },
      [HERO.noa]: { pool: [shared, piece('armor', 'Speed')], worn: [] },
      [HERO.karen]: { pool: [piece('gloves', 'Life')] },
    });
    // слот шлема у Рин и Ноа известен: отмечен другой надетый шлем
    const hw = (h: string) => { const p = piece('helmet', 'Life'); st.pieces[p.id] = p; st.pools[h].push(p.id); st.worn![h] = { helmet: p.id }; };
    hw(HERO.rin); hw(HERO.noa);
    const c = candidates(realWorld(st), { to: HERO.karen });
    expect(ids(c, 'helmet')).not.toContain(shared.id);
  });

  it('A3 (ревью этапа 10): запись в пулах Карен (надета) и Рин (не надета) — это надетое Карен, не запас Рин', () => {
    const shared = piece('helmet', 'Speed', GOOD);
    const st = store({
      [HERO.karen]: { pool: [shared], worn: [shared] },
      [HERO.rin]: { pool: [shared, piece('armor', 'Speed')], worn: [] },
      [HERO.noa]: { pool: [piece('helmet', 'Life')] },
    });
    // Карен переодета в этом окне: её надетое закрыто — и для Ноа, и для самой Рин (своим запасом его не считаем)
    const w = realWorld(st, undefined, [HERO.karen]);
    expect(ids(candidates(w, { to: HERO.noa }), 'helmet')).not.toContain(shared.id);
    expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).not.toContain(shared.id);
    // окно открыто — кандидат как надетое Карен (цена 3), а не запас
    const open = realWorld(st);
    expect(candidates(open, { to: HERO.noa }).helmet?.filter((x) => x.item.id === shared.id).map((x) => [x.holder, x.cost])).toEqual([[HERO.karen, 3]]);
  });
});

describe('C. кандидаты', () => {
  it('C1: слот не отмечен — своя запасная для него предлагается', () => {
    const spare = piece('helmet', 'Speed');
    const st = store({ [HERO.rin]: { pool: [spare, piece('armor', 'Speed')], worn: [] } });
    const w = realWorld(st);
    expect(w.heroes[0].worn.helmet).toBeUndefined();
    const c = candidates(w, { to: HERO.rin });
    expect(c.helmet?.find((x) => x.item.id === spare.id)?.cost).toBe(1);
  });

  it('T7.4: Карен переодета в этом окне — её надетое не кандидат (запас — тоже, Q1b); член команды впереди — кандидат', () => {
    const kw = piece('gloves', 'Speed'), spare = piece('helmet', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [piece('helmet', 'Life')] },
      [HERO.karen]: { pool: [kw, spare], worn: [kw] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    expect(w.heroes.find((h) => h.id === HERO.karen)?.locked).toBe(true);
    expect(ids(candidates(w, { to: HERO.rin }), 'gloves')).not.toContain(kw.id);
    expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).not.toContain(spare.id);
    expect(ids(candidates(w, { to: HERO.rin, open: new Set([HERO.karen]) }), 'gloves')).toContain(kw.id);
  });

  it('T7.4: окно закрыто (новый мир без блокировок) — надетое Карен снова кандидат', () => {
    const kw = piece('gloves', 'Speed');
    const st = store({ [HERO.rin]: { pool: [piece('helmet', 'Life')] }, [HERO.karen]: { pool: [kw], worn: [kw] } });
    expect(ids(candidates(realWorld(st), { to: HERO.rin }), 'gloves')).toContain(kw.id);
  });

  describe('C3: запас Ноа — не кандидат (Q1b: он держится для Ноа)', () => {
    const noaArmor = piece('armor', 'Speed'), marked = piece('armor', 'Life'), unmarked = piece('helmet', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [piece('gloves', 'Life')] },
      [HERO.noa]: { pool: [noaArmor, marked, unmarked], worn: [noaArmor] },
    });
    const w = realWorld(st);
    it('слот отмечен — не кандидат, надетое — кандидат', () => {
      expect(w.heroes.find((h) => h.id === HERO.noa)?.worn.armor).toBe(noaArmor.id);
      expect(ids(candidates(w, { to: HERO.rin }), 'armor')).toEqual([noaArmor.id]);
    });
    it('слот не отмечен — тоже не кандидат', () => {
      expect(w.heroes.find((h) => h.id === HERO.noa)?.worn.helmet).toBeUndefined();
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).not.toContain(unmarked.id);
    });
  });

  it('C4: у переодетого в этом окне героя не берут ни надетое, ни запас', () => {
    const worn = piece('armor', 'Speed'), spare = piece('armor', 'Life');
    const st = store({
      [HERO.rin]: { pool: [piece('gloves', 'Life')] },
      [HERO.karen]: { pool: [worn, spare], worn: [worn] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    const c = candidates(w, { to: HERO.rin });
    expect(ids(c, 'armor')).not.toContain(worn.id);
    expect(ids(c, 'armor')).not.toContain(spare.id);
  });

  describe('C5: не предлагаются', () => {
    it('оружие не того класса (ranger-оружие для striker)', () => {
      const foreign = piece('weapon', null, GOOD, { itemKey: '647', main: 'ATK%' });
      const open = piece('weapon', null, GOOD, { itemKey: '780', main: 'ATK%' });
      const st = store({
        [HERO.rin]: { pool: [piece('gloves', 'Life')] },
        [HERO.maya]: { pool: [foreign], worn: [foreign] },
        [HERO.noa]: { pool: [open], worn: [open] },
      });
      const c = candidates(realWorld(st), { to: HERO.rin });
      expect(ids(c, 'weapon')).toContain(open.id);
      expect(ids(c, 'weapon')).not.toContain(foreign.id);
    });
    it('a slot kept as it was («Оставить как было»): nothing else in it', () => {
      const nw = piece('helmet', 'Speed');
      const st = store({
        [HERO.rin]: { pool: [piece('gloves', 'Life')] },
        [HERO.noa]: { pool: [nw], worn: [nw] },
      });
      const w = realWorld(st);
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(nw.id);
      expect(ids(candidates(w, { to: HERO.rin, frozen: new Set([slotKey(HERO.rin, 'helmet')]) }), 'helmet')).not.toContain(nw.id);
    });
  });

  describe('C6: код, который у получателя уже есть', () => {
    const build = (bt: 0 | 4) => {
      const mine = piece('helmet', 'Speed', GOOD, { bt: 0 });
      const copy = piece('helmet', 'Speed', GOOD, { bt });
      const st = store({
        [HERO.rin]: { pool: [mine] },
        [HERO.karen]: { pool: [copy], worn: [copy] },
      });
      return { st, mine, copy };
    };
    it('копия с BT 0 — не кандидат', () => {
      const { st, mine, copy } = build(0);
      const w = realWorld(st);
      expect(w.items[mine.id].code).toBe(w.items[copy.id].code);
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).not.toContain(copy.id);
    });
    it('копия с BT 4 — кандидат', () => {
      const { st, copy } = build(4);
      expect(ids(candidates(realWorld(st), { to: HERO.rin }), 'helmet')).toContain(copy.id);
    });
  });

  it('C7: Rin\'s frozen helmet slot does not touch Karen, nor Rin\'s other slots; nobody takes a frozen slot\'s piece', () => {
    const v = piece('helmet', 'Speed'), own = piece('gloves', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [own], worn: [own] },
      [HERO.noa]: { pool: [v], worn: [v] },
      [HERO.karen]: { pool: [piece('armor', 'Life')] },
    });
    const w = realWorld(st);
    const frozen = new Set([slotKey(HERO.rin, 'helmet'), slotKey(HERO.noa, 'helmet')]);
    expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(v.id);
    expect(ids(candidates(w, { to: HERO.rin, frozen: new Set([slotKey(HERO.rin, 'helmet')]) }), 'helmet')).not.toContain(v.id);
    expect(ids(candidates(w, { to: HERO.karen, frozen: new Set([slotKey(HERO.rin, 'helmet')]) }), 'helmet')).toContain(v.id);
    expect(ids(candidates(w, { to: HERO.karen, frozen }), 'helmet')).not.toContain(v.id); // Noa kept hers as it was
    expect(ids(candidates(w, { to: HERO.rin, frozen }), 'gloves')).toContain(own.id);
  });

  it('C8: у героя нет вещей — берёт надетое других (не их запас), надетое переодетых в окне не трогает', () => {
    const nw = piece('helmet', 'Speed'), ns = piece('helmet', 'Life'), kw = piece('gloves', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [] },
      [HERO.noa]: { pool: [nw, ns], worn: [nw] },
      [HERO.karen]: { pool: [kw], worn: [kw] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    expect(w.heroes.some((h) => h.id === HERO.rin)).toBe(false);
    const c = candidates(w, { to: HERO.rin });
    expect(ids(c, 'helmet')).toEqual([nw.id]);
    expect(ids(c, 'helmet')).not.toContain(ns.id);
    expect(ids(c, 'gloves')).not.toContain(kw.id);
  });

  describe('C9: все кандидаты слота исключены', () => {
    it('слот остаётся с надетым', () => {
      const own = piece('helmet', 'Speed'), kw = piece('helmet', 'Life', { ...GOOD, SPD: 5 });
      const st = store({
        [HERO.rin]: { pool: [own], worn: [own] },
        [HERO.karen]: { pool: [kw], worn: [kw] },
      });
      const w = realWorld(st);
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(kw.id);
      const c = candidates(w, { to: HERO.rin, frozen: new Set([slotKey(HERO.rin, 'helmet')]) });
      expect(bestKit(w.gauge(HERO.rin)!, c).slots.helmet?.item.id).toBe(own.id);
    });
    it('пустой слот остаётся пустым', () => {
      const kw = piece('helmet', 'Speed');
      const st = store({
        [HERO.rin]: { pool: [piece('gloves', 'Life')] },
        [HERO.karen]: { pool: [kw], worn: [kw] },
      });
      const w = realWorld(st);
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(kw.id);
      const c = candidates(w, { to: HERO.rin, frozen: new Set([slotKey(HERO.rin, 'helmet')]) });
      expect(ids(c, 'helmet')).toEqual([]);
      expect(bestKit(w.gauge(HERO.rin)!, c).slots.helmet).toBeUndefined();
    });
  });

  it('C10 (Q1b): снятое этим же расчётом — кандидат (обмен двоих), запас до расчёта — нет', () => {
    const w = synthWorld({
      items: { gN: { slot: 'gloves' }, gD: { slot: 'gloves' }, hD: { slot: 'helmet' } },
      heroes: {
        N: { worn: { gloves: 'gN' }, value: { gN: 5, gD: 8, hD: 9 } },
        D: { worn: { gloves: 'gD' }, pool: ['hD'], value: { gD: 5, gN: 20 } },
      },
    });
    expect(ids(candidates(w, { to: 'N' }), 'helmet')).toEqual([]);
    const hp = heroPlan(w, { to: 'D' });
    const w1 = advance(w, { plans: [{ to: 'D', plan: hp.plan }], });
    expect(w1.heroes.find((h) => h.id === 'D')?.worn.gloves).toBe('gN');
    expect(candidates(w1, { to: 'N' }).gloves?.find((c) => c.item.id === 'gD')?.cost).toBe(2);
    expect(ids(candidates(w1, { to: 'N' }), 'helmet')).toEqual([]);
  });

  // MODEL.md §7 item 2, the team trade (owner, 2026-10-13): a teammate's weapon or accessory below the receiver's bar, only
  // where the receiver's own piece is empty or off his list
  describe('C11: a teammate\'s gear below the bar (team)', () => {
    const below = { v: 8, fit: 'no' as const, ok: false };
    const world = (own: 'no' | 'stopgap' | null, extra: { held?: ReadonlySet<string>; parked?: ReadonlySet<string> } = {}) => ({
      ...synthWorld({
        items: { ra: { slot: 'accessory' }, ka: { slot: 'accessory' }, kh: { slot: 'helmet' } },
        heroes: {
          R: { ...(own ? { worn: { accessory: 'ra' } } : {}), value: { ra: { v: 3, fit: own ?? 'no' }, ka: below, kh: below } },
          K: { worn: { accessory: 'ka', helmet: 'kh' }, value: { ka: { v: 5, fit: 'no' }, kh: { v: 5, fit: 'no' } } },
        },
      }), ...extra,
    });
    const mates = new Set(['R', 'K']);
    it('worn by a teammate: off the receiver\'s list or an empty slot — a candidate (cost 3), armor and the one-hero trade — not', () => {
      for (const own of ['no', null] as const) {
        const c = candidates(world(own), { to: 'R', team: mates });
        expect(c.accessory?.filter((x) => x.item.id === 'ka').map((x) => [x.cost, x.holder]), String(own)).toEqual([[3, 'K']]);
        expect(ids(c, 'helmet'), String(own)).toEqual([]);
        expect(ids(candidates(world(own), { to: 'R' }), 'accessory'), String(own)).not.toContain('ka');
        expect(ids(candidates(world(own), { to: 'R', team: new Set(['R']) }), 'accessory'), String(own)).not.toContain('ka');
      }
    });
    it('his own piece is on the list — the bar holds', () => {
      expect(ids(candidates(world('stopgap'), { to: 'R', team: mates }), 'accessory')).toEqual(['ra']);
    });
    it('taken off by this same calculation (cost 2) — a candidate; his spare held for him, a parked one — not', () => {
      const off = { ...world('no'), held: new Set<string>() };
      const w = (parked: ReadonlySet<string>, held: ReadonlySet<string>) => ({
        ...off, parked, held,
        heroes: off.heroes.map((h) => (h.id === 'K' ? { ...h, worn: {}, pool: ['ka', 'kh'] } : h)),
      });
      const none = new Set<string>();
      expect(candidates(w(none, none), { to: 'R', team: mates }).accessory?.map((x) => [x.item.id, x.cost, x.holder])).toEqual([['ra', 0, 'R'], ['ka', 2, 'K']]);
      expect(ids(candidates(w(none, new Set(['ka'])), { to: 'R', team: mates }), 'accessory')).toEqual(['ra']);
      expect(ids(candidates(w(new Set(['ka']), none), { to: 'R', team: mates }), 'accessory')).toEqual(['ra']);
    });
  });

  // HISTORY.md 0220: Redress (pool/info eligibleIn) wears the hero's own filler into his empty slot — the trade offers it too
  it('C12: his own filler (below the bar) into his empty slot — a candidate (cost 1); into a filled slot, or not a filler — not', () => {
    const world = (worn: boolean, filler: boolean) => synthWorld({
      items: { ra: { slot: 'accessory' }, rf: { slot: 'accessory' } },
      heroes: { R: { ...(worn ? { worn: { accessory: 'ra' } } : {}), pool: ['rf'], value: { ra: { v: 3, fit: 'stopgap' }, rf: { v: 1, fit: 'no', ok: false, filler } } } },
    });
    expect(candidates(world(false, true), { to: 'R' }).accessory?.map((x) => [x.item.id, x.cost])).toEqual([['rf', 1]]);
    expect(bestKit(world(false, true).gauge('R')!, candidates(world(false, true), { to: 'R' })).slots.accessory?.item.id).toBe('rf');
    expect(ids(candidates(world(true, true), { to: 'R' }), 'accessory')).toEqual(['ra']);
    expect(ids(candidates(world(false, false), { to: 'R' }), 'accessory')).toEqual([]);
  });
});
