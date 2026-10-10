// «Партия» — turns the batch mode on (DEVELOPMENT.md "features/batch"): next to «Следующий» on a wide screen, in «Ещё» on a phone.
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';

export function BatchButton({ onStart, className = 'btn' }: { onStart: () => void; className?: string }) {
  const t = useT();
  return <button type="button" className={`${className} batch-start`} onClick={onStart} {...tour('batch')}>{t.batch.button}</button>;
}
