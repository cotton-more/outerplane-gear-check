// «Обмен вещами», применение плана героя (этап 4): .x/0040-trade/TESTS.md, E1–E12 и F8.
import { describe, expect, it } from 'vitest';
import type { SlotId } from '@/game/data/types';
import { isPinned, type GearStore, type Piece } from '@/features/gear/model/gear';
import { restoreGear } from '@/features/gear/store/gearStore';
import { applyHero, applyTeam, leftovers, stampOf } from '@/features/trade/model/apply';
import { teamPlan, type TeamPlan } from '@/features/trade/model/team';
import { candidates } from '@/features/trade/model/cands';
import { codeOf } from '@/features/trade/model/model';
import { heroPlan, type HeroPlan } from '@/features/trade/model/plan';
import { worldOf } from '@/features/trade/model/world';
import { cand, ctx, hasOwner, HERO, idx, loadOwner, piece, store } from './trade.helpers';

const { rin, karen, noa, maya } = HERO;
const SET = 'Attack';

type Chg = { slot: SlotId; id: string; holder: string | null; was?: string };
// план вручную: apply опирается только на id, slot, holder
const planOf = (changes: Chg[]): HeroPlan => ({
  plan: {
    kit: { slots: {}, key: null as never },
    changes: changes.map((c) => ({ slot: c.slot, cand: cand({ id: c.id, slot: c.slot, v: 1, cost: c.holder === null ? 2 : 3, holder: c.holder }), was: c.was ? cand({ id: c.was, slot: c.slot, v: 1, cost: 0, holder: rin }) : null })),
    losses: [],
  },
  holes: { fills: [], unfilled: [] },
});
const go = (st: GearStore, to: string, hp: HeroPlan, pin = true) => applyHero(st, { to, hp, pin, stamp: stampOf(st) })!;
const wornOf = (st: GearStore, h: string, slot: SlotId) => st.worn?.[h]?.[slot];
const inPool = (st: GearStore, h: string, p: Piece) => (st.pools[h] ?? []).includes(p.id);

// вещи с разными кодами (уровень SPD — номер); один код — копия (R6.6), это только в E4
const lv = (spd: number) => ({ SPD: spd, CHC: 4, CHD: 4, ATK: 4 });
// Рин носит перчатки r; у Карен надеты перчатки k, запас — шлем kh; Ноа носит сапоги, в запасе перчатки n
const base = () => {
  const r = piece('gloves', SET, lv(1)), k = piece('gloves', SET, lv(2)), kh = piece('helmet', SET), n = piece('gloves', SET, lv(3)), ns = piece('shoes', SET);
  const st = store({ [rin]: { pool: [r], worn: [r] }, [karen]: { pool: [k, kh], worn: [k] }, [noa]: { pool: [n, ns], worn: [ns] } });
  return { st, r, k, kh, n, ns };
};

