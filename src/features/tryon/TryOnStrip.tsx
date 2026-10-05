// Полоса над формой в режиме «для героя» (features/tryon/tryon): «Только для · [лицо] Caren» и ✕ — снова для всех.
// Одна строка: в ландшафте 812×375 и в окне 420×390 форма не должна уехать вниз.
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import { Img } from '@/game/icons/Img';

export function TryOnStrip({ c, onEnd }: { c: Char; onEnd: () => void }) {
  const t = useT();
  return (
    <div className="tryon" role="status" {...tour('tryon')}>
      <span className="tryon-k">{t.tryon.label}</span>
      <span className="tryon-d" aria-hidden="true">·</span>
      <Img k={'face:' + c.icon} className="face" />
      <span className="tryon-n" title={c.name}><b>{c.name}</b></span>
      <button type="button" className="tryon-x" aria-label={t.tryon.end} title={t.tryon.end} onClick={onEnd}>✕</button>
    </div>
  );
}
