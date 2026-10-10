// Резервная копия одним кодом (DEVELOPMENT.md "Storage and URLs"): ростер и экипировка — «OGC-GEAR4-» и base62 с CRC-32
// (shared/bits). Номер после OGC-GEAR больше 2: выпущенные версии читают такой код как «новее — обнови страницу».
// В коде — весь ростер (и герои, которых нет в данных), у каждого героя с вещами — пул в прежнем порядке (вещь —
// запись SPEC 1 и дата) и надетое, у каждого закрепившего — закреплённый набор (stat-sets PLAN Д11): по имени билда и
// подписи связки (ключ без id героя), не по номеру в списке outerpedia. Имена и подписи — два словаря: у героев они
// повторяются («Speed», «13x4»), подписей мало — номер в словаре короткий.
// Не переносится (решение 3): незнакомые поля, номера вещей (выдаются заново), порядок ростера, отдельные «жёлтые».
// Общая запись (вещь в пулах двух героев) становится двумя копиями.
// OGC-GEAR3 (до закрепления) читается: выбранный билд, «Не отдавать» и «Собираю / Не собираю» в нём пропускаются.
import { SLOTS, type Index } from '@/game/data';
import { BitReader, BitWriter, seal, unseal, widthOf } from '@/shared/bits';
import type { GearStore, Piece, Worn } from '@/features/gear/model/gear';
import { readBody, readSlot, writeBody, writeSlot } from '@/features/gear/store/pieceCode';
import { readGearCode } from '@/features/gear/store/gearStore';
import { heroCodeIn } from '@/features/gear/store/heroCode';
import { parseRoster } from './rosterCode';

const VERSION = 4;
const OLDEST = 3;
const DAY = 864e5;
const DAY0 = Date.UTC(2024, 0, 1);

// id героя числом (порядок по возрастанию — разницами) или строкой (незнакомый вид id — как есть)
const asNum = (id: string): number | null => (/^[1-9]\d{0,14}$/.test(id) ? Number(id) : null);
// дата записи YYYY-MM-DD → день с 2024-01-01 + 1; не дата или раньше — 0 (пусто: дату никто не читает)
const dayOf = (at: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return 0;
  const t = Date.parse(at + 'T00:00:00Z');
  return Number.isFinite(t) && t >= DAY0 ? Math.round((t - DAY0) / DAY) + 1 : 0;
};
const dateOf = (d: number): string => (d ? new Date(DAY0 + (d - 1) * DAY).toISOString().slice(0, 10) : '');

// хвост ключа после «id/» (билд, «Собираю» в OGC-GEAR3); закрепление «id/билд#подпись» → [билд, подпись]
const tail = (id: string, key: string): string | null => (key.startsWith(id + '/') ? key.slice(id.length + 1) : null);
const pinParts = (id: string, key: string): [string, string] | null => {
  const t = tail(id, key), at = t?.lastIndexOf('#') ?? -1;
  return t && at >= 0 ? [t.slice(0, at), t.slice(at + 1)] : null;
};

