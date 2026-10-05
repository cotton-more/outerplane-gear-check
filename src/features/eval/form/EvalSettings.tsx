// Настройки оценки: стадия, фоддер, уровень, quirks — под формой на широком экране; на телефоне — в меню ☰ (inline —
// без сворачивания).
import type { Dispatch } from 'react';
import { useT } from '@/i18n';
import type { FormAction, FormState } from './formState';
import { Toggle } from '@/shared/ui/Toggle';
import { SegSwitch } from '@/shared/ui/SegSwitch';

export function EvalSettings({ s, dispatch, inline }: { s: FormState; dispatch: Dispatch<FormAction>; inline?: boolean }) {
  const t = useT();
  const st = s.settings;
  const set = (patch: Partial<typeof st>) => dispatch({ type: 'settings', patch });
  const cur = t.ui.settingsNow(st.stage === 'end', st.fodder, st.lv120, st.quirks);
  const body = (
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
  );
  if (inline) return body;
  return (
    <details className="settings" id="settings" open={s.settingsOpen} onToggle={(e) => dispatch({ type: 'settingsOpen', open: e.currentTarget.open })}>
      <summary>{t.ui.settings} <span className="cur">· {cur.join(' · ')}</span></summary>
      {body}
    </details>
  );
}
