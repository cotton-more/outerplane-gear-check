// Резервная копия одним кодом (.x/0060-share-code SPEC 2): ростер и экипировка — «OGC-GEAR3-» и base62 с CRC-32
// (shared/bits). Номер после OGC-GEAR больше 2: выпущенные версии читают такой код как «новее — обнови страницу».
// В коде — весь ростер (и герои, которых нет в данных), у каждого героя с вещами — пул в прежнем порядке (вещь —
// запись SPEC 1 и дата), надетое, выбранный билд, «Не отдавать»; все «Собираю» и «Не собираю». Билды и отметки — по
// имени билда и подписи связки (ключ без id героя), не по номеру в списке outerpedia.
// Не переносится (решение 3): билды v1, незнакомые поля, номера вещей (выдаются заново), порядок ростера, разовая
// подсказка autoNew, отдельные «жёлтые». Общая запись (вещь в пулах двух героев) становится двумя копиями.
import { SLOTS, type Index } from '@/game/data';
import { BitReader, BitWriter, seal, unseal, widthOf } from '@/shared/bits';
import type { GearStore, Mark, Piece, Worn } from '@/features/gear/model/gear';
import { readBody, readSlot, writeBody, writeSlot } from '@/features/gear/store/pieceCode';
import { readGearCode } from '@/features/gear/store/gearStore';
import { heroCodeIn } from '@/features/gear/store/heroCode';
import { parseRoster } from './rosterCode';

const VERSION = 3;
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

// хвост ключа после «id/» (билд, вариант связки «имя#подпись», «#stats»)
const tail = (id: string, key: string): string | null => (key.startsWith(id + '/') ? key.slice(id.length + 1) : null);

export function encodeBackup(st: GearStore, roster: readonly string[]): string {
  const marks = Object.entries(st.marks ?? {}).filter(([k, m]) => k.includes('/') && (m === 'want' || m === 'skip'));
  const ownerOf = (k: string) => k.slice(0, k.indexOf('/'));
  const pools = Object.entries(st.pools).filter(([, ids]) => ids.some((id) => st.pieces[id]));
  const heroes = [...new Set([...roster, ...pools.map(([id]) => id), ...marks.map(([k]) => ownerOf(k))])];
  if (!heroes.length) return '';
  const nums = heroes.filter((id) => asNum(id) !== null).sort((a, z) => asNum(a)! - asNum(z)!);
  const strs = heroes.filter((id) => asNum(id) === null);
  const inRoster = new Set(roster);
  const poolOf = (id: string): Piece[] => (st.pools[id] ?? []).map((pid) => st.pieces[pid]).filter(Boolean);
  const aimOf = (id: string) => (st.aim?.[id] ? tail(id, st.aim[id]) : null);
  // словари: имена билдов (хвосты ключей) и даты
  const names = [...new Set([...heroes.map(aimOf).filter((x): x is string => !!x), ...marks.map(([k]) => tail(ownerOf(k), k)!)])];
  const days = [...new Set(heroes.flatMap((id) => poolOf(id).map((p) => dayOf(p.at))))].sort((a, z) => a - z);
  const w = new BitWriter();
  w.vlq(names.length, 3);
  for (const s of names) w.str(s);
  w.vlq(days.length, 3);
  days.forEach((d, i) => w.vlq(d - (i ? days[i - 1] : 0), 4));
  w.vlq(nums.length, 5);
  nums.forEach((id, i) => w.vlq(asNum(id)! - (i ? asNum(nums[i - 1])! : 0), 4));
  w.vlq(strs.length, 2);
  for (const id of strs) w.str(id);
  const nameBits = widthOf(names.length), dayBits = widthOf(days.length);
  for (const id of [...nums, ...strs]) {
    w.put(inRoster.has(id) ? 1 : 0, 1);
    // пул и отметки — признаком «есть» (у большинства героев ростера их нет), затем число без единицы
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
      const aim = aimOf(id);
      w.put(aim ? 1 : 0, 1);
      if (aim) w.put(names.indexOf(aim), nameBits);
      w.put(st.pinned?.includes(id) ? 1 : 0, 1);
    }
    const own = marks.filter(([k]) => ownerOf(k) === id);
    w.put(own.length ? 1 : 0, 1);
    if (own.length) w.vlq(own.length - 1, 2);
    for (const [k, m] of own) {
      w.put(names.indexOf(tail(id, k)!), nameBits);
      w.put(m === 'want' ? 1 : 0, 1);
    }
  }
  return `OGC-GEAR${VERSION}-${seal(w.bits)}`;
}

export interface Backup { roster: string[]; raw: GearStore }
// 'newer' — код сделала более новая версия; 'broken' — наш код, но повреждён или обрезан; null — не этот формат
// (старые OGC-GEAR1 / OGC-GEAR2 — тоже null: их читает features/gear/store/gearStore readGearCode)
export function decodeBackup(text: string): Backup | 'newer' | 'broken' | null {
  const s = text.replace(/\s+/g, '');
  const m = /^OGC-*GEAR(\d+)-+([\s\S]*)$/i.exec(s) ?? /^OGC-*GEAR(\d)([\s\S]*)$/i.exec(s);
  if (!m || Number(m[1]) < VERSION) return null;
  if (Number(m[1]) > VERSION) return 'newer';
  const bits = unseal(m[2].replace(/-/g, ''));
  if (!bits) return 'broken';
  try {
    return read(new BitReader(bits));
  } catch {
    return 'broken';
  }
}

function read(r: BitReader): Backup {
  const names: string[] = [];
  for (let n = r.vlq(3); n > 0; n--) names.push(r.str());
  const days: number[] = [];
  for (let n = r.vlq(3); n > 0; n--) days.push((days.at(-1) ?? 0) + r.vlq(4));
  const heroes: string[] = [];
  let prev = 0;
  for (let n = r.vlq(5); n > 0; n--) { prev += r.vlq(4); heroes.push(String(prev)); }
  for (let n = r.vlq(2); n > 0; n--) heroes.push(r.str());
  const nameBits = widthOf(names.length), dayBits = widthOf(days.length);
  const name = () => {
    const s = names[r.get(nameBits)];
    if (s === undefined) throw new RangeError('name');
    return s;
  };
  const st: GearStore = { v: 2, seq: 0, pieces: {}, pools: {} };
  const roster: string[] = [];
  const worn: Record<string, Worn> = {}, aim: Record<string, string> = {}, marks: Record<string, Mark> = {}, pinned: string[] = [];
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
      if (r.get(1)) aim[id] = `${id}/${name()}`;
      if (r.get(1)) pinned.push(id);
    }
    for (let n = r.get(1) ? r.vlq(2) + 1 : 0; n > 0; n--) {
      const k = `${id}/${name()}`;
      marks[k] = r.get(1) ? 'want' : 'skip';
    }
  }
  if (r.left) throw new RangeError('tail');
  return {
    roster,
    raw: {
      ...st,
      ...(Object.keys(marks).length ? { marks } : {}), ...(Object.keys(worn).length ? { worn } : {}),
      ...(Object.keys(aim).length ? { aim } : {}), ...(pinned.length ? { pinned } : {}),
    },
  };
}

// Что вставили в поле «Резервная копия» (SPEC 2.4): новый код; старый код экипировки (OGC-GEAR1, OGC-GEAR2 — как
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
