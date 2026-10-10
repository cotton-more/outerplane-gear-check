// The strip above the form in the batch mode, like «Только для · Caren»: «Партия · 7», «Список ▸», ✕. One line: in
// landscape 812×375 and in a 420×390 window the form must not slide down. Its short notes are a toast (App).
// «E» and «🔒» are next to «В партию» (BatchMarks)
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';

export function BatchStrip({ n, onList, onEnd }: { n: number; onList: () => void; onEnd: () => void }) {
  const t = useT();
  return (
    <>
      <div className="tryon batch-strip" role="status">
        <span className="tryon-k">{t.batch.strip(n)}</span>
        <button type="button" className="linkbtn batch-list hit" onClick={onList}>{t.batch.list}</button>
        <CloseButton className="tryon-x hit" label={t.batch.end} title={t.batch.end} onClick={onEnd} />
      </div>
      {n === 0 && <p className="batch-note muted small">{t.batch.empty}</p>}
    </>
  );
}
