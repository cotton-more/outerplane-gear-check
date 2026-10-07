// What the batch shows outside the form: the list or the plan, with a heading. Phone — inside a sheet opened from the
// strip; wide screen — the right column instead of the verdict.
import type { Ctx } from '@/game/context';
import { useT } from '@/i18n';
import type { BatchMode } from '@/features/batch/useBatchMode';
import { BatchList } from './BatchList';
import { BatchPlan } from './BatchPlan';

export function BatchPanel({ ctx, m }: { ctx: Ctx; m: BatchMode }) {
  if (m.view === 'plan' && m.plan) {
    return <BatchPlan ctx={ctx} plan={m.plan} onSkip={m.skip} onTwin={m.twin} onDone={m.done} />;
  }
  return <BatchList ctx={ctx} items={m.batch.items} editing={m.editing} onFix={m.fix} onRemove={m.remove} onPlan={() => m.show('plan')} />;
}

// heading of the panel and of the sheet
export const batchTitle = (t: ReturnType<typeof useT>, m: BatchMode): string => (m.view === 'plan' ? t.batch.title : t.batch.strip(m.batch.items.length));
