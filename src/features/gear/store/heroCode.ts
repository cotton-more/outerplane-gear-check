// Код героя для показа по ссылке (.x/0060-share-code SPEC 3.2): «OGH» и base62 с CRC-32 (shared/bits). Ссылка — адрес
// сайта и код после «#»: всё после «#» браузер на сервер не шлёт. В коде — номер формата, герой, по слоту — надетая
// вещь (запись SPEC 1, без даты) или «пусто», и закреплённый набор (.x/0085 PLAN Д9; «По статам» — не закреплён).
// Набор — отпечатком имени билда и подписи (24 бита): узнаётся, даже если outerpedia переставила билды, и код не растёт
// от длины имени (≤ 64 знаков). Коды до закрепления несли отпечаток выбранного билда — он ни с одним набором не
// совпадает, карточка показывается без набора.
import { SLOTS, type Index } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import { pinOptions } from '@/game/build/profile';
import { BitReader, BitWriter, seal, unseal } from '@/shared/bits';
import type { Piece } from '@/features/gear/model/gear';
import { readBody, writeBody, type PieceBody } from './pieceCode';

export const HERO_PREFIX = 'OGH';
const VERSION = 1;
// герой: обычный (2000000 + n), Core Fusion (2700000 + n) или любой номер как есть
const BASES = [2000000, 2700000, 0];
const HASH_BITS = 24;

// код героя из вставленного текста: сам код или ссылка с ним после «#». Пробелы, переносы и дефисы (мессенджер, игрок)
// не мешают. Не код героя — null
export function heroCodeIn(text: string): string | null {
  const s = text.replace(/[\s-]+/g, '');
  const at = s.lastIndexOf('#');
  const code = at >= 0 ? s.slice(at + 1) : s;
  return code.startsWith(HERO_PREFIX) && code.length > HERO_PREFIX.length ? code : null;
}

// отпечаток имени билда (FNV-1a по UTF-8, младшие 24 бита)
function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h % 2 ** HASH_BITS;
}
const tail = (key: string) => key.slice(key.indexOf('/') + 1);

export type HeroBuild = { kind: 'stats' } | { kind: 'named'; hash: number } | { kind: 'none' };
export interface HeroShare { heroId: string; slots: Partial<Record<SlotId, PieceBody>>; build: HeroBuild }

// pin — ключ закрепления (profile pinKey), null — «По статам». null — героя таким номером не записать (id не число)
export function encodeHero(heroId: string, worn: Partial<Record<SlotId, Piece>>, pin: string | null): string | null {
  if (!/^[1-9]\d{0,14}$/.test(heroId)) return null;
  const n = Number(heroId);
  const base = BASES.findIndex((b, i) => n >= b && (i === BASES.length - 1 || n - b < 700000));
  const w = new BitWriter().put(VERSION, 4).put(base, 2).vlq(n - BASES[base], 7);
  for (const { id: slot } of SLOTS) {
    const p = worn[slot];
    w.put(p ? 1 : 0, 1);
    if (p) writeBody(w, p);
  }
  if (pin === null) w.put(1, 2);
  else w.put(2, 2).put(hashOf(tail(pin)), HASH_BITS);
  return HERO_PREFIX + seal(w.bits);
}

// 'newer' — код сделала более новая версия; 'broken' — повреждён или обрезан
export function decodeHero(code: string): HeroShare | 'newer' | 'broken' {
  const bits = code.startsWith(HERO_PREFIX) ? unseal(code.slice(HERO_PREFIX.length)) : null;
  if (!bits) return 'broken';
  try {
    const r = new BitReader(bits);
    const v = r.get(4);
    if (v > VERSION) return 'newer';
    if (v !== VERSION) return 'broken';
    const base = BASES[r.get(2)];
    if (base === undefined) return 'broken';
    const heroId = String(base + r.vlq(7));
    const slots: HeroShare['slots'] = {};
    for (const { id: slot } of SLOTS) if (r.get(1)) slots[slot] = readBody(r, slot);
    const k = r.get(2);
    const build: HeroBuild = k === 1 ? { kind: 'stats' } : k === 2 ? { kind: 'named', hash: r.get(HASH_BITS) } : { kind: 'none' };
    if (k === 3 || r.left) return 'broken';
    return { heroId, slots, build };
  } catch {
    return 'broken';
  }
}

// ключ закрепления по отпечатку; null — не закреплён или такого набора в этих данных нет (переименовали, убрали)
export function pinKeyOf(idx: Index, heroId: string, build: HeroBuild): string | null {
  const c = idx.CHAR[heroId];
  if (!c || build.kind !== 'named') return null;
  return pinOptions(c).find((o) => hashOf(tail(o.key)) === build.hash)?.key ?? null;
}
