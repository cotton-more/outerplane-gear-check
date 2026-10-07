// Карточка вердикта на форме (телефон) и заголовок вердикта без слова штампа — его же показывает плашка внизу (VBar).
import { useT } from '@/i18n';
import { bestRow, type Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import { tour } from '@/tour/anchors';
import { Rich } from '@/shared/ui/Rich';
import { Chain } from '@/features/eval/verdict/Chain';
import type { CharVs } from '@/features/gear/model/poolVs';
import { chipLabel, VsChip } from '@/features/gear/ui/VsChip';
import { HeroName } from '@/game/hero/HeroName';

// На плашке слово вердикта уже есть в штампе: «Оставляй — подходит 26 персонажам» → «подходит 26 персонажам»
export const barTitle = (r: VerdictData) => (r.v !== 'idle' && r.title.includes(' — ') ? r.title.slice(r.title.indexOf(' — ') + 3) : r.title);

// Карточка вердикта на форме (телефон): встаёт на место сетки сабстатов, когда вердикт готов.
// Штамп, коротко — почему, и третья строка — по порядку, что есть: герой, которого назвал вердикт («▲ +2,5 очк. Caren»,
// «держи Caren») → цепочка → первая причина. Кнопка «Надеть» — рядом с карточкой (EvalPanel): сама карточка — кнопка.
// named — назвать героя; в режиме героя (named false) имя уже на полосе над формой, третьей строки нет: про героя —
// строка под карточкой (heroNote), чужие цепочки здесь не показываем. note — the piece looks like one already set aside:
// that line goes third instead
export function VerdictCard({ r, onOpen, vs, named = true, note = null }: { r: VerdictData; onOpen: () => void; vs?: CharVs | null; named?: boolean; note?: string | null }) {
  const t = useT();
  const best = bestRow(r)?.row;
  const chip = vs ? chipLabel(t, vs) : null;
  // кнопка карточки читается диктором целиком: штамп, чип с именем героя и «подробнее»
  const label = [t.ui.verdictLabel[r.v], chip && vs && `${chip} ${vs.c.name}`, t.ui.verdictDetails].filter(Boolean).join(' · ');
  return (
    <button type="button" className={`vcard v-${r.v}`} onClick={onOpen} aria-label={label} {...tour('verdict')}>
      <span className="vc-top">
        <span className="stamp">{t.ui.verdictLabel[r.v]}</span>
        <span className="vc-more"><span className="vc-more-t">{t.ui.details}</span> ▸</span>
      </span>
      <span className="vc-title">{barTitle(r)}</span>
      {note ? <span className="vc-line"><Rich text={note} /></span>
        : vs && chip
        ? <span className="vc-vs"><VsChip x={vs} />{named && <b><HeroName c={vs.c} /></b>}</span>
        : !named ? null
        : best && best.good != null
        ? <span className="vc-chain"><b><HeroName c={best.c} /></b><Chain m={best} /></span>
        : r.lines[0] && <span className="vc-line"><Rich text={r.lines[0]} /></span>}
    </button>
  );
}
