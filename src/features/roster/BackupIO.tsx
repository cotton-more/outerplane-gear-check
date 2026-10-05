// Резервная копия одним кодом (.x/0060-share-code SPEC 2.3): ростер и вещи; «Заменить» — всё, что было, заменяется кодом
// (есть «Вернуть»), понимает и старые коды экипировки и ростера. Экипировку сохранила более новая версия — «Заменить» нет.
// Живёт в «Ещё» → «Резервная копия». onBackup — useRosterUi: пустая строка — вышло, о результате скажет сообщение с «Вернуть»
// (onDone закрывает шторку, чтобы оно было видно), иначе — строка под полем.
import { useMemo } from 'react';
import { useT } from '@/i18n';
import type { GearApi } from '@/features/gear/store/useGear';
import { CodeBox } from '@/shared/ui/CodeBox';
import { encodeBackup } from './backup';
import type { RosterApi } from './useRoster';

export function BackupIO({ rosterApi, gear, onBackup, onDone }: { rosterApi: RosterApi; gear: GearApi; onBackup: (text: string) => string; onDone: () => void }) {
  const t = useT();
  const code = useMemo(() => encodeBackup(gear.store, rosterApi.list()), [gear.store, rosterApi.roster]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <CodeBox id="backup-code" msgId="io-msg" label={gear.newer ? t.ui.gearNewer : t.ui.backupLabel}
      code={code}
      actions={({ value, say }) => (
        <button type="button" className="btn" disabled={gear.newer}
          onClick={() => { const m = onBackup(value()); if (m) say(m); else onDone(); }}>{t.ui.replace}</button>
      )} />
  );
}
