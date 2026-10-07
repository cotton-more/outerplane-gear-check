// Плашка внизу экрана на телефоне: штамп вердикта, вкладки и «Сброс».
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';
import type { Verdict as VerdictData } from '@/features/eval/verdict/verdict';
import type { Tab } from '@/shared/tab';
import { tour } from '@/tour/anchors';
import { barTitle } from './VerdictCard';

// Узкий экран (телефон, разделённый экран с игрой): шапки нет, внизу одна плашка на обе вкладки.
//   Оценка:    [☰ «Ещё», ★ ростер] [вердикт или подсказка — нажми, подробности шторкой] [Следующий]
//   Персонажи: [← Оценка] [вердикт текущей вещи — нажми, вернёшься к оценке]
// compact — самая узкая ширина: штампа нет, заголовок целиком («Оставляй — подходит 26 персонажам»), вердикт виден и по цвету.
// stampless — вердикт уже на карточке формы, на плашке не повторяем; hint — подсказка вместо заголовка (сет выбран, сабстатов нет).
// Подсказка и «что ввести дальше» (вердикт idle) — приглушённой строкой со стрелкой до трёх строк, вердикт — штампом:
// сразу видно, где «сделай это», а где результат. quiet — идёт обучение: что делать, говорит его полоса, здесь не дублируем.
export function VBar({ r, news, show, compact, stampless, hint, quiet, tab, rosterSize, onTab, onMenu, onReset, onOpen }: {
  r: VerdictData; news: boolean; show: boolean; compact: boolean; stampless: boolean; hint: string | null; quiet: boolean; tab: Tab; rosterSize: number;
  onTab: (t: Tab) => void; onMenu: () => void; onReset: () => void; onOpen: () => void;
}) {
  const t = useT();
  useEffect(() => {
    document.body.classList.toggle('has-vbar', show);
    return () => document.body.classList.remove('has-vbar');
  }, [show]);
  // вердикт сменился (не при первом показе и не на «что ввести дальше») — плашка коротко вспыхивает его цветом:
  // сигнал, не отрываясь от игры
  const [flash, setFlash] = useState(0);
  const prev = useRef(r.v);
  useEffect(() => {
    if (prev.current === r.v) return;
    prev.current = r.v;
    if (r.v !== 'idle') setFlash((n) => n + 1);
  }, [r.v]);
  if (!show) return null;
  const evalTab = tab === 'eval';
  return (
    <div className={`vbar v-${r.v}${compact ? ' compact' : ''}`} id="vbar">
      {flash > 0 && <span key={flash} className="vb-flash" aria-hidden="true" />}
      {evalTab
        ? <button type="button" className={news ? 'vb-tab has-news' : 'vb-tab'} aria-label={t.ui.more} onClick={onMenu} {...tour('more')}>☰{rosterSize > 0 && <> <span className="vb-star">★</span>{rosterSize}</>}</button>
        : <button type="button" className="vb-tab" onClick={() => onTab('eval')}>{t.ui.toEval}</button>}
      <button type="button" className="vb-main" aria-label={evalTab ? t.ui.verdictDetails : t.ui.backToEval} {...(evalTab && tour('verdict'))}
        onClick={evalTab ? onOpen : () => onTab('eval')}>
        {evalTab && (hint || r.v === 'idle')
          ? !quiet && <span className="vt vt-hint">{hint ?? r.title}</span>
          : evalTab && stampless
            ? <span className="vt vt-more">{t.ui.details}</span>
            : <>{!compact && <span className="stamp">{t.ui.verdictLabel[r.v]}</span>}<span className="vt">{compact ? r.title : barTitle(r)}</span></>}
        {evalTab && <span className="vb-more" aria-hidden="true">▴</span>}
      </button>
      {evalTab && <button type="button" className="vb-reset" aria-label={t.ui.resetItem} onClick={onReset} {...tour('next')}>{t.ui.reset}</button>}
    </div>
  );
}
