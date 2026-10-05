// Битовый поток для коротких кодов (резервная копия, код героя): числа нужной ширины, числа переменной длины, строки;
// защита целостности — CRC-32 в конце; текст — base62 (0-9, A-Z, a-z): без знаков, которые мессенджер, буфер обмена или
// адресная строка могли бы исказить, и без дефиса — его можно вставить при чтении (код делят на строки).
// Порядок бит — часть формата кода: менять нельзя, только дописывать новые форматы.

export class BitWriter {
  readonly bits: number[] = [];
  // v — целое 0 ≤ v < 2^k
  put(v: number, k: number): this {
    for (let i = k - 1; i >= 0; i--) this.bits.push(Math.floor(v / 2 ** i) % 2);
    return this;
  }
  // целое ≥ 0 группами по c бит, после каждой — бит «есть ещё»
  vlq(v: number, c: number): this {
    do {
      this.put(v % 2 ** c, c);
      v = Math.floor(v / 2 ** c);
      this.put(v > 0 ? 1 : 0, 1);
    } while (v > 0);
    return this;
  }
  str(s: string): this {
    const u = new TextEncoder().encode(s);
    this.vlq(u.length, 4);
    for (const x of u) this.put(x, 8);
    return this;
  }
}

// чтение за концом — ошибка (код обрезан или испорчен)
export class BitReader {
  private i = 0;
  constructor(private readonly bits: readonly number[]) {}
  get(k: number): number {
    if (this.i + k > this.bits.length) throw new RangeError('bits');
    let v = 0;
    for (let j = 0; j < k; j++) v = v * 2 + this.bits[this.i++];
    return v;
  }
  vlq(c: number): number {
    let v = 0, m = 1;
    for (;;) {
      v += this.get(c) * m;
      if (!Number.isSafeInteger(v)) throw new RangeError('bits');
      m *= 2 ** c;
      if (!this.get(1)) return v;
    }
  }
  str(): string {
    const n = this.vlq(4);
    const u = new Uint8Array(n);
    for (let j = 0; j < n; j++) u[j] = this.get(8);
    return new TextDecoder('utf-8', { fatal: true }).decode(u);
  }
  get left(): number { return this.bits.length - this.i; }
}

// ширина номера среди n вариантов (n ≤ 1 — 0 бит)
export const widthOf = (n: number): number => (n <= 1 ? 0 : Math.ceil(Math.log2(n)));

const CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();
// CRC-32 бит (по байтам, последний добит нулями; длина — тоже в сумме: обрезанный по байту код не совпадёт)
function crc32(bits: readonly number[]): number {
  let c = 0xffffffff;
  const feed = (b: number) => { c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); };
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = b * 2 + (bits[i + j] ?? 0);
    feed(b);
  }
  for (let n = bits.length; n > 0; n = Math.floor(n / 256)) feed(n % 256);
  return (c ^ 0xffffffff) >>> 0;
}

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const big = BigInt;

// биты + CRC-32 → base62. Впереди — бит 1: ведущие нули не теряются, длина восстанавливается
export function seal(bits: readonly number[]): string {
  const all = [1, ...bits, ...new BitWriter().put(crc32(bits), 32).bits];
  let n = big(0);
  for (const b of all) n = n * big(2) + big(b);
  let out = '';
  do { out = B62[Number(n % big(62))] + out; n /= big(62); } while (n > big(0));
  return out;
}

// base62 → биты, если CRC сошлась; иначе null (обрезан, лишний, пропущенный или изменённый знак, перестановка)
export function unseal(text: string): number[] | null {
  if (!text) return null;
  let n = big(0);
  for (const ch of text) {
    const d = B62.indexOf(ch);
    if (d < 0) return null;
    n = n * big(62) + big(d);
  }
  const all = n.toString(2).split('').map(Number);
  if (all[0] !== 1 || all.length < 33) return null;
  const bits = all.slice(1, -32);
  const sum = all.slice(-32).reduce((v, b) => v * 2 + b, 0);
  return crc32(bits) === sum ? bits : null;
}
