// The strip above the form in the batch mode, like «Только для · Caren»: «Партия · 7», «Список ▸», ✕. One line: in
// landscape 812×375 and in a 420×390 window the form must not slide down. note — «Введены не все сабстаты…»
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';

export function BatchStrip({ n, note, onList, onEnd }: { n: number; note: string | null; onList: () => void; onEnd: () => void }) {
  const t = useT();
  return (
    <>
      <div className="tryon batch-strip" role="status">
        <span className="tryon-k">{t.batch.strip(n)}</span>
        <button type="button" className="linkbtn batch-list" onClick={onList}>{t.batch.list}</button>
        <CloseButton className="tryon-x" label={t.batch.end} title={t.batch.end} onClick={onEnd} />
      </div>
      {(note || n === 0) && <p className="batch-note muted small">{note ?? t.batch.empty}</p>}
    </>
  );
}
