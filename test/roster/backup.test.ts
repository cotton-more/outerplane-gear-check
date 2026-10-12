// Резервная копия одним кодом (DEVELOPMENT.md "Storage and URLs"): вещь в коде, ростер и экипировка туда и обратно,
// размер, целостность, совместимость с выпущенными версиями; OGC-GEAR4 — с закреплением (stat-sets PLAN Д11), OGC-GEAR5 —
// с N героя («сколько крита нужно герою», crit), OGC-GEAR6 — со звёздами героя (transcend), OGC-GEAR7 — с эффом из игры
// (.x/0200-boss Q3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { pinOptions } from '@/game/build/profile';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { loadGear, readGearCode, readsWhole } from '@/features/gear/store/gearStore';
import { decodeBackup, encodeBackup, type Backup } from '@/features/roster/backup';
import { seal, unseal } from '@/shared/bits';

const D: Dataset = JSON.parse(readFileSync(new URL('../fixtures/data.json', import.meta.url), 'utf8'));
const idx = createIndex(D);
const char = (name: string) => D.chars.find((c) => c.name === name)!.id;
const set = (short: string) => D.sets.find((s) => s.short === short)!.id;
const [CAREN, KAPPA, RIN, ANARKY] = ['Caren', 'Kappa', 'Rin', 'Anarky'].map(char);

let seq = 0;
const P = (slot: SlotId, x: Partial<Piece> = {}): Piece => ({
  id: 'p' + ++seq, slot, grade: 'unique', setId: null, itemKey: null, main: null,
  yellow: { CHC: 2, SPD: 1 }, lit: { CHC: 2, SPD: 1 }, bt: null, at: '2026-10-01', ...x,
});
const sub = (lit: Piece['lit']) => ({ lit, yellow: Object.fromEntries(Object.entries(lit).map(([k, n]) => [k, Math.min(n, 4)])) });
const store = (pieces: Piece[], pools: Record<string, string[]>, extra: Partial<GearStore> = {}): GearStore =>
  ({ v: 3, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...extra });

const round = (st: GearStore, roster: string[] = []): Backup => {
  const b = decodeBackup(encodeBackup(st, roster));
  if (!b || typeof b === 'string') throw new Error(String(b));
  return b;
};
// смысл хранилища: вещи — содержимым в порядке пула, надетое — содержимым
const content = ({ id: _, ...p }: Piece) => JSON.stringify(Object.fromEntries(Object.entries(p).sort()));
const meaning = (st: GearStore) => ({
  pools: Object.fromEntries(Object.entries(st.pools).map(([h, ids]) => [h, ids.map((id) => content(st.pieces[id]))])),
  worn: Object.fromEntries(Object.entries(st.worn ?? {}).map(([h, w]) => [h, Object.fromEntries(Object.entries(w).map(([s, id]) => [s, content(st.pieces[id!])]))])),
  pin: st.pin ?? {},
  crit: st.crit ?? {},
  eff: st.eff ?? {},
});

