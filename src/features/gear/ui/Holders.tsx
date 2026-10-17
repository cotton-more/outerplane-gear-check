// Who has this piece (features/gear/find holdersOf): «Надета: X» and «В пуле: Y», a name opens the hero's card. «Найти вещь»
// and the verdict (owner 2026-10-17: a summary only, the verdict doesn't change) show it the same way
import type { Index } from '@/game/data';
import { useT } from '@/i18n';
import type { Holders as H } from '@/features/gear/find';

export function Holders({ idx, h, className, onOpenChar }: { idx: Index; h: H; className: string; onOpenChar: (id: string) => void }) {
  const t = useT();
  const names = (ids: string[]) => ids.map((id, i) => (
    <span key={id}>{i > 0 && ', '}<button type="button" className="linkbtn" onClick={() => onOpenChar(id)}>{idx.CHAR[id]?.name ?? id}</button></span>
  ));
  return (
    <div className={className}>
      {h.worn.length > 0 && <p>{t.ui.findWorn} {names(h.worn)}</p>}
      {h.stash.length > 0 && <p>{t.ui.findStash} {names(h.stash)}</p>}
    </div>
  );
}
