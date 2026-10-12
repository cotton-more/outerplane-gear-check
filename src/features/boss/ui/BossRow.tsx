// The boss row at the top of «Команда» (owner Q2, 2026-10-12): «Босс: Meteos · 13 · RES 288 ▾» — RES only, SPD and
// immunities live in the sheet (mockups OK). No boss — «Босс: не выбран ▾». Tap — the boss sheet.
import type { Boss } from '@/game/data/types';
import { ElementIcon } from '@/game/icons/Img';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import type { StageFacts } from '../model/boss';
import { stageText } from './stageText';

export function BossRow({ boss, facts, onOpen }: { boss: Boss | null; facts: StageFacts | null; onOpen: () => void }) {
  const t = useT();
  return (
    <button type="button" className="boss-row" aria-haspopup="dialog" aria-label={boss ? undefined : t.boss.pickAria} onClick={onOpen} {...tour('teamBoss')}>
      {boss && <ElementIcon el={boss.element} />}
      <span className="boss-rl">{t.boss.row}</span>
      {boss && facts ? (
        <>
          {/* a long name gives way, the stage stays */}
          <span className="boss-rn">{boss.name}</span>
          <span className="boss-rs">· {stageText(t, boss, facts.label)}</span>
          <span className="boss-rr">RES {facts.res}</span>
        </>
      ) : <span className="boss-rn none">{t.boss.none}</span>}
      <span className="boss-rc" aria-hidden="true">▾</span>
    </button>
  );
}
