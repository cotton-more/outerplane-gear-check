// Полосы внизу «Появилось обучение» и «Что нового» (когда показывать — app/useOnboarding).
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import type { useOnboarding } from '../useOnboarding';

export function OnboardingStrips({ onb }: { onb: ReturnType<typeof useOnboarding> }) {
  const t = useT();
  const { news } = onb;
  return (
    <>
      {onb.inviteShown && (
        <div className="tour-strip tour-invite" role="status">
          <span>{t.tour.invite}</span>
          <button type="button" className="btn" onClick={() => { onb.closeInvite(); onb.startTour('core'); }}>{t.tour.welcomeCta}</button>
          <CloseButton className="tour-x" label={t.ui.close} onClick={onb.closeInvite} />
        </div>
      )}
      {onb.newsShown && (
        <div className="tour-strip tour-invite" role="status">
          <span>{t.tour.newsStrip(t.tour.news[news[0].id as keyof typeof t.tour.news] ?? t.tour.tips[news[0].id], news.length - 1)}</span>
          <button type="button" className="btn" onClick={onb.showNews}>{t.tour.newsShow}</button>
          <button type="button" className="btn" onClick={onb.newsLater}>{t.tour.newsLater}</button>
        </div>
      )}
    </>
  );
}
