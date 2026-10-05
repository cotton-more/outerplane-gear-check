// Раздел «Подсказки» в Справке: выключатель, «показать заново» и все подсказки списком — новые помечены.
import { useT } from '@/i18n';
import { TIPS } from './registry';
import type { TourApi } from './useTour';
import type { Tip } from './types';

export function TipsHelp({ tour, news }: { tour: TourApi; news: Tip[] }) {
  const t = useT();
  const on = tour.store.tips;
  return (
    <div className="tips-help">
      <h4>{t.tour.tipsTitle}</h4>
      <div className="seg" role="group" aria-label={t.tour.tipsTitle}>
        <span className="muted small">{t.tour.tipsTitle}:</span>
        <button type="button" className="fbtn" aria-pressed={on} onClick={() => tour.setTips(true)}>{t.tour.tipsOn}</button>
        <button type="button" className="fbtn" aria-pressed={!on} onClick={() => tour.setTips(false)}>{t.tour.tipsOff}</button>
        <button type="button" className="linkbtn" onClick={tour.resetTips}>{t.tour.tipsReset}</button>
      </div>
      <ul>
        {TIPS.map((tip) => (
          <li key={tip.id}>{news.includes(tip) && <span className="tour-new">{t.tour.newBadge}</span>} {t.tour.tips[tip.id]}</li>
        ))}
      </ul>
    </div>
  );
}
