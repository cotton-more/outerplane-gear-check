// Код предмета для чата гильдии. Игровой чат — 50 символов, и сообщения из него не копируются:
// код перепечатывают руками. Поэтому в нём только латинские буквы (на телефоне не надо переключаться
// на цифры), кроме I и O — они похожи на l, 1, Q, D, 0, — группами по 4 через пробел. Регистр, пробелы
// и дефисы не важны, кириллические двойники (К, М, Т…) читаются как латиница: с русской раскладки их легко
// набрать случайно. Последний символ контрольный (Luhn mod 24): опечатка в одном символе или
// перестановка двух соседних дают «код с ошибкой».
//
// Внутри одно число в смешанной системе счисления, от младшего разряда к старшему:
//   слот и грейд (12) → main, кроме брони (16) → 4 строки сабстатов (по 53) → сет или предмет.
// Сет или предмет — старший разряд, без верхней границы: новые id просто удлиняют код.
// Броня — 8 букв, Legendary оружие или аксессуар — 11.
import { GRADES, SLOTS, isArmor } from '../data';
import type { Grade, SlotId } from '../data/types';
import type { Subs } from './subs';
import type { ItemInput } from './verdict';

// Порядок в таблицах (и в SLOTS, GRADES) — часть формата: только дописывать в конец, иначе старые коды прочитаются неверно.
// Сабстатов ровно 13 и разряд под них полный (1 + 13·4 = 53): новый сабстат — это уже новый формат кода.
const SUBS = ['ATK', 'ATK%', 'DEF', 'DEF%', 'DMG UP%', 'DMG RED%', 'HP', 'HP%', 'CHC', 'CHD', 'EFF', 'RES', 'SPD'];
const MAINS = ['ATK%', 'CDMG RED%', 'CHC', 'CHD', 'DEF%', 'DMG RED%', 'DMG UP%', 'EFF', 'HP%', 'PEN%', 'RES', 'SPD']; // до 15
const CLASSES = ['striker', 'defender', 'ranger', 'healer', 'mage']; // суффикс ключа «781:defender»

const ROWS = 4;
const SLOT_GRADE = SLOTS.length * GRADES.length;
const MAIN_R = 16;
const SUB_R = 1 + SUBS.length * 4;
const CLASS_R = 1 + CLASSES.length;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // чётное число знаков — иначе Luhn mod N не работает
const N = ALPHABET.length;

export const CODE_PREFIX = 'OGC';
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', У: 'Y', Х: 'X' };

// Luhn mod N: контрольный символ по цифрам кода
function checkDigit(digits: number[]): number {
  let sum = 0;
  let factor = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const x = factor * digits[i];
    sum += Math.floor(x / N) + (x % N);
    factor = factor === 2 ? 1 : 2;
  }
  return (N - (sum % N)) % N;
}

// предмет → код вида «KXRM TPWA»; null, если в предмете есть что-то, чего нет в таблицах формата
export function encodeItem(item: ItemInput): string | null {
  const slot = SLOTS.findIndex((x) => x.id === item.slot);
  const parts: [value: number, radix: number][] = [[slot * GRADES.length + GRADES.indexOf(item.grade), SLOT_GRADE]];
  let top: number;
  if (isArmor(item.slot)) {
    top = item.setId ? Number(item.setId) : 0;
  } else {
    const main = item.main ? MAINS.indexOf(item.main) + 1 : 0;
    if (main === 0 && item.main) return null;
    parts.push([main, MAIN_R]);
    top = item.unlisted ? 1 : 0;
    if (item.itemKey) {
      const m = /^(\d+)(?::([a-z]+))?$/.exec(item.itemKey);
      const cls = m?.[2] ? CLASSES.indexOf(m[2]) + 1 : 0;
      if (!m || (m[2] && cls === 0)) return null;
      top = 2 + Number(m[1]) * CLASS_R + cls;
    }
  }
  if (!Number.isSafeInteger(top)) return null;
  const keys = Object.keys(item.subs);
  if (keys.length > ROWS) return null;
  for (let i = 0; i < ROWS; i++) {
    const k = keys[i];
    if (k === undefined) { parts.push([0, SUB_R]); continue; }
    const stat = SUBS.indexOf(k);
    const roll = item.subs[k];
    if (stat < 0 || !Number.isInteger(roll) || roll < 1 || roll > 4) return null;
    parts.push([1 + stat * 4 + roll - 1, SUB_R]);
  }
  let n = top;
  for (let i = parts.length - 1; i >= 0; i--) n = n * parts[i][1] + parts[i][0];
  if (!Number.isSafeInteger(n)) return null;

  const digits: number[] = [];
  do { digits.unshift(n % N); n = Math.floor(n / N); } while (n > 0);
  digits.push(checkDigit(digits));
  return digits.map((d) => ALPHABET[d]).join('').replace(/(.{4})(?=.)/g, '$1 ');
}

export type DecodeError = 'empty' | 'chars' | 'check' | 'format';
export type Decoded = { ok: true; item: ItemInput } | { ok: false; error: DecodeError };

const fail = (error: DecodeError): Decoded => ({ ok: false, error });

// текст из чата → предмет. Проверяет только сам код; есть ли такой сет или предмет в данных — забота вызывающего.
export function decodeItem(text: string): Decoded {
  const latin = text.toUpperCase().replace(/[АВЕКМНОРСТУХ]/g, (ch) => LOOKALIKE[ch]);
  // O в коде не бывает, поэтому OGC в начале — всегда приставка, даже слитно с кодом
  const raw = latin.replace(new RegExp(`^\\s*${CODE_PREFIX}[\\s:-]*`), '').replace(/[\s-]/g, '');
  if (!raw) return fail('empty');
  const digits: number[] = [];
  for (const ch of raw) {
    const d = ALPHABET.indexOf(ch);
    if (d < 0) return fail('chars');
    digits.push(d);
  }
  if (digits.length < 2 || checkDigit(digits.slice(0, -1)) !== digits[digits.length - 1]) return fail('check');
  let n = 0;
  for (const d of digits.slice(0, -1)) n = n * N + d;
  if (!Number.isSafeInteger(n)) return fail('format');

  const take = (radix: number) => { const v = n % radix; n = Math.floor(n / radix); return v; };
  const sg = take(SLOT_GRADE);
  const slot: SlotId = SLOTS[Math.floor(sg / GRADES.length)].id;
  const grade: Grade = GRADES[sg % GRADES.length];
  const armor = isArmor(slot);
  const mainIdx = armor ? 0 : take(MAIN_R);
  if (mainIdx > MAINS.length) return fail('format');
  const subs: Subs = {};
  let ended = false;
  for (let i = 0; i < ROWS; i++) {
    const v = take(SUB_R);
    if (v === 0) { ended = true; continue; }
    const k = SUBS[Math.floor((v - 1) / 4)];
    if (ended || k in subs) return fail('format'); // пустая строка посередине или стат дважды
    subs[k] = ((v - 1) % 4) + 1;
  }
  const item: ItemInput = { slot, grade, setId: null, itemKey: null, main: mainIdx ? MAINS[mainIdx - 1] : null, unlisted: false, subs };
  if (armor) {
    if (n) item.setId = String(n);
  } else if (n === 1) {
    item.unlisted = true;
  } else if (n >= 2) {
    const cls = (n - 2) % CLASS_R;
    item.itemKey = String(Math.floor((n - 2) / CLASS_R)) + (cls ? ':' + CLASSES[cls - 1] : '');
  }
  return { ok: true, item };
}