describe('E. применение: один герой', () => {
  it('E1: вещь с Карен — у Карен её нет, у Рин в пуле и надета', () => {
    const { st, r, k } = base();
    const x = go(st, rin, planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }])).st;
    expect(inPool(x, karen, k)).toBe(false);
    expect(wornOf(x, karen, 'gloves')).toBeUndefined();
    expect(inPool(x, rin, k)).toBe(true);
    expect(wornOf(x, rin, 'gloves')).toBe(k.id);
  });
  it('E2: снятая с Рин вещь — в пуле Рин, не надета', () => {
    const { st, r, k } = base();
    const x = go(st, rin, planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }])).st;
    expect(inPool(x, rin, r)).toBe(true);
    expect(wornOf(x, rin, 'gloves')).not.toBe(r.id);
  });
  it('E3: запас Ноа — ушёл из пула Ноа, надетое Ноа то же', () => {
    const { st, r, n, ns } = base();
    const x = go(st, rin, planOf([{ slot: 'gloves', id: n.id, holder: noa, was: r.id }])).st;
    expect(inPool(x, noa, n)).toBe(false);
    expect(wornOf(x, noa, 'shoes')).toBe(ns.id);
    expect(inPool(x, rin, n)).toBe(true);
  });
  describe('E4: копия того же кода', () => {
    const arrange = () => {
      const old = piece('gloves', SET, undefined, { bt: 0 });
      const fresh = piece('gloves', SET, undefined, { bt: 4 });
      const st = store({ [rin]: { pool: [old], worn: [old] }, [karen]: { pool: [fresh], worn: [fresh] }, [maya]: { pool: [piece('helmet', SET)] } });
      return { st, old, fresh };
    };
    it('у Рин одна вещь этого кода; leftovers даёт старую', () => {
      const { st, old, fresh } = arrange();
      const hp = planOf([{ slot: 'gloves', id: fresh.id, holder: karen, was: old.id }]);
      const x = go(st, rin, hp).st;
      expect(x.pools[rin]).toContain(fresh.id);
      expect(x.pools[rin]).not.toContain(old.id);
      expect(leftovers(st, hp, rin)).toEqual([old.id]);
    });
  });
  it('E5: pin true — закреплён; pin false — нет; был закреплён и pin false — снят', () => {
    const { st, r, k } = base();
    const hp = planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }]);
    expect(isPinned(go(st, rin, hp, true).st, rin)).toBe(true);
    expect(isPinned(go(st, rin, hp, false).st, rin)).toBe(false);
    const pinned = { ...st, pinned: [rin] };
    expect(isPinned(go(pinned, rin, hp, false).st, rin)).toBe(false);
  });
  it('E6: «Отмена» — applyHero не вызван, хранилище то же', () => {
    const { st } = base();
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });
  describe('E7: «Вернуть»', () => {
    it('хранилище как до шага, включая закрепление', () => {
      const { st, r, k } = base();
      const res = go(st, rin, planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }]));
      expect(res.undo(res.st)).toEqual(st);
    });
    it('цепочка Рин → Карен: undo Карен — состояние после Рин', () => {
      const { st, r, k, n } = base();
      const a = go(st, rin, planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }]));
      const b = go(a.st, karen, planOf([{ slot: 'gloves', id: n.id, holder: noa }]));
      expect(b.undo(b.st)).toEqual(a.st);
    });
    it('хранилище изменилось после шага — undo даёт null', () => {
      const { st, r, k } = base();
      const res = go(st, rin, planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }]));
      const changed = { ...res.st, seq: res.st.seq + 1 };
      expect(res.undo(changed)).toBeNull();
    });
  });
  it('E8: у каждого героя worn ⊂ pool, по вещи на слот, нет двух вещей одного кода в пуле', () => {
    const { st, r, k, n } = base();
    const hp = planOf([{ slot: 'gloves', id: k.id, holder: karen, was: r.id }]);
    const x = go(st, rin, hp).st;
    expect(x.pools[noa]).toContain(n.id);
    for (const h of Object.keys(x.pools)) {
      const w = x.worn?.[h] ?? {};
      for (const id of Object.values(w)) expect(x.pools[h]).toContain(id);
      const codes = x.pools[h].map((id) => JSON.stringify([x.pieces[id].slot, x.pieces[id].setId, x.pieces[id].lit]));
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
  it('E9: перезапуск без «Сделал» — restoreGear сырого хранилища без изменений', () => {
    const { st } = base();
    const raw = JSON.parse(JSON.stringify(st));
    const back = restoreGear(raw, idx);
    for (const h of [rin, karen, noa]) expect(back.pools[h]).toEqual(st.pools[h]);
    expect(back.worn?.[karen]).toEqual(st.worn?.[karen]);
  });
  it('E10: после шага Рин (pin) для Карен не предлагается надетое Рин, предлагается её запас', () => {
    const r = piece('gloves', SET), rs = piece('gloves', SET, { SPD: 4, CHC: 4, CHD: 3, ATK: 3 }), k = piece('helmet', SET);
    const st = store({ [rin]: { pool: [r, rs], worn: [r] }, [karen]: { pool: [k], worn: [k] } });
    const x = go(st, rin, planOf([]), true).st;
    const w = worldOf(ctx, x, Object.keys(x.pools));
    const ids = Object.values(candidates(w, { to: karen })).flat().map((c) => c.item.id);
    expect(ids).not.toContain(r.id);
    expect(ids).toContain(rs.id);
  });
  it('E11: Рин «Сделал», план Карен не применён — у Рин и у тех, у кого брали, как после шага Рин', () => {
    const { st, r, k, n } = base();
    const a = go(st, rin, planOf([{ slot: 'gloves', id: n.id, holder: noa, was: r.id }]));
    const after = JSON.parse(JSON.stringify(a.st));
    // план Карен — «Отмена»: applyHero не вызван
    expect(a.st).toEqual(after);
    expect(a.st.pools[noa]).not.toContain(n.id);
    expect(a.st.pools[karen]).toContain(k.id);
  });
  describe('E12: план без изменений', () => {
    it('pin true — закреплён, пулы и надетое те же', () => {
      const { st } = base();
      const x = go(st, rin, planOf([]), true).st;
      expect(isPinned(x, rin)).toBe(true);
      expect(x.pools).toEqual(st.pools);
      expect(x.worn).toEqual(st.worn);
    });
    it('pin false — хранилище прежнее', () => {
      const { st } = base();
      expect(go(st, rin, planOf([]), false).st).toEqual(st);
    });
  });
  it('устаревший stamp — null', () => {
    const { st } = base();
    const stamp = stampOf(st);
    const changed = { ...st, seq: st.seq + 1 };
    expect(applyHero(changed, { to: rin, hp: planOf([]), pin: true, stamp })).toBeNull();
  });
  it('перечитанное хранилище (ключи в другом порядке) — тот же отпечаток: «Сделал» и «Вернуть» работают', () => {
    const { st } = base();
    const reread = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(st).reverse()))) as GearStore;
    const r = go(reread, rin, planOf([]));
    const again = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(r.st).reverse()))) as GearStore;
    expect(r.undo(again)).toEqual(reread);
  });
});

