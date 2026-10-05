// Чип исхода вещи для героя (features/gear/pool Outcome): «▲ +25%», «сет 3 из 4», «начнёт», и его слова — для строки «Ещё»,
// подписи карточки вердикта и кнопки «Надеть» / «Заменить». Карточка вердикта, «Сейчас на персонажах», «Кому надеть?».
import { useT, type Texts } from '@/i18n';
import { shownKind, type Outcome } from '@/features/gear/pool';
import type { CharVs } from '@/features/gear/model/poolVs';
import { vsFigure, type VsFigure } from '@/features/gear/model/vs';
import { Icon } from '@/game/icons/Img';

const num = (f: Exclude<VsFigure, { kind: 'empty' }>) => (f.kind === 'times' ? `×${f.n}` : `${f.n > 0 ? '+' : f.n < 0 ? '−' : '±'}${Math.abs(f.n)}%`);
// разница: у вставшей — выигрыш к вытесненному, у невставшей — против вещи в её слоте. Вытесненное ничего не стоило —
// «полезных нет», а не «×2609»
export const figOf = (o: Outcome) => vsFigure({ delta: o.delta, wornEmpty: (!!o.pair?.wornEmpty || o.lostEmpty) && o.kind !== 'completes' && o.kind !== 'closer' });

// слово исхода: значок ▲▼ и строка «Ещё» («Speed — соберёт»); «соберёт» — вся связка, половина — «сет n из m» (shownKind)
export function outcomeWord(t: Texts, o: Outcome): string {
  if (shownKind(o) === 'closer') return t.ui.vsCloser(o.after.progress, o.after.need);
  if (o.kind === 'up' || o.kind === 'down') {
    const f = figOf(o);
    return o.pair?.why ? t.ui.vsKind[o.pair.why] : !f ? t.ui.vsKind.better : f.kind === 'empty' ? t.ui.vsKind.better : num(f);
  }
  return t.ui.vsKind[o.kind] ?? o.kind;
}

// чип целиком, как его прочтёт диктор (подпись карточки): «начнёт», «лучше надетой: +25%», «сет 3 из 4»
export function chipLabel(t: Texts, o: Outcome | null, starts?: boolean): string {
  if (starts || !o || (o.entering && o.used)) return t.ui.vsKind.starts;
  // «лучше надетой: +25%»; без числа (вытесненное ничего не стоило) — просто «лучше», не «лучше надетой: лучше»
  if (o.kind === 'up' || o.kind === 'down') {
    const word = outcomeWord(t, o);
    return /^[+−±×]/.test(word) ? (t.ui.vsSr[o.kind] ?? '') + word : word;
  }
  if (o.kind === 'completes' || o.kind === 'closer') return outcomeWord(t, o);
  return t.ui.vsKind[o.kind] ?? o.kind;
}

// чип исхода; o null — вещь только начнёт билд
export function VsChip({ o, starts }: { o: Outcome | null; starts?: boolean }) {
  const t = useT();
  if (starts || !o || (o.entering && o.used)) return <span className="vs fill">{t.ui.vsKind.starts}</span>;
  if (o.kind === 'up' || o.kind === 'down' || o.kind === 'completes' || o.kind === 'closer') {
    const up = o.kind !== 'down';
    const sr = o.kind === 'up' || o.kind === 'down' ? t.ui.vsSr[o.kind] : '';
    return <span className={`vs ${up ? 'up' : 'down'}`}><Icon name={up ? 'trending-up' : 'trending-down'} />{sr && <span className="sr-only">{sr}</span>}{outcomeWord(t, o)}</span>;
  }
  const cls = o.kind === 'capped' ? 'eq' : o.kind === 'stats' ? 'off' : o.kind;
  return <span className={`vs ${cls}`}>{o.kind === 'eq' || o.kind === 'capped' ? <Icon name="equal" /> : null}{t.ui.vsKind[o.kind]}</span>;
}

// что сделает кнопка: заменить, если «Надеть» уберёт вещь её слота (poolVs replaces), иначе — надеть; на форме нажата
// «T4» — «· T4» в конце (В4: видно, с каким Breakthrough вещь ляжет в пул)
export const equipLabel = (t: Texts, x: CharVs, slot: string, t4 = false) =>
  (x.replaces ? t.ui.replaceOn(slot, x.c.name) : t.ui.equipTo(x.c.name)) + (t4 ? t.ui.withT4 : '');
