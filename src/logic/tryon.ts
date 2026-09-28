// Примерка: оценка вещи для одного персонажа и билда. Входы — в карточке персонажа: «Собрать билд», «Примерить»
// (пустой слот), «Примерить замену» (вещь). Сравнение — только с этим билдом, «Надеть» — сразу в него,
// «Следующий» примерку не сбрасывает. Штамп остаётся общим: вещь могут ждать другие, — а заголовок после « — »
// говорит и про других, и про неё, чтобы штамп и строка не спорили.
import { isArmor, type Index } from '../data';
import type { Build, Char, SlotId } from '../data/types';
import type { Texts } from '../i18n';
import type { GearStore, Piece } from './gear';
import { uniqChars } from './builds';
import { bestRow, type Verdict } from './verdict';
import type { Vs } from './vs';

export interface TryOn { charId: string; build: string }
export interface Target { c: Char; b: Build }

// из хранилища: персонажа или билда в данных больше нет — примерки нет
export function restoreTryOn(raw: unknown, idx: Index): TryOn | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const c = typeof r.charId === 'string' ? idx.CHAR[r.charId] : undefined;
  return c && typeof r.build === 'string' && c.builds.some((b) => b.name === r.build) ? { charId: c.id, build: r.build as string } : null;
}

export function tryOnTarget(idx: Index, t: TryOn | null): Target | null {
  const c = t ? idx.CHAR[t.charId] : undefined;
  const b = c?.builds.find((x) => x.name === t!.build);
  return c && b ? { c, b } : null;
}

// что поставить на форму: слот; у брони — сет, которого билду не хватает (у «Примерить замену» — сет надетой).
// Связка — та, что уже собрана больше других; в ней — первый сет, которого меньше, чем нужно. Грейд не трогаем.
export function tryOnPreset(st: GearStore, key: string, b: Build, slot: SlotId, from?: Piece | null): { slot: SlotId; setId: string | null } {
  if (!isArmor(slot)) return { slot, setId: null };
  if (from?.setId) return { slot, setId: from.setId };
  const count: Record<string, number> = {};
  for (const [sl, id] of Object.entries(st.builds[key]?.slots ?? {})) {
    const set = isArmor(sl as SlotId) ? st.pieces[id]?.setId : null;
    if (set) count[set] = (count[set] ?? 0) + 1;
  }
  const have = (combo: Build['sets'][number]) => combo.reduce((n, p) => n + Math.min(count[p.set] ?? 0, p.n), 0);
  const combo = b.sets.reduce<Build['sets'][number] | null>((best, cb) => (!best || have(cb) > have(best) ? cb : best), null);
  const part = combo?.find((p) => (count[p.set] ?? 0) < p.n) ?? combo?.[0];
  return { slot, setId: part?.set ?? null };
}

// Заголовок в примерке: то, что было до « — » (слово вердикта), и дальше — кому ещё нужна и что с ней.
//   «Оставляй — нужна Titia и Kappa; на Caren уже лучше», «Разбирай — но лучше, чем на Caren: надень, пока нет лучше»
export function tryOnTitle(t: Texts, res: Verdict, vs: Vs): string {
  if (res.v === 'idle') return res.title;
  const T = t.tryon;
  const i = res.title.indexOf(' — ');
  const head = i >= 0 ? res.title.slice(0, i) : res.title;
  const tail = i >= 0 ? res.title.slice(i + 3) : '';
  const name = vs.c.name;
  if (res.v === 'junk' || res.v === 'fodder') {
    if (vs.kind === 'fill' || vs.kind === 'up') return `${head} — ${T.butWear(vs.kind, name)}`;
    const mine = T.clause(vs.kind, name, vs.b.name, false);
    return `${head} — ${tail ? `${tail}; ${mine}` : mine}`;
  }
  const top = bestRow(res);
  const sec = top ? res.sections.find((x) => x.rows[0] === top.row) : undefined;
  const others = sec ? uniqChars(sec.rows.filter((r) => r.c.id !== vs.c.id)).map((c) => c.name) : [];
  const parts = [others.length ? T.others(others) : '', T.clause(vs.kind, name, vs.b.name, res.v === 'temp')].filter(Boolean);
  return `${head} — ${parts.join('; ')}`;
}