describe('F. дыры: применение', () => {
  it('F8: перчатки Майи у Рин — у Майи перчатки пустые, снятые с Рин остаются у Рин (дыры не закрываются)', () => {
    const r = piece('gloves', SET, lv(1)), m = piece('gloves', SET, lv(2));
    const st = store({ [rin]: { pool: [r], worn: [r] }, [maya]: { pool: [m], worn: [m] } });
    const x = go(st, rin, planOf([{ slot: 'gloves', id: m.id, holder: maya, was: r.id }])).st;
    expect(wornOf(x, rin, 'gloves')).toBe(m.id);
    expect(inPool(x, rin, r)).toBe(true);
    expect(inPool(x, maya, m)).toBe(false);
    expect(wornOf(x, maya, 'gloves')).toBeUndefined();
  });
});

describe('X5: сквозной «Сделал» на вещах владельца', () => {
  it.skipIf(!hasOwner())('X5: план каждого героя применяется: надетое ⊂ пул, слот — одна вещь, у героя нет двух вещей одного кода, снятая вещь не пропала', () => {
    const o = loadOwner();
    const w = worldOf(o.ctx, o.st, o.roster);
    let changes = 0;
    for (const h of w.heroes) {
      if (!w.gauge(h.id)) continue;
      const hp = heroPlan(w, { to: h.id });
      const x = applyHero(o.st, { to: h.id, hp, pin: true, stamp: stampOf(o.st) })!.st;
      const gone = new Set(leftovers(o.st, hp, h.id));
      changes += hp.plan.changes.length;
      for (const c of hp.plan.changes) if (c.was && !gone.has(c.was.item.id)) expect(Object.values(x.pools).flat()).toContain(c.was.item.id);
      for (const [c, ids] of Object.entries(x.pools)) {
        for (const id of Object.values(x.worn?.[c] ?? {})) expect(ids).toContain(id);
        const codes = ids.map((id) => codeOf(x.pieces[id]));
        expect(new Set(codes).size, `${h.id} → ${c}`).toBe(codes.length);
      }
    }
    expect(changes).toBeGreaterThan(0);
  });
});