export function encodeBackup(st: GearStore, roster: readonly string[]): string {
  const pools = Object.entries(st.pools).filter(([, ids]) => ids.some((id) => st.pieces[id]));
  const pinOf = (id: string) => (st.pin?.[id] ? pinParts(id, st.pin[id]) : null);
  const pinners = Object.keys(st.pin ?? {}).filter((id) => pinOf(id));
  const heroes = [...new Set([...roster, ...pools.map(([id]) => id), ...pinners])];
  if (!heroes.length) return '';
  const nums = heroes.filter((id) => asNum(id) !== null).sort((a, z) => asNum(a)! - asNum(z)!);
  const strs = heroes.filter((id) => asNum(id) === null);
  const inRoster = new Set(roster);
  const poolOf = (id: string): Piece[] => (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter(Boolean);
  // словари: имена билдов, подписи наборов, даты
  const names = [...new Set(pinners.map((id) => pinOf(id)![0]))];
  const sigs = [...new Set(pinners.map((id) => pinOf(id)![1]))];
  const days = [...new Set(heroes.flatMap((id) => poolOf(id).map((p) => dayOf(p.at))))].sort((a, z) => a - z);
  const w = new BitWriter();
  w.vlq(names.length, 3);
  for (const s of names) w.str(s);
  w.vlq(sigs.length, 2);
  for (const s of sigs) w.str(s);
  w.vlq(days.length, 3);
  days.forEach((d, i) => w.vlq(d - (i ? days[i - 1] : 0), 4));
  w.vlq(nums.length, 5);
  nums.forEach((id, i) => w.vlq(asNum(id)! - (i ? asNum(nums[i - 1])! : 0), 4));
  w.vlq(strs.length, 2);
  for (const id of strs) w.str(id);
  const nameBits = widthOf(names.length), sigBits = widthOf(sigs.length), dayBits = widthOf(days.length);
  for (const id of [...nums, ...strs]) {
    w.put(inRoster.has(id) ? 1 : 0, 1);
    // пул и закрепление — признаком «есть» (у большинства героев ростера их нет), пул — затем числом без единицы
    const pool = poolOf(id);
    w.put(pool.length ? 1 : 0, 1);
    if (pool.length) w.vlq(pool.length - 1, 3);
    for (const p of pool) {
      writeSlot(w, p.slot);
      writeBody(w, p);
      w.put(days.indexOf(dayOf(p.at)), dayBits);
    }
    if (pool.length) {
      const worn = st.worn?.[id] ?? {};
      for (const { id: slot } of SLOTS) {
        const same = pool.filter((p) => p.slot === slot);
        const at = same.findIndex((p) => p.id === worn[slot]);
        w.put(at >= 0 ? 1 : 0, 1);
        if (at >= 0) w.put(at, widthOf(same.length));
      }
    }
    const pin = pinOf(id);
    w.put(pin ? 1 : 0, 1);
    if (pin) w.put(names.indexOf(pin[0]), nameBits).put(sigs.indexOf(pin[1]), sigBits);
  }
  return `OGC-GEAR${VERSION}-${seal(w.bits)}`;
}

export interface Backup { roster: string[]; raw: GearStore }
// 'newer' — код сделала более новая версия; 'broken' — наш код, но повреждён или обрезан; null — не этот формат
// (старые OGC-GEAR1 / OGC-GEAR2 — тоже null: их читает features/gear/store/gearStore readGearCode)
export function decodeBackup(text: string): Backup | 'newer' | 'broken' | null {
  const s = text.replace(/\s+/g, '');
  const m = /^OGC-*GEAR(\d+)-+([\s\S]*)$/i.exec(s) ?? /^OGC-*GEAR(\d)([\s\S]*)$/i.exec(s);
  if (!m || Number(m[1]) < OLDEST) return null;
  if (Number(m[1]) > VERSION) return 'newer';
  const bits = unseal(m[2].replace(/-/g, ''));
  if (!bits) return 'broken';
  try {
    return read(new BitReader(bits), Number(m[1]));
  } catch {
    return 'broken';
  }
}

// v — версия кода: 3 — после пула выбранный билд и «Не отдавать», затем «Собираю»; всё это пропускаем; 4 — закрепление
function read(r: BitReader, v: number): Backup {
  const names: string[] = [], sigs: string[] = [];
  for (let n = r.vlq(3); n > 0; n--) names.push(r.str());
  if (v > 3) for (let n = r.vlq(2); n > 0; n--) sigs.push(r.str());
  const days: number[] = [];
  for (let n = r.vlq(3); n > 0; n--) days.push((days.at(-1) ?? 0) + r.vlq(4));
  const heroes: string[] = [];
  let prev = 0;
  for (let n = r.vlq(5); n > 0; n--) { prev += r.vlq(4); heroes.push(String(prev)); }
  for (let n = r.vlq(2); n > 0; n--) heroes.push(r.str());
  const nameBits = widthOf(names.length), sigBits = widthOf(sigs.length), dayBits = widthOf(days.length);
  const word = (list: string[], bits: number) => {
    const s = list[r.get(bits)];
    if (s === undefined) throw new RangeError('name');
    return s;
  };
  const name = () => word(names, nameBits);
  const st: GearStore = { v: 3, seq: 0, pieces: {}, pools: {} };
  const roster: string[] = [];
  const worn: Record<string, Worn> = {}, pin: Record<string, string> = {};
  for (const id of heroes) {
    if (r.get(1)) roster.push(id);
    const pool: Piece[] = [];
    for (let n = r.get(1) ? r.vlq(3) + 1 : 0; n > 0; n--) {
      const slot = readSlot(r);
      const body = readBody(r, slot);
      const day = days[r.get(dayBits)];
      if (day === undefined) throw new RangeError('day');
      pool.push({ id: 'p' + ++st.seq, ...body, at: dateOf(day) });
    }
    if (pool.length) {
      for (const p of pool) st.pieces[p.id] = p;
      st.pools[id] = pool.map((p) => p.id);
      const w: Worn = {};
      for (const { id: slot } of SLOTS) {
        if (!r.get(1)) continue;
        const same = pool.filter((p) => p.slot === slot);
        const p = same[r.get(widthOf(same.length))];
        if (!p) throw new RangeError('worn');
        w[slot] = p.id;
      }
      if (Object.keys(w).length) worn[id] = w;
      if (v === 3) {
        if (r.get(1)) name(); // выбранный билд
        r.get(1);             // «Не отдавать»
      }
    }
    if (v === 3) {
      for (let n = r.get(1) ? r.vlq(2) + 1 : 0; n > 0; n--) { name(); r.get(1); } // «Собираю / Не собираю»
    } else if (r.get(1)) {
      const build = name();
      pin[id] = `${id}/${build}#${word(sigs, sigBits)}`;
    }
  }
  if (r.left) throw new RangeError('tail');
  return {
    roster,
    raw: {
      ...st, ...(Object.keys(worn).length ? { worn } : {}), ...(Object.keys(pin).length ? { pin } : {}),
    },
  };
}

// Что вставили в поле «Резервная копия» (SPEC 2.4): код копии (OGC-GEAR3, OGC-GEAR4); старый код экипировки (OGC-GEAR1, OGC-GEAR2 — как
// есть, проверит loadGear); старый код ростера (slug или id через пробел, запятую, точку с запятой) — узнанные герои;
// код новее; новый код, но повреждён; код героя или ссылка показа; прочее
export type Pasted =
  | { kind: 'backup'; backup: Backup }
  | { kind: 'gear'; raw: unknown }
  | { kind: 'roster'; found: string[]; missed: string[] }
  | { kind: 'newer' | 'broken' | 'hero' | 'noHeroes' | 'bad' };

// похоже на список героев: slug и id через разделители (без них — одно слово строчными или число)
const LIST = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:[\s,;]+[a-z0-9]+(?:-[a-z0-9]+)*)*$/i;
const WORD = /^(?:[a-z]+(?:-[a-z0-9]+)*|\d+)$/;

export function readPasted(idx: Index, text: string): Pasted {
  const s = text.trim();
  if (!s) return { kind: 'bad' };
  if (heroCodeIn(s)) return { kind: 'hero' };
  const b = decodeBackup(s);
  if (b === 'newer' || b === 'broken') return { kind: b };
  if (b) return { kind: 'backup', backup: b };
  const old = readGearCode(s);
  if (old === 'newer') return { kind: 'newer' };
  if (old !== null) return { kind: 'gear', raw: old };
  if (/^OGC/i.test(s)) return { kind: 'bad' };
  const { found, missed } = parseRoster(idx, s);
  if (found.length) return { kind: 'roster', found, missed };
  return LIST.test(s) && (/[\s,;]/.test(s) || WORD.test(s)) ? { kind: 'noHeroes' } : { kind: 'bad' };
}
