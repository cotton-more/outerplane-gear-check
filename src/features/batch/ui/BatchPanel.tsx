// What the batch shows outside the form: the list or the plan, with a heading. Phone — inside a sheet opened from the
// strip; wide screen — the right column instead of the verdict.
import type { Ctx } from '@/game/context';
import { useT } from '@/i18n';
import type { BatchMode } from '@/features/batch/useBatchMode';
import { BatchList } from './BatchList';
import { BatchPlan } from './BatchPlan';
import { BatchWalk } from './BatchWalk';

export function BatchPanel({ ctx, m }: { ctx: Ctx; m: BatchMode }) {
  if (m.view === 'walk' && m.plan && m.walk) return <BatchWalk ctx={ctx} batch={m.batch} plan={m.plan} walk={m.walk} onTick={m.tick} onDone={m.done} />;
  if (m.view === 'plan' && m.plan) {
    return <BatchPlan ctx={ctx} plan={m.plan} choice={m.batch.choice} undecided={m.walk?.undecided ?? 0} onSkip={m.skip} onTwin={m.twin}
      onChoose={m.choose} onWalk={() => m.show('walk')} onDone={m.done} />;
  }
  return <BatchList ctx={ctx} items={m.batch.items} editing={m.editing} onFix={m.fix} onRemove={m.remove} onPlan={() => m.show('plan')} />;
}

// heading of the panel and of the sheet
export const batchTitle = (t: ReturnType<typeof useT>, m: BatchMode): string => {
  // «Обход · 2 из 3» — steps ticked ✓ of all (owner 2026-10-08: «1 из 3» with nothing ticked read as a bug)
  if (m.view === 'walk' && m.walk) {
    const keys = new Set(m.walk.steps.map((x) => x.key));
    return t.batch.walkTitle(m.batch.done.filter((k) => keys.has(k)).length, m.walk.steps.length);
  }
  return m.view === 'plan' ? t.batch.title : t.batch.strip(m.batch.items.length);
};