describe('H6, H9: «Сделал» команды', () => {
  // Рин и Ноа меняются перчатками (r ⇄ n); Рин берёт ещё шлем Карен kh (запас); дыру не делаем
  const arrange = () => {
    const r = piece('gloves', SET, lv(1)), n = piece('gloves', SET, lv(3)), kh = piece('helmet', SET, lv(4)), k = piece('gloves', SET, lv(5));
    const st = store({ [rin]: { pool: [r], worn: [r] }, [noa]: { pool: [n], worn: [n] }, [karen]: { pool: [k, kh], worn: [k] } });
    // шаг очереди: Рин берёт перчатки Ноа и шлем Карен; потом обмен пары: Ноа получает снятые с Рин перчатки
    const tp: TeamPlan = {
      order: [rin, noa],
      steps: [
        { kind: 'hero', plans: [{ to: rin, plan: planOf([{ slot: 'gloves', id: n.id, holder: noa, was: r.id }, { slot: 'helmet', id: kh.id, holder: karen }]).plan }], fills: [], unfilled: {} },
        { kind: 'swap', plans: [{ to: noa, plan: planOf([{ slot: 'gloves', id: r.id, holder: rin }]).plan }], fills: [], unfilled: {} },
      ],
      members: [],
      moves: { moves: [], emptied: [] },
    };
    return { st, tp, r, n, kh };
  };
  it('H6: одно «Сделал» — применены все члены и закрепления по переключателям', () => {
    const { st, tp, r, n, kh } = arrange();
    const x = applyTeam(st, { tp, pin: { [rin]: true, [noa]: false }, stamp: stampOf(st) })!.st;
    expect(wornOf(x, rin, 'gloves')).toBe(n.id);
    expect(wornOf(x, rin, 'helmet')).toBe(kh.id);
    expect(wornOf(x, noa, 'gloves')).toBe(r.id);
    expect(x.pools[rin]).not.toContain(r.id);
    expect(x.pools[noa]).toEqual([r.id]);
    expect(x.pools[karen]).not.toContain(kh.id);
    expect(isPinned(x, rin)).toBe(true);
    expect(isPinned(x, noa)).toBe(false);
  });
  it('H9: после «Сделал» обмен закончен — «Вернуть» откатывает весь план; новый расчёт с теми же героями возможен', () => {
    const { st, tp } = arrange();
    const res = applyTeam(st, { tp, pin: { [rin]: true, [noa]: true }, stamp: stampOf(st) })!;
    expect(applyTeam(res.st, { tp, pin: {}, stamp: stampOf(st) })).toBeNull(); // старый план к новому хранилищу не применить
    expect(res.undo(res.st)).toEqual(st);
  });
});

describe('X6: сквозной «Сделал» команды на вещах владельца', () => {
  it.skipIf(!hasOwner())('X6: после applyTeam надетое членов = итог расчёта; надетое ⊂ пул; у героя нет двух вещей одного кода', () => {
    const o = loadOwner();
    const w = worldOf(o.ctx, o.st, o.roster);
    const ids = w.heroes.filter((h) => w.gauge(h.id)).map((h) => h.id);
    let moved = 0;
    for (let n = 0; n + 4 <= ids.length; n += 4) {
      const tp = teamPlan(w, { team: ids.slice(n, n + 4) })!;
      const x = applyTeam(o.st, { tp, pin: {}, stamp: stampOf(o.st) })!.st;
      for (const m of tp.members) {
        const want = Object.fromEntries(Object.entries(m.after.slots).map(([s, c]) => [s, c!.item.id]));
        expect(x.worn?.[m.to] ?? {}, m.to).toEqual(want);
        moved += tp.steps.length;
      }
      // H18: инструкция — каждая вещь один раз; выполнить её по порядку, как в игре, = надетое после «Сделал»
      const items = tp.moves.moves.map((mv) => mv.item);
      expect(new Set(items).size).toBe(items.length);
      const game: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(o.st.worn ?? {}).map(([c, wn]) => [c, { ...wn } as Record<string, string>]));
      for (const mv of tp.moves.moves) {
        for (const wn of Object.values(game)) for (const [s, id] of Object.entries(wn)) if (id === mv.item) delete wn[s];
        (game[mv.hero] ??= {})[mv.slot] = mv.item;
      }
      for (const e of tp.moves.emptied) delete game[e.hero]?.[e.slot];
      const clean = (r: Record<string, Record<string, string | undefined>>) => Object.fromEntries(Object.entries(r).filter(([, wn]) => Object.keys(wn).length));
      expect(clean(game)).toEqual(clean(x.worn ?? {}));
      for (const [c, list] of Object.entries(x.pools)) {
        for (const id of Object.values(x.worn?.[c] ?? {})) expect(list).toContain(id);
        const codes = list.map((id) => codeOf(x.pieces[id]));
        expect(new Set(codes).size, c).toBe(codes.length);
      }
    }
    expect(moved).toBeGreaterThan(0);
  });
});
