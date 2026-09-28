// Полоса над формой, пока идёт примерка (logic/tryon): для кого оцениваем и ✕ — снова для всех.
// Одна строка: в ландшафте 812×375 и в окне 420×390 форма не должна уехать вниз.
import { useT } from '../../i18n';
import type { Target } from '../../logic/tryon';
import { tour } from '../../tour/anchors';
import { Img } from '../Img';

export function TryOnStrip({ target, onEnd }: { target: Target; onEnd: () => void }) {
  const t = useT();
  const { c, b } = target;
  return (
    <div className="tryon" role="status" {...tour('tryon')}>
      <span className="tryon-k">{t.tryon.label}</span>
      <Img k={'face:' + c.icon} className="face" />
      <span className="tryon-n"><b>{c.name}</b> · {b.name}</span>
      <button type="button" className="tryon-x" aria-label={t.tryon.end} onClick={onEnd}>✕</button>
    </div>
  );
}
