// Раздел «Подсказки» в Справке: выключатель, «показать заново» и подсказки списком — сверху новые за две недели и ещё не
// виденные (новые помечены; owner 2026-10-11: «всё новое должно быть вверху списка»), остальные свёрнуты (owner
// 2026-10-25, tips.ts helpTips) в порядке TIP_ORDER.
import { useT } from '@/i18n';
import { TIPS } from './registry';
import { helpTips } from './tips';
import type { TourApi } from './useTour';
import type { Tip } from './types';
import { SegSwitch } from '@/shared/ui/SegSwitch';

const localDay = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); };

export function TipsHelp({ tour, news }: { tour: TourApi; news: Tip[] }) {
  const t = useT();
  const on = tour.store.tips;
  const { top, rest } = helpTips(TIPS, news, localDay());
  const list = (tips: Tip[]) => (
    <ul>
      {tips.map((tip) => (
        <li key={tip.id}>{news.includes(tip) && <span className="tour-new">{t.tour.newBadge}</span>} {t.tour.tips[tip.id]}</li>
      ))}
    </ul>
  );
  return (
    <div className="tips-help">
      <h4>{t.tour.tipsTitle}</h4>
      <SegSwitch label={`${t.tour.tipsTitle}:`} group={t.tour.tipsTitle} value={on} onChange={(v) => tour.setTips(v)}
        options={[{ value: true, label: t.tour.tipsOn }, { value: false, label: t.tour.tipsOff }]}>
        <button type="button" className="linkbtn" onClick={tour.resetTips}>{t.tour.tipsReset}</button>
      </SegSwitch>
      {top.length > 0 && list(top)}
      {rest.length > 0 && (
        <details className="tips-rest">
          <summary>{top.length ? t.tour.tipsRest(rest.length) : t.tour.tipsAll(rest.length)}</summary>
          {list(rest)}
        </details>
      )}
    </div>
  );
}
