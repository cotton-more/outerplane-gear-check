// Настройки оценки в «Ещё»: стадия, фоддер, уровень, quirks. Строка «Оценка» со сводкой текущих настроек раскрывается
// на месте; открыта ли — хранится в состоянии страницы (settingsOpen) и переживает перезапуск.
import type { Dispatch } from 'react';
import { useT } from '@/i18n';
import type { FormAction, FormState } from './formState';
import { Expand } from '@/shared/ui/Expand';
import { Toggle } from '@/shared/ui/Toggle';
import { SegSwitch } from '@/shared/ui/SegSwitch';

export function EvalSettings({ s, dispatch }: { s: FormState; dispatch: Dispatch<FormAction> }) {
  const t = useT();
  const st = s.settings;
  const set = (patch: Partial<typeof st>) => dispatch({ type: 'settings', patch });
  const cur = t.ui.settingsNow(st.stage === 'end', st.fodder, st.lv120, st.quirks);
  return (
    <Expand id="settings" title={t.ui.moreEval} note={cur.join(' · ')} open={s.settingsOpen} onToggle={(open) => dispatch({ type: 'settingsOpen', open })}>
      <div className="settings-body">
        <SegSwitch label={t.ui.stage} group={t.ui.stageGroup} value={st.stage} onChange={(stage) => set({ stage })}
          options={[{ value: 'grow', label: t.ui.stageGrow }, { value: 'end', label: t.ui.stageEnd }]} />
        <Toggle id="opt-fodder" checked={st.fodder} onChange={(on) => set({ fodder: on })}>
          {t.ui.fodder} <span className="muted">{t.ui.fodderNote}</span>
        </Toggle>
        <SegSwitch label={t.ui.level} group={t.ui.levelGroup} value={st.lv120} onChange={(lv120) => set({ lv120 })}
          options={[{ value: false, label: 'lv 100' }, { value: true, label: 'lv 120 (Limit Break)' }]} />
        <Toggle id="opt-quirks" checked={st.quirks} onChange={(on) => set({ quirks: on })}>
          {t.ui.quirks} <span className="muted">{t.ui.quirksNote}</span>
        </Toggle>
        <p className="muted small">{t.ui.flatNote}</p>
      </div>
    </Expand>
  );
}
