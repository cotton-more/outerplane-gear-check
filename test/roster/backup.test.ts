// Резервная копия одним кодом (.x/0060-share-code SPEC 1, 2, 5): вещь в коде, ростер и экипировка туда и обратно,
// размер, целостность, совместимость с выпущенными версиями.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset, SlotId } from '@/game/data/types';
import { variantsOf } from '@/game/build/variants';
import type { GearStore, Piece } from '@/features/gear/model/gear';
import { loadGear, readGearCode, readsWhole } from '@/features/gear/store/gearStore';
import { decodeBackup, encodeBackup, type Backup } from '@/features/roster/backup';

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
  ({ v: 2, seq: pieces.length, pieces: Object.fromEntries(pieces.map((p) => [p.id, p])), pools, ...extra });

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
  aim: st.aim ?? {}, marks: st.marks ?? {}, pinned: [...(st.pinned ?? [])].sort(),
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
  const combo = variantsOf(idx, idx.CHAR[ANARKY]).find((v) => v.sig)!;
  const roster10 = D.chars.slice(0, 6).map((c) => c.id).concat([CAREN, KAPPA, RIN, ANARKY]);
  const rich = () => {
    const c = [P('helmet', { setId: set('Speed') }), P('weapon', { itemKey: '781:striker', main: 'DEF%' }), P('helmet', { setId: set('Immunity'), at: '2026-09-28' })];
    const k = [P('armor', { setId: set('Speed'), bt: 4 }), P('accessory', { grade: 'rare', main: 'SPD' })];
    const r = [P('gloves', { setId: set('Defense') })];
    const a = [P('shoes', { setId: set('Penetration'), bt: 0, at: '' })];
    return store([...c, ...k, ...r, ...a], { [CAREN]: c.map((p) => p.id), [KAPPA]: k.map((p) => p.id), [RIN]: r.map((p) => p.id), [ANARKY]: a.map((p) => p.id) }, {
      worn: { [CAREN]: { helmet: c[2].id, weapon: c[1].id }, [KAPPA]: { armor: k[0].id } },
      aim: { [CAREN]: `${CAREN}/Speed/Immu`, [ANARKY]: combo.key },
      marks: { [combo.key]: 'want', [`${CAREN}/Pen`]: 'skip', [`${D.chars[0].id}/${D.chars[0].builds[0].name}`]: 'want' },
      pinned: [KAPPA],
    });
  };

  it('2.1 ростер из 10, у 4 вещи: надето, билды, «Собираю» у варианта связки, «Не собираю», «Не отдавать» — всё совпадает', () => {
    const st = rich();

    const b = round(st, roster10);

    expect(meaning(b.raw)).toEqual(meaning(st));
    expect(new Set(b.roster)).toEqual(new Set(roster10));
    expect(b.raw.pieces[b.raw.pools[CAREN][2]].at).toBe('2026-09-28');
  });

  it('2.2 «Собираю» у героя без вещей — на месте', () => {
    const k = `${RIN}/${idx.CHAR[RIN].builds[0].name}`;
    expect(round(store([], {}, { marks: { [k]: 'want' } })).raw.marks).toEqual({ [k]: 'want' });
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

  it('2.5 билды v1, незнакомые поля, autoNew — не переносятся; остальное совпадает', () => {
    const st = { ...rich(), v1builds: { x: 1 }, note: 'x', autoNew: [`${CAREN}/Speed`] };
    (Object.values(st.pieces)[0] as unknown as Record<string, unknown>).enh = 15;

    const back = round(st, roster10).raw;

    expect(Object.keys(back).sort()).toEqual(['aim', 'marks', 'pieces', 'pinned', 'pools', 'seq', 'v', 'worn']);
    expect(Object.values(back.pieces).some((p) => 'enh' in p)).toBe(false);
    expect(meaning(back)).toEqual(meaning(rich()));
  });

  // 14 героев × 6 вещей (Legendary, у оружия и аксессуара — самые длинные номера предметов), ростер 75
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
    const aim = Object.fromEntries(ids.map((h) => [h, `${h}/${idx.CHAR[h].builds[0]?.name ?? '#stats'}`]));
    return store(pieces, pools, { worn, aim });
  };

  it('2.6 размер: 14 × 6 и ростер из 75 — не длиннее 1 000; 40 × 6 — не длиннее 2 400', () => {
    const roster75 = D.chars.slice(0, 75).map((c) => c.id);
    const a = encodeBackup(big(14), roster75), b = encodeBackup(big(40), roster75);
    expect(a.length).toBeLessThanOrEqual(1000);
    expect(b.length).toBeLessThanOrEqual(2400);
    expect(meaning(round(big(40), roster75).raw)).toEqual(meaning(big(40)));
  });

  it('2.2 вид: без пробелов, только буквы и цифры после префикса', () => {
    expect(encodeBackup(rich(), roster10)).toMatch(/^OGC-GEAR3-[0-9A-Za-z]+$/);
  });

  it('2.7 начинается с OGC-GEAR и номера больше 2; разбор выпущенной версии — «код новее»', () => {
    const code = encodeBackup(rich(), roster10);
    const m = /^OGC-GEAR(\d+)\s*([\s\S]+)$/.exec(code.trim())!; // правило выпущенной версии
    expect(Number(m[1])).toBeGreaterThan(2);
    expect(readGearCode(code)).toBe('newer');
  });

  describe('2.8 целостность', () => {
    const code = encodeBackup(rich(), roster10);
    const head = 'OGC-GEAR3-'.length;
    const body = code.slice(head);
    const flip = (s: string, i: number) => s.slice(0, i) + (s[i] === 'a' ? 'b' : 'a') + s.slice(i + 1);
    const cases: [string, string][] = [
      ['без последнего знака', code.slice(0, -1)],
      ['обрезан наполовину', code.slice(0, head + Math.floor(body.length / 2))],
      ['изменён первый знак', code.slice(0, head) + flip(body, 0)],
      ['изменён средний знак', code.slice(0, head) + flip(body, Math.floor(body.length / 2))],
      ['изменён последний знак', code.slice(0, head) + flip(body, body.length - 1)],
      ['переставлены соседние', code.slice(0, head) + body.slice(0, 10) + body[11] + body[10] + body.slice(12)],
      ['лишний знак посередине', code.slice(0, head) + body.slice(0, 20) + 'Q' + body.slice(20)],
    ];
    it.each(cases)('%s — «повреждён»', (_, bad) => {
      expect(body[10]).not.toBe(body[11]);
      expect(decodeBackup(bad)).toBe('broken');
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
    expect(decodeBackup('OGC-GEAR4-abc')).toBe('newer');
    expect(decodeBackup('OGC-GEAR12-abc')).toBe('newer');
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
