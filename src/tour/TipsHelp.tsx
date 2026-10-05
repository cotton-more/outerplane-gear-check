// Раздел «Подсказки» в Справке: выключатель, «показать заново» и все подсказки списком — новые помечены.
import { useT } from '@/i18n';
import { TIPS } from './registry';
import type { TourApi } from './useTour';
import type { Tip } from './types';
import { SegSwitch } from '@/shared/ui/SegSwitch';

export function TipsHelp({ tour, news }: { tour: TourApi; news: Tip[] }) {
  const t = useT();
  const on = tour.store.tips;
  return (
    <div className="tips-help">
      <h4>{t.tour.tipsTitle}</h4>
      <SegSwitch label={`${t.tour.tipsTitle}:`} group={t.tour.tipsTitle} value={on} onChange={(v) => tour.setTips(v)}
        options={[{ value: true, label: t.tour.tipsOn }, { value: false, label: t.tour.tipsOff }]}>
        <button type="button" className="linkbtn" onClick={tour.resetTips}>{t.tour.tipsReset}</button>
      </SegSwitch>
      <ul>
        {TIPS.map((tip) => (
          <li key={tip.id}>{news.includes(tip) && <span className="tour-new">{t.tour.newBadge}</span>} {t.tour.tips[tip.id]}</li>
        ))}
      </ul>
    </div>
  );
}
