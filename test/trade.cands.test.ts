// «Обмен вещами»: понятия (A1, A2) и кандидаты получателя (C1–C9), .x/0040-trade/TESTS.md
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { bestKit } from '@/features/trade/model/kit';
import { codeOf } from '@/features/trade/model/model';
import { candidates, skipKey, slotKey } from '@/features/trade/model/cands';
import { GOOD, HERO, piece, realWorld, store } from './trade.helpers';

const ids = (c: ReturnType<typeof candidates>, slot: SlotId): string[] => (c[slot] ?? []).map((x) => x.item.id);

describe('A. понятия', () => {
  it('A1: вещи, разные только BT, — один код; разные уровни сабстата — разные коды', () => {
    const a = piece('helmet', 'Speed', GOOD, { bt: 0 });
    const b = piece('helmet', 'Speed', GOOD, { bt: 4 });
    const c = piece('helmet', 'Speed', { ...GOOD, SPD: 5 });
    expect(codeOf(a)).toBe(codeOf(b));
    expect(codeOf(a)).not.toBe(codeOf(c));
  });

  it('A2: одна запись в пулах Рин и Ноа — для Карен две вещи с разными держателями', () => {
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
    const got = (c.helmet ?? []).filter((x) => x.item.id === shared.id);
    expect(got.map((x) => x.holder).sort()).toEqual([HERO.noa, HERO.rin].sort());
  });
  it.todo('A2: взяли у Ноа — у Рин осталась (применение, этап 4)');
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

  it('C2: надетое закреплённой Карен — не кандидат; в одной команде — кандидат', () => {
    const kw = piece('gloves', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [piece('helmet', 'Life')] },
      [HERO.karen]: { pool: [kw], worn: [kw] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    expect(w.heroes.find((h) => h.id === HERO.karen)?.pinned).toBe(true);
    expect(ids(candidates(w, { to: HERO.rin }), 'gloves')).not.toContain(kw.id);
    expect(ids(candidates(w, { to: HERO.rin, team: [HERO.rin, HERO.karen] }), 'gloves')).toContain(kw.id);
    expect(ids(candidates(w, { to: HERO.rin, team: [HERO.karen] }), 'gloves')).not.toContain(kw.id);
  });

  describe('C3: запас Ноа', () => {
    const noaArmor = piece('armor', 'Speed'), marked = piece('armor', 'Life'), unmarked = piece('helmet', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [piece('gloves', 'Life')] },
      [HERO.noa]: { pool: [noaArmor, marked, unmarked], worn: [noaArmor] },
    });
    const w = realWorld(st);
    it('слот отмечен — кандидат', () => {
      expect(w.heroes.find((h) => h.id === HERO.noa)?.worn.armor).toBe(noaArmor.id);
      expect(ids(candidates(w, { to: HERO.rin }), 'armor')).toContain(marked.id);
    });
    it('слот не отмечен — не кандидат', () => {
      expect(w.heroes.find((h) => h.id === HERO.noa)?.worn.helmet).toBeUndefined();
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).not.toContain(unmarked.id);
    });
    it('слот освобождён этим расчётом — кандидат', () => {
      const c = candidates(w, { to: HERO.rin, freed: new Set([slotKey(HERO.noa, 'helmet')]) });
      expect(ids(c, 'helmet')).toContain(unmarked.id);
    });
  });

  it('C4: запас закреплённого героя — кандидат', () => {
    const worn = piece('armor', 'Speed'), spare = piece('armor', 'Life');
    const st = store({
      [HERO.rin]: { pool: [piece('gloves', 'Life')] },
      [HERO.karen]: { pool: [worn, spare], worn: [worn] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    const c = candidates(w, { to: HERO.rin });
    expect(ids(c, 'armor')).not.toContain(worn.id);
    expect(c.armor?.find((x) => x.item.id === spare.id)?.cost).toBe(2);
  });

  describe('C5: не предлагаются', () => {
    it('оружие не того класса (ranger-оружие для striker)', () => {
      const foreign = piece('weapon', null, GOOD, { itemKey: '647', main: 'ATK%' });
      const open = piece('weapon', null, GOOD, { itemKey: '780', main: 'ATK%' });
      const st = store({
        [HERO.rin]: { pool: [piece('gloves', 'Life')] },
        [HERO.maya]: { pool: [foreign, open], worn: [foreign] },
      });
      const c = candidates(realWorld(st), { to: HERO.rin });
      expect(ids(c, 'weapon')).toContain(open.id);
      expect(ids(c, 'weapon')).not.toContain(foreign.id);
    });
    it('вещь после «Не брать»', () => {
      const nw = piece('helmet', 'Speed');
      const st = store({
        [HERO.rin]: { pool: [piece('gloves', 'Life')] },
        [HERO.noa]: { pool: [nw], worn: [nw] },
      });
      const w = realWorld(st);
      expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(nw.id);
      expect(ids(candidates(w, { to: HERO.rin, skip: new Set([skipKey(nw.id, HERO.rin)]) }), 'helmet')).not.toContain(nw.id);
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

  it('C7: «Не брать» для Рин не действует на Карен и на свою надетую вещь Рин', () => {
    const v = piece('helmet', 'Speed'), own = piece('gloves', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [own], worn: [own] },
      [HERO.noa]: { pool: [v], worn: [v] },
      [HERO.karen]: { pool: [piece('armor', 'Life')] },
    });
    const w = realWorld(st);
    const skip = new Set([skipKey(v.id, HERO.rin), skipKey(own.id, HERO.rin)]);
    expect(ids(candidates(w, { to: HERO.rin }), 'helmet')).toContain(v.id);
    expect(ids(candidates(w, { to: HERO.rin, skip }), 'helmet')).not.toContain(v.id);
    expect(ids(candidates(w, { to: HERO.karen, skip }), 'helmet')).toContain(v.id);
    expect(ids(candidates(w, { to: HERO.rin, skip }), 'gloves')).toContain(own.id);
  });

  it('C8: у героя нет вещей — берёт надетое незакреплённых и чужой запас, закреплённых надетое не трогает', () => {
    const nw = piece('helmet', 'Speed'), ns = piece('helmet', 'Life'), kw = piece('gloves', 'Speed');
    const st = store({
      [HERO.rin]: { pool: [] },
      [HERO.noa]: { pool: [nw, ns], worn: [nw] },
      [HERO.karen]: { pool: [kw], worn: [kw] },
    });
    const w = realWorld(st, undefined, [HERO.karen]);
    expect(w.heroes.some((h) => h.id === HERO.rin)).toBe(false);
    const c = candidates(w, { to: HERO.rin });
    expect(ids(c, 'helmet').sort()).toEqual([nw.id, ns.id].sort());
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
      const c = candidates(w, { to: HERO.rin, skip: new Set([skipKey(kw.id, HERO.rin), skipKey(own.id, HERO.rin)]) });
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
      const c = candidates(w, { to: HERO.rin, skip: new Set([skipKey(kw.id, HERO.rin)]) });
      expect(ids(c, 'helmet')).toEqual([]);
      expect(bestKit(w.gauge(HERO.rin)!, c).slots.helmet).toBeUndefined();
    });
    it.todo('C9: пустой слот — подсказка (этап 3)');
  });
});
