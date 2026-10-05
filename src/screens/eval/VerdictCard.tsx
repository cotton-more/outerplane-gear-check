// Карточка вердикта на форме (телефон) и заголовок вердикта без слова штампа — его же показывает плашка внизу (VBar).
import { useT } from '@/i18n';
import { bestRow, type Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import { tour } from '@/tour/anchors';
import { Rich } from '@/shared/ui/Rich';
import { Chain } from '@/features/eval/verdict/Chain';
import type { CharVs } from '@/features/gear/model/poolVs';
import { variantName } from '@/features/gear/ui/pieceText';
import { chipLabel, VsChip } from '@/features/gear/ui/VsChip';
import { subLabel } from '@/game/data';
import { HeroName } from '@/game/hero/HeroName';

// На плашке слово вердикта уже есть в штампе: «Оставляй — подходит 26 персонажам» → «подходит 26 персонажам»
export const barTitle = (r: VerdictData) => (r.v !== 'idle' && r.title.includes(' — ') ? r.title.slice(r.title.indexOf(' — ') + 3) : r.title);

// Карточка вердикта на форме (телефон): встаёт на место сетки сабстатов, когда вердикт готов.
// Штамп, коротко — почему, и третья строка — по порядку, что есть: сравнение с надетым → цепочка → первая причина.
// vs — лучший исход (первый из «Сейчас на персонажах» или героя в режиме «для героя»): «▲ сет 3 из 4 Caren · Speed/Immu +1»,
// «▲ +25% Caren · Speed +CHD (3-е)». Кнопка «Надеть» — рядом с карточкой (EvalPanel): сама карточка — кнопка.
// named — назвать персонажа; в режиме героя (named false) имя уже на полосе над формой, место — местам цепочки, а строки
// героя нет — третьей строки нет: про героя — строка под карточкой (heroNote), чужие цепочки здесь не показываем
export function VerdictCard({ r, onOpen, vs, named = true }: { r: VerdictData; onOpen: () => void; vs?: CharVs | null; named?: boolean }) {
  const t = useT();
  const best = bestRow(r)?.row;
  const o = vs?.best ?? null;
  const starts = o ? o.entering : true;
  // ни исхода, ни «начнёт» — строка героя только ради кнопки «Заменить» (режим героя, «Примерить замену»): чипа нет,
  // третья строка — как без строки героя
  const shownVs = vs && (o || vs.starts.length) ? vs : null;
  // кнопка карточки читается диктором целиком: штамп, исход — тот же, что на чипе, — и «подробнее»
  const label = [t.ui.verdictLabel[r.v], shownVs && `${chipLabel(t, o, starts)} ${shownVs.c.name}`, t.ui.verdictDetails].filter(Boolean).join(' · ');
  const p = o?.pair;
  const places = p && (o.kind === 'up' || o.kind === 'eq' || o.kind === 'down') && (p.gained.length || p.lost.length)
    ? t.ui.vsPlaces(p.gained.map((x) => ({ ...x, key: subLabel(x.key) })), p.lost.map((x) => ({ ...x, key: subLabel(x.key) }))) : '';
  // имя варианта (Р5): «Defense mix · Swiftness» — исход из него, а не из соседнего по общей половине
  const build = o ? variantName(t, o.v) : vs?.starts[0]?.name ?? '';
  return (
    <button type="button" className={`vcard v-${r.v}`} onClick={onOpen} aria-label={label} {...tour('verdict')}>
      <span className="vc-top">
        <span className="stamp">{t.ui.verdictLabel[r.v]}</span>
        <span className="vc-more"><span className="vc-more-t">{t.ui.details}</span> ▸</span>
      </span>
      <span className="vc-title">{barTitle(r)}</span>
      {shownVs
        ? <span className="vc-vs"><VsChip o={o} starts={starts} />{named && <><b><HeroName c={shownVs.c} /></b>{build && <span className="bn">· {build}{shownVs.same > 0 ? ` +${shownVs.same}` : ''}</span>}</>}{places && <span className="vc-places">{places}</span>}</span>
        : !named ? null
        : best && best.good != null
        ? <span className="vc-chain"><b><HeroName c={best.c} /></b><Chain m={best} /></span>
        : r.lines[0] && <span className="vc-line"><Rich text={r.lines[0]} /></span>}
    </button>
  );
}
