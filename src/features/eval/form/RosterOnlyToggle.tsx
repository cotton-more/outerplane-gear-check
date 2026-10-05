// «Только мой ростер» — настройка оценки: на форме (ПК) и в меню ☰ (телефон). Ростер пуст — подсказка, что его отметить.
import type { Dispatch } from 'react';
import { useT } from '@/i18n';
import { Toggle } from '@/shared/ui/Toggle';
import type { FormAction, FormState } from './formState';

export function RosterOnlyToggle({ id, s, dispatch, rosterSize }: {
  id: string; s: Pick<FormState, 'settings'>; dispatch: Dispatch<FormAction>; rosterSize: number;
}) {
  const t = useT();
  return (
    <Toggle id={id} checked={s.settings.rosterOnly} onChange={(on) => dispatch({ type: 'settings', patch: { rosterOnly: on } })}>
      {t.ui.rosterOnly}{rosterSize ? ` (${rosterSize})` : t.ui.rosterOnlyEmpty}
    </Toggle>
  );
}