describe('1. вещь в коде', () => {
  it('1.1 все виды вещей → копия → поля совпадают', () => {
    const W = (x: Partial<Piece>) => P('weapon', x);
    const pieces = [
      P('helmet', { setId: set('Speed'), ...sub({ 'DEF%': 2, CHC: 3, CHD: 1 }), bt: 0 }),
      P('armor', { setId: null, ...sub({ HP: 1, DEF: 1, ATK: 1, RES: 6 }), bt: 4 }),
      W({ itemKey: '638', main: 'ATK%', ...sub({ SPD: 5, CHC: 4, CHD: 3, 'ATK%': 2 }), bt: 2 }),
      P('accessory', { itemKey: '1798:mage', main: 'PEN%', ...sub({ EFF: 1, CHC: 1, SPD: 1 }) }),
      P('accessory', { unlisted: true, main: 'CHD', ...sub({ SPD: 1, CHC: 1, CHD: 1, HP: 1 }), bt: 0 }),
      W({ grade: 'rare', main: 'DEF%', ...sub({ RES: 1, EFF: 1, HP: 1 }), bt: 4 }),
      P('accessory', { grade: 'rare', main: 'HP%', ...sub({ 'DMG RED%': 2, 'DEF%': 3, DEF: 2 }) }),
      P('gloves', { grade: 'rare', setId: set('Speed'), ...sub({ 'DMG UP%': 6, 'HP%': 5, CHC: 4, CHD: 2 }), bt: 0 }),
      W({ main: null, ...sub({ CHC: 1 }) }),
      P('shoes', { setId: set('Speed'), ...sub({}) }),
    ];
    const st = store(pieces, { [CAREN]: pieces.map((p) => p.id) });

    const back = round(st).raw;

    expect(meaning(back).pools).toEqual(meaning(st).pools);
  });

  it('1.2 порядок сабстатов «SPD, CHC, ATK, CHD» сохраняется', () => {
    const p = P('helmet', { setId: set('Speed'), ...sub({ SPD: 1, CHC: 2, ATK: 3, CHD: 4 }) });
    const back = round(store([p], { [CAREN]: [p.id] })).raw;
    expect(Object.keys(back.pieces.p1.lit)).toEqual(['SPD', 'CHC', 'ATK', 'CHD']);
  });

  it('1.3 сет и предмет, которых нет в данных, — номер на месте', () => {
    const a = P('helmet', { setId: '99' }), b = P('weapon', { itemKey: '99999:healer', main: 'ATK%' });
    const back = round(store([a, b], { [CAREN]: [a.id, b.id] })).raw;
    expect([back.pieces.p1.setId, back.pieces.p2.itemKey]).toEqual(['99', '99999:healer']);
  });

  it('1.4 старая правка: «жёлтые» не «уровень, но не выше 4» → после копии — «уровень, но не выше 4»', () => {
    const p = P('helmet', { setId: set('Speed'), yellow: { CHC: 1, SPD: 1 }, lit: { CHC: 6, SPD: 3 } });
    const back = round(store([p], { [CAREN]: [p.id] })).raw.pieces.p1;
    expect([back.lit, back.yellow]).toEqual([{ CHC: 6, SPD: 3 }, { CHC: 4, SPD: 3 }]);
  });
});

