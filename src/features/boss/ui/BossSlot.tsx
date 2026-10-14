// The boss slot beside the team on «Команда» (HISTORY.md 0206, owner 2026-10-14: the boss as the fifth slot behind «VS»,
// replacing the boss row): the boss's portrait with the stage in gold on its foot, the name (wraps — a long one
// makes the slot taller, never clipped), SPD with the Speed Set's icon and RES with the RES icon (no words; the words stay for
// screen readers). Tap — the boss sheet; ✕ on the corner — no boss (the team stays: one team for every boss, Q3). No boss —
// a dashed slot «Босс · выбрать».
import type { Boss } from '@/game/data/types';
import { Icon, SetIcon, StatIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { useT } from '@/i18n';
import { CloseButton } from '@/shared/ui/CloseButton';
import { tour } from '@/tour/anchors';
import type { StageFacts } from '../model/boss';
import { BossFace } from './BossFace';
import { stageText } from './stageText';

export function BossSlot({ boss, facts, onOpen, onRemove }: {
  boss: Boss | null; facts: StageFacts | null; onOpen: () => void; onRemove: () => void;
}) {
  const t = useT();
  const idx = useIndex();
  const speed = Object.values(idx.SET).find((x) => x.short === 'Speed');
  if (!boss || !facts) {
    return (
      <button type="button" className="boss-slot empty" aria-haspopup="dialog" onClick={onOpen} {...tour('teamBoss')}>
        <Icon name="skull" />
        <b>{t.boss.slot}</b>
        <small>{t.boss.slotPick}</small>
      </button>
    );
  }
  return (
    <div className="boss-slot" {...tour('teamBoss')}>
      <button type="button" className="boss-sb" aria-haspopup="dialog" aria-label={t.boss.slotAria(boss.name, stageText(t, boss, facts.label))} onClick={onOpen}>
        <span className="boss-sf"><BossFace b={boss} /><span className="boss-stg">{stageText(t, boss, facts.label, true)}</span></span>
        <span className="boss-sn">{boss.name}</span>
        <span className="boss-sv">
          <span><SetIcon set={speed} />{facts.spd}</span>
          <span><StatIcon stat="RES" />{facts.res}</span>
        </span>
      </button>
      <CloseButton className="tm-x hit" label={t.boss.remove} onClick={onRemove} />
    </div>
  );
}
