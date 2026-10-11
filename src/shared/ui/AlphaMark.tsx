// «альфа» next to a feature's name: it is new, may be wrong and will still change (owner 2026-10-11, the Team screen).
import { useT } from '@/i18n';

export function AlphaMark() {
  const t = useT();
  return <span className="alpha" title={t.team.alphaHint}>{t.team.alpha}</span>;
}