describe('2. резервная копия', () => {
  const combo = pinOptions(idx.CHAR[ANARKY]).find((o) => o.build.name === 'Defense mix')!;
  const [carenPin] = pinOptions(idx.CHAR[CAREN]);
  const roster10 = D.chars.slice(0, 6).map((c) => c.id).concat([CAREN, KAPPA, RIN, ANARKY]);
  const rich = () => {
    const c = [P('helmet', { setId: set('Speed') }), P('weapon', { itemKey: '781:striker', main: 'DEF%' }), P('helmet', { setId: set('Immunity'), at: '2026-09-28' })];
    const k = [P('armor', { setId: set('Speed'), bt: 4 }), P('accessory', { grade: 'rare', main: 'SPD' })];
    const r = [P('gloves', { setId: set('Defense') })];
    const a = [P('shoes', { setId: set('Penetration'), bt: 0, at: '' })];
    return store([...c, ...k, ...r, ...a], { [CAREN]: c.map((p) => p.id), [KAPPA]: k.map((p) => p.id), [RIN]: r.map((p) => p.id), [ANARKY]: a.map((p) => p.id) }, {
      worn: { [CAREN]: { helmet: c[2].id, weapon: c[1].id }, [KAPPA]: { armor: k[0].id } },
      pin: { [CAREN]: carenPin.key, [ANARKY]: combo.key },
    });
  };

  it('2.1 ростер из 10, у 4 вещи: надето и закрепление (и набор связки) — всё совпадает', () => {
    const st = rich();

    const b = round(st, roster10);

    expect(meaning(b.raw)).toEqual(meaning(st));
    expect(new Set(b.roster)).toEqual(new Set(roster10));
    expect(b.raw.pieces[b.raw.pools[CAREN][2]].at).toBe('2026-09-28');
  });

  it('2.2 закрепление у героя без вещей — на месте', () => {
    const [k] = pinOptions(idx.CHAR[RIN]);
    expect(round(store([], {}, { pin: { [RIN]: k.key } }), [RIN]).raw.pin).toEqual({ [RIN]: k.key });
  });

  it('2.3 id ростера, которого нет в данных, — на месте; и не число тоже', () => {
    expect(new Set(round(store([], {}), [CAREN, '2999999', 'x-hero']).roster)).toEqual(new Set([CAREN, '2999999', 'x-hero']));
  });

  it('2.4 общая запись у двух героев — две одинаковые вещи, по одной в пуле, обе надеты', () => {
    const p = P('helmet', { setId: set('Speed') });
    const st = store([p], { [CAREN]: [p.id], [KAPPA]: [p.id] }, { worn: { [CAREN]: { helmet: p.id }, [KAPPA]: { helmet: p.id } } });

    const back = round(st).raw;

    expect(back.pools[CAREN]).not.toEqual(back.pools[KAPPA]);
    expect(meaning(back)).toEqual(meaning(st));
  });

  it('2.5 незнакомые поля и поля прежней модели — не переносятся; остальное совпадает', () => {
    const st = { ...rich(), v1builds: { x: 1 }, note: 'x', autoNew: [`${CAREN}/Speed`], aim: { [CAREN]: `${CAREN}/Speed` }, marks: { [combo.key]: 'want' }, pinned: [KAPPA] };
    (Object.values(st.pieces)[0] as unknown as Record<string, unknown>).enh = 15;

    const back = round(st, roster10).raw;

    expect(Object.keys(back).sort()).toEqual(['pieces', 'pin', 'pools', 'seq', 'v', 'worn']);
    expect(Object.values(back.pieces).some((p) => 'enh' in p)).toBe(false);
    expect(meaning(back)).toEqual(meaning(rich()));
  });

  // N героев × 6 вещей (Legendary, у оружия и аксессуара — самые длинные номера предметов)
  const big = (heroes: number) => {
    const ids = D.chars.slice(0, heroes).map((c) => c.id);
    const pieces: Piece[] = [], pools: Record<string, string[]> = {}, worn: Record<string, Record<string, string>> = {};
    ids.forEach((h, i) => {
      const day = `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`;
      const six = [
        P('weapon', { itemKey: '786:mage', main: 'ATK%', ...sub({ SPD: 3, CHC: 4, CHD: 5, 'ATK%': 2 }), bt: 4, at: day }),
        P('accessory', { itemKey: '1798:healer', main: 'PEN%', ...sub({ SPD: 6, CHC: 1, CHD: 2, 'HP%': 3 }), bt: 0, at: day }),
        ...(['helmet', 'armor', 'gloves', 'shoes'] as const).map((s, j) => P(s, { setId: String(1 + ((i + j) % 21)), ...sub({ 'DEF%': 2, CHC: 3, CHD: 1, SPD: 4 }), bt: 4, at: day })),
      ];
      pieces.push(...six);
      pools[h] = six.map((p) => p.id);
      worn[h] = Object.fromEntries(six.map((p) => [p.slot, p.id]));
    });
    const pin = Object.fromEntries(ids.flatMap((h) => pinOptions(idx.CHAR[h]).slice(0, 1).map((o) => [h, o.key])));
    return store(pieces, pools, { worn, pin });
  };

  // 2.6 размер: лимита длины нет (владелец 2026-10-06, stat-sets (old MODEL «Этап 8»)): с закреплением у всех 40 код ≈ 2 450
  // знаков, а копия одной строкой всё равно лучше прежнего. Большая копия читается без потерь
  it('2.6 40 × 6, ростер из 75, набор закреплён у всех — туда и обратно без потерь', () => {
    const roster75 = D.chars.slice(0, 75).map((c) => c.id);
    expect(meaning(round(big(40), roster75).raw)).toEqual(meaning(big(40)));
  });

  it('2.2 вид: без пробелов, только буквы и цифры после префикса', () => {
    expect(encodeBackup(rich(), roster10)).toMatch(/^OGC-GEAR7-[0-9A-Za-z]+$/);
  });

  it('2.7 начинается с OGC-GEAR и номера больше 2; разбор выпущенной версии — «код новее»', () => {
    const code = encodeBackup(rich(), roster10);
    const m = /^OGC-GEAR(\d+)\s*([\s\S]+)$/.exec(code.trim())!; // правило выпущенной версии
    expect(Number(m[1])).toBeGreaterThan(2);
    expect(readGearCode(code)).toBe('newer');
  });

  describe('2.8 целостность', () => {
    const code = encodeBackup(rich(), roster10);
    const head = 'OGC-GEAR7-'.length;
    const body = code.slice(head);
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'a' ? 'b' : 'a') + s.slice(i + 1);
    const sw = [...body].findIndex((ch, i) => i >= 10 && ch !== body[i + 1]); // соседние разные знаки
    const cases: [string, string][] = [
      ['без последнего знака', code.slice(0, -1)],
      ['обрезан наполовину', code.slice(0, head + Math.floor(body.length / 2))],
      ['изменён первый знак', code.slice(0, head) + flip(body, 0)],
      ['изменён средний знак', code.slice(0, head) + flip(body, Math.floor(body.length / 2))],
      ['изменён последний знак', code.slice(0, head) + flip(body, body.length - 1)],
      ['переставлены соседние', code.slice(0, head) + body.slice(0, sw) + body[sw + 1] + body[sw] + body.slice(sw + 2)],
      ['лишний знак посередине', code.slice(0, head) + body.slice(0, 20) + 'Q' + body.slice(20)],
    ];
    it.each(cases)('%s — «повреждён»', (_, bad) => {
      expect(decodeBackup(bad)).toBe('broken');
    });
    // a code whose CRC is valid but the stars field is out of range (the field is the 3 bits before the EFF flag of a
    // stars-only code)
    it.each([0, 7])('звёзды %i при верной сумме — «повреждён»', (n) => {
      const bits = unseal(encodeBackup(store([], {}, { stars: { [CAREN]: 5 } }), []).replace('OGC-GEAR7-', ''))!;
      const bad = [...bits.slice(0, -4), (n >> 2) & 1, (n >> 1) & 1, n & 1, 0];
      expect(decodeBackup(`OGC-GEAR7-${seal(bits)}`)).not.toBe('broken'); // the untouched code reads
      expect(decodeBackup(`OGC-GEAR7-${seal(bad)}`)).toBe('broken');
    });
    // the same for the typed EFF: an EFF-only code ends with the two 14-bit numbers; 0 and 10 000+ are out of range
    it.each([0, 10000])('эфф %i при верной сумме — «повреждён»', (n) => {
      const bits = unseal(encodeBackup(store([], {}, { eff: { [CAREN]: { typed: 466, at: 233 } } }), []).replace('OGC-GEAR7-', ''))!;
      const num = Array.from({ length: 14 }, (_, i) => (n >> (13 - i)) & 1);
      expect(decodeBackup(`OGC-GEAR7-${seal(bits)}`)).not.toBe('broken');
      expect(decodeBackup(`OGC-GEAR7-${seal([...bits.slice(0, -28), ...num, ...bits.slice(-14)])}`)).toBe('broken');
      expect(decodeBackup(`OGC-GEAR7-${seal([...bits.slice(0, -14), ...num])}`)).toBe('broken');
    });
    it('обрезан на любую длину — «повреждён»', () => {
      for (let n = head; n < code.length; n++) expect(decodeBackup(code.slice(0, n))).toBe('broken');
    });
  });

  it('2.9 разбит пробелами, переносами и дефисами — читается', () => {
    const code = encodeBackup(rich(), roster10);
    const split = code.replace(/(.{40})/g, '$1\n ').replace(/(.{13})/, '$1-');
    expect(meaning((decodeBackup(split) as Backup).raw)).toEqual(meaning(rich()));
  });

  it('2.10 номер формата выше известного — «новее»', () => {
    expect(decodeBackup('OGC-GEAR8-abc')).toBe('newer');
    expect(decodeBackup('OGC-GEAR12-abc')).toBe('newer');
  });

  // код, записанный до закрепления (этап 7, 099d038): у Caren выбран билд, у Kappa «Не отдавать», «Собираю» у варианта
  // связки Anarky (героя без вещей) и «Не собираю» у Caren
  it('T8.2 OGC-GEAR3 читается: ростер, пулы и надетое — как были; выбранный билд, «Не отдавать» и «Собираю» пропущены', () => {
    const V3 = 'OGC-GEAR3-3qSzQxVDxEYoW5B8ix0gK0lRFYHH8XEPopeDMk3sAkAWDl17Y9xzqVmLeKaECkvdTslw8Kltv0ksVaBpmUeafy9pWCDZHoJzur';
    const helmet = P('helmet', { setId: set('Speed') }), weapon = P('weapon', { itemKey: '781:striker', main: 'DEF%' });
    const armor = P('armor', { setId: set('Speed'), bt: 4 });
    const was = store([helmet, weapon, armor], { [CAREN]: [helmet.id, weapon.id], [KAPPA]: [armor.id] },
      { worn: { [CAREN]: { weapon: weapon.id }, [KAPPA]: { armor: armor.id } } });

    const b = decodeBackup(V3) as Backup;

    expect(new Set(b.roster)).toEqual(new Set([CAREN, KAPPA, RIN, ANARKY]));
    expect(meaning(b.raw)).toEqual(meaning(was));
    expect(Object.keys(b.raw).sort()).toEqual(['pieces', 'pools', 'seq', 'v', 'worn']);
  });

  // код выпущенной версии (OGC-GEAR4, до N героя): у Caren шлем Critical Hit T4 надет, Epic аксессуар CHC в пуле, набор
  // закреплён; Kappa — только в ростере
  it('OGC-GEAR4 читается: ростер, пулы, надетое и закрепление — как были; N нет ни у кого', () => {
    const V4 = 'OGC-GEAR4-5FuSLopk01xvOAdOZxrQU5hUCyjDGaSk68R3nNam3ZE2aDbT4';
    const helmet = P('helmet', { setId: '4', bt: 4, at: '2026-10-01' });
    const acc = P('accessory', { grade: 'rare', main: 'CHC', ...sub({ CHD: 3 }), bt: 0, at: '2026-10-02' });
    const was = store([helmet, acc], { [CAREN]: [helmet.id, acc.id] },
      { worn: { [CAREN]: { helmet: helmet.id } }, pin: { [CAREN]: `${CAREN}/Speed#13x4` } });

    const b = decodeBackup(V4) as Backup;

    expect(new Set(b.roster)).toEqual(new Set([CAREN, KAPPA]));
    expect(meaning(b.raw)).toEqual(meaning(was));
    expect(b.raw.crit).toBeUndefined();
  });

  // a code of the released version (OGC-GEAR5, before the hero's stars): Caren — Critical Hit helmet T4 worn, N 85; Rin — roster only
  it('OGC-GEAR5 читается: ростер, пулы, надетое и N — как были; звёзд нет ни у кого', () => {
    const V5 = 'OGC-GEAR5-4s46wWFOniHTydTAYBow5JJqDEXLQ';
    const helmet = P('helmet', { setId: set('Critical Hit'), ...sub({ CHC: 2, SPD: 1 }), bt: 4, at: '2026-10-01' });
    const was = store([helmet], { [CAREN]: [helmet.id] }, { worn: { [CAREN]: { helmet: helmet.id } }, crit: { [CAREN]: 85 } });

    const b = decodeBackup(V5) as Backup;

    expect(new Set(b.roster)).toEqual(new Set([CAREN, RIN]));
    expect(meaning(b.raw)).toEqual(meaning(was));
    expect(b.raw.crit).toEqual({ [CAREN]: 85 });
    expect(b.raw.stars).toBeUndefined();
  });

  // a code of the released version (OGC-GEAR6, before the typed EFF): Caren — Critical Hit helmet T4 worn, N 85, ★5; Rin — roster only
  it('OGC-GEAR6 читается: ростер, пулы, надетое, N и звёзды — как были; эффа из игры нет ни у кого', () => {
    const V6 = 'OGC-GEAR6-2Vu7aCdwner1TI3cwfkEYvrOQku8Dq';
    const helmet = P('helmet', { setId: set('Critical Hit'), ...sub({ CHC: 2, SPD: 1 }), bt: 4, at: '2026-10-01' });
    const was = store([helmet], { [CAREN]: [helmet.id] }, { worn: { [CAREN]: { helmet: helmet.id } }, crit: { [CAREN]: 85 } });

    const b = decodeBackup(V6) as Backup;

    expect(new Set(b.roster)).toEqual(new Set([CAREN, RIN]));
    expect(meaning(b.raw)).toEqual(meaning(was));
    expect(b.raw.stars).toEqual({ [CAREN]: 5 });
    expect(b.raw.eff).toBeUndefined();
  });

  it('эфф из игры: туда и обратно, вместе с N и звёздами, и у героя без вещей; без него — поля нет', () => {
    const helmet = P('helmet', { setId: set('Speed') });
    const eff = { [CAREN]: { typed: 466, at: 233 }, [RIN]: { typed: 9999, at: 1 } };
    const st = store([helmet], { [CAREN]: [helmet.id] }, { crit: { [CAREN]: 85 }, stars: { [CAREN]: 5 }, eff });
    const b = round(st, [CAREN, RIN]);
    expect(b.raw.eff).toEqual(eff);
    expect([b.raw.crit, b.raw.stars]).toEqual([{ [CAREN]: 85 }, { [CAREN]: 5 }]);
    expect(round(store([helmet], { [CAREN]: [helmet.id] }), [CAREN]).raw.eff).toBeUndefined();
    expect(round(store([], {}, { eff: { [KAPPA]: { typed: 300, at: 150 } } })).raw.eff).toEqual({ [KAPPA]: { typed: 300, at: 150 } });
    // a hero out of the roster: the load drops it (like N and stars)
    expect(loadGear(round(store([], {}, { eff })).raw, idx, [CAREN]).st.eff).toEqual({ [CAREN]: eff[CAREN] });
  });

  it('эфф из игры: 0, 10 000 и нецелое в код не пишутся', () => {
    const bad = { [CAREN]: { typed: 0, at: 233 }, [RIN]: { typed: 466, at: 10000 }, [KAPPA]: { typed: 46.5, at: 233 } };
    expect(encodeBackup(store([], {}, { eff: bad }), [])).toBe('');
  });

  it('звёзды героя: туда и обратно, вместе с N, и у героя без вещей, N и закрепления; без звёзд — поля нет', () => {
    const helmet = P('helmet', { setId: set('Speed') });
    const st = store([helmet], { [CAREN]: [helmet.id] }, { crit: { [CAREN]: 85 }, stars: { [CAREN]: 5, [RIN]: 6, [KAPPA]: 1 } });
    const b = round(st, [CAREN]);
    expect(b.raw.stars).toEqual({ [CAREN]: 5, [RIN]: 6, [KAPPA]: 1 });
    expect(b.raw.crit).toEqual({ [CAREN]: 85 });
    expect(round(store([helmet], { [CAREN]: [helmet.id] }, { crit: { [CAREN]: 85 } }), [CAREN]).raw.stars).toBeUndefined();
    expect(round(store([], {}, { stars: { [RIN]: 4 } })).raw.stars).toEqual({ [RIN]: 4 });
  });

  it('звёзды: 0, 7 и нецелое в код не пишутся', () => {
    const st = store([], {}, { stars: { [CAREN]: 0, [RIN]: 7, [KAPPA]: 3.5 } as Record<string, number> });
    expect(encodeBackup(st, [])).toBe('');
    expect(round(store([], {}, { stars: { [CAREN]: 5, [RIN]: 0 } as Record<string, number> })).raw.stars).toEqual({ [CAREN]: 5 });
  });

  it('N героя: туда и обратно, и у героя без вещей и без закрепления; 100 (по умолчанию) в код не пишется', () => {
    const helmet = P('helmet', { setId: set('Speed') });
    const st = store([helmet], { [CAREN]: [helmet.id] }, { crit: { [CAREN]: 85, [RIN]: 0, [KAPPA]: 100 } });
    const b = round(st, [CAREN]);
    expect(b.raw.crit).toEqual({ [CAREN]: 85, [RIN]: 0 });
    expect(b.roster).toEqual([CAREN]);
    // Rin is not in the roster: the load drops her N (owner 2026-10-12 — a hero out of the roster has no data)
    expect(meaning(loadGear(b.raw, idx, b.roster).st).crit).toEqual({ [CAREN]: 85 });
    expect(meaning(loadGear(b.raw, idx, [CAREN, RIN]).st).crit).toEqual({ [CAREN]: 85, [RIN]: 0 });
  });

  it('старые коды и прочее — не этот формат', () => {
    expect([decodeBackup('OGC-GEAR2 eyJ2IjoyfQ'), decodeBackup('caren, kappa'), decodeBackup('')]).toEqual([null, null, null]);
  });

  it('2.17 пусто: ни ростера, ни вещей — кода нет; только ростер — код восстанавливает ростер', () => {
    expect(encodeBackup(store([], {}), [])).toBe('');
    expect(round(store([], {}), [CAREN, KAPPA]).roster).toEqual([CAREN, KAPPA].sort());
  });

  it('2.18 после загрузки — того же вида, что до фичи: проверка хранилища читает целиком', () => {
    const b = round(rich(), roster10);
    const r = loadGear(b.raw, idx, b.roster);
    expect(readsWhole(JSON.parse(JSON.stringify(r.st)), idx)).toBe(true);
    expect(meaning(r.st)).toEqual(meaning(rich()));
  });
});
