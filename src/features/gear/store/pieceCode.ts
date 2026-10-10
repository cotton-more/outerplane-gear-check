// Вещь в коде (DEVELOPMENT.md "Shared elements") — одинаково в резервной копии и в коде героя: грейд; у брони — сет или «без
// сета»; у оружия и аксессуара — предмет (с классом), «нет в списке» или «не указан», и main; до четырёх сабстатов в
// порядке ввода с уровнем 1–6; Breakthrough («не указан», T0–T4). Слот пишет тот, кто зовёт: в коде героя он — место
// в списке. Таблицы (SLOTS, GRADES, SUBS, MAINS, CLASSES) — те же, что у кода предмета для чата, и так же только
// дописываются; новый сабстат или main — новый номер формата. Сет и предмет — номером: незнакомый этой версии не
// теряется. «Жёлтые» не пишутся: прочитанная вещь получает их, как новая запись (уровень, но не выше 4).
import { GRADES, SLOTS, isArmor } from '@/game/data';
import type { SlotId } from '@/game/data/types';
import type { Bt } from '@/game/item/item';
import { MAX_SUBS, type Subs } from '@/game/item/subs';
import { CLASSES, MAINS, SUBS } from '@/features/eval/code/codec';
import type { BitReader, BitWriter } from '@/shared/bits';
import { yellowOf, type Piece } from '@/features/gear/model/gear';

export type PieceBody = Pick<Piece, 'slot' | 'grade' | 'setId' | 'itemKey' | 'main' | 'unlisted' | 'lit' | 'bt'>;

const LIT = 6;
const ROW = 1 + SUBS.length * LIT;   // строка сабстата: 0 — пусто, иначе стат и уровень
const SUBS_BITS = 28;                // 4 строки и Breakthrough (6 значений): 79⁴ · 6 < 2^28
const CLS = 1 + CLASSES.length;

const numeric = (s: string | null | undefined): number | null => (s && /^[1-9]\d{0,14}$/.test(s) ? Number(s) : null);

export const writeSlot = (w: BitWriter, slot: SlotId) => w.put(SLOTS.findIndex((s) => s.id === slot), 3);
export const readSlot = (r: BitReader): SlotId => {
  const s = SLOTS[r.get(3)];
  if (!s) throw new RangeError('slot');
  return s.id;
};

// предмет: 0 — не указан, 1 — «нет в списке», 2 + номер · 6 + класс
function itemCode(p: PieceBody): number {
  if (p.unlisted) return 1;
  const m = p.itemKey ? /^([1-9]\d{0,12})(?::([a-z]+))?$/.exec(p.itemKey) : null;
  if (!m) return 0;
  const cls = m[2] ? CLASSES.indexOf(m[2]) + 1 : 0;
  return m[2] && !cls ? 0 : 2 + Number(m[1]) * CLS + cls;
}

export function writeBody(w: BitWriter, p: PieceBody): void {
  w.put(GRADES.indexOf(p.grade), 1);
  if (isArmor(p.slot)) w.vlq(numeric(p.setId) ?? 0, 4);
  else {
    w.vlq(itemCode(p), 7);
    w.put(p.main ? MAINS.indexOf(p.main) + 1 : 0, 4);
  }
  // строки сабстатов в порядке ввода; старшая — Breakthrough: 0 — не указан, 1–5 — T0–T4
  const rows = Object.entries(p.lit).filter(([k]) => SUBS.includes(k)).slice(0, MAX_SUBS);
  let n = p.bt === null ? 0 : p.bt + 1;
  for (let i = MAX_SUBS - 1; i >= 0; i--) {
    const e = rows[i];
    n = n * ROW + (e ? 1 + SUBS.indexOf(e[0]) * LIT + Math.min(LIT, Math.max(1, e[1])) - 1 : 0);
  }
  w.put(n, SUBS_BITS);
}

export function readBody(r: BitReader, slot: SlotId): Omit<Piece, 'id' | 'at'> {
  const grade = GRADES[r.get(1)];
  const armor = isArmor(slot);
  let setId: string | null = null, itemKey: string | null = null, main: string | null = null, unlisted = false;
  if (armor) {
    const s = r.vlq(4);
    setId = s ? String(s) : null;
  } else {
    const t = r.vlq(7);
    if (t === 1) unlisted = true;
    else if (t >= 2) {
      const cls = (t - 2) % CLS;
      itemKey = String(Math.floor((t - 2) / CLS)) + (cls ? ':' + CLASSES[cls - 1] : '');
    }
    const m = r.get(4);
    if (m > MAINS.length) throw new RangeError('main');
    main = m ? MAINS[m - 1] : null;
  }
  let n = r.get(SUBS_BITS);
  const lit: Subs = {};
  let ended = false;
  for (let i = 0; i < MAX_SUBS; i++) {
    const v = n % ROW;
    n = Math.floor(n / ROW);
    if (!v) { ended = true; continue; }
    const k = SUBS[Math.floor((v - 1) / LIT)];
    if (ended || k in lit) throw new RangeError('subs');
    lit[k] = ((v - 1) % LIT) + 1;
  }
  if (n > 5) throw new RangeError('bt');
  const bt = n === 0 ? null : ((n - 1) as Bt);
  return { slot, grade, setId, itemKey, main, ...(unlisted ? { unlisted: true } : {}), yellow: yellowOf(lit), lit, bt };
}
