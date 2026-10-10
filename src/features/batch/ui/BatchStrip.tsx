// The strip above the form in the batch mode, like «Только для · Caren»: «Партия · 7», «Список ▸», ✕. One line: in
// landscape 812×375 and in a 420×390 window the form must not slide down. Its short notes are a toast (App).
// In it: «E · надето» — a piece worn by a hero (picker: heroes wearing this slot that fits the
// batch) and «🔒 · отложено» — a locked piece of the form's slot; neither needs substats. A tall phone wraps them to a
// second line inside the strip; a short window (landscape, split screen) keeps one line with «E» / «🔒» only (batch.css)
import { useState } from 'react';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import { Sheet } from '@/shared/ui/Sheet';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';

// what — the batch's kind for «Никто из твоих героев не носит здесь Legendary Speed»
export function BatchStrip({ n, cands, what, onList, onEnd, onWorn, onLock }: {
  n: number; cands: () => Char[] | null; what: string;
  onList: () => void; onEnd: () => void; onWorn: (c: string, from: Element | null) => void; onLock: (from: Element) => void;
}) {
  const t = useT();
  const [pick, setPick] = useState<Char[] | null>(null);
  return (
    <>
      <div className="tryon batch-strip" role="status">
        <span className="tryon-k">{t.batch.strip(n)}</span>
        <button type="button" className="linkbtn batch-list hit" onClick={onList}>{t.batch.list}</button>
        <span className="batch-marks">
          <button type="button" className="btn small hit" aria-label={t.batch.wornAdd} title={t.batch.wornAdd} onClick={() => { const c = cands(); if (c) setPick(c); }}>
            <span aria-hidden="true">{t.batch.wornAdd.split(' · ')[0]}</span><span className="bm-long" aria-hidden="true"> · {t.batch.wornAdd.split(' · ')[1]}</span>
          </button>
          <button type="button" className="btn small hit" aria-label={t.batch.lockAdd} title={t.batch.lockAdd} onClick={(e) => onLock(e.currentTarget)}>
            <span aria-hidden="true">{t.batch.lockAdd.split(' · ')[0]}</span><span className="bm-long" aria-hidden="true"> · {t.batch.lockAdd.split(' · ')[1]}</span>
          </button>
        </span>
        <CloseButton className="tryon-x hit" label={t.batch.end} title={t.batch.end} onClick={onEnd} />
      </div>
      {n === 0 && <p className="batch-note muted small">{t.batch.empty}</p>}
      {pick && (
        <Sheet title={t.batch.whose} onClose={() => setPick(null)}>
          <div className="batch-whose">
            {pick.length ? pick.map((c) => (
              <button key={c.id} type="button" className="btn bwho" onClick={(e) => { onWorn(c.id, e.currentTarget.querySelector('.face') ?? e.currentTarget); setPick(null); }}>
                <HeroFace c={c} round /><HeroName c={c} />
              </button>
            )) : <p className="muted small">{t.batch.whoseNone(what)}</p>}
          </div>
        </Sheet>
      )}
    </>
  );
}
