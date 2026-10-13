// The boss row at the top of «Команда» (owner Q2, 2026-10-12; first look «Босс: Meteos · 13 · RES 288 ▾»): immunities live in the
// sheet (mockups OK). E4 (owner 2026-10-13, as the E4 mockups): the row now reads «Босс: Meteos · 13», then SPD and RES with their
// icons, no words — the Speed Set's icon and SPD (the turn and the SPD goal count against it), the RES stat icon and RES; the words
// stay for screen readers. No boss — «Босс: не выбран ▾». Tap — the boss sheet.
import type { Boss } from '@/game/data/types';
import { ElementIcon, SetIcon, StatIcon } from '@/game/icons/Img';
import { useIndex } from '@/game/data/IndexContext';
import { useT } from '@/i18n';
import { tour } from '@/tour/anchors';
import type { StageFacts } from '../model/boss';
import { stageText } from './stageText';

export function BossRow({ boss, facts, onOpen }: { boss: Boss | null; facts: StageFacts | null; onOpen: () => void }) {
  const t = useT();
  const idx = useIndex();
  const speed = Object.values(idx.SET).find((x) => x.short === 'Speed');
  return (
    <button type="button" className="boss-row" aria-haspopup="dialog" aria-label={boss ? undefined : t.boss.pickAria} onClick={onOpen} {...tour('teamBoss')}>
      {boss && <ElementIcon el={boss.element} />}
      {boss && facts ? (
        <>
          {/* label, name and stage: separate flex items from 341 px, one wrapping text below (team.css); a long name gives way, the stage stays */}
          <span className="boss-rt">
            <span className="boss-rl">{t.boss.row}</span>
            <span className="boss-rn">{boss.name}</span>
            <span className="boss-rs"><span className="boss-sep">· </span>{stageText(t, boss, facts.label)}</span>
          </span>
          <span className="boss-rr">
            <span className="boss-rv"><SetIcon set={speed} /><span className="sr-only">SPD </span>{facts.spd}</span>
            <span className="boss-rv"><StatIcon stat="RES" /><span className="sr-only">RES </span>{facts.res}</span>
          </span>
        </>
      ) : (
        <>
          <span className="boss-rl">{t.boss.row}</span>
          <span className="boss-rn none">{t.boss.none}</span>
        </>
      )}
      <span className="boss-rc" aria-hidden="true">▾</span>
    </button>
  );
}
