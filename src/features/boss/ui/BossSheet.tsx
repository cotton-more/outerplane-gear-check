// The boss sheet (mockups OK 2026-10-12, .x/0200-boss/mock): with a boss — its stage chips, RES and SPD at the stage,
// immunities («Контроль» stands for the six hard CC ids; tap lists them), the outerpedia guide, «Другой босс» and
// «Без босса»; without one (or after «Другой босс») — the list of fights by group with a name search.
import { useState } from 'react';
import type { Boss, Bosses } from '@/game/data/types';
import { ElementIcon } from '@/game/icons/Img';
import { useT, type Texts } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { stageText } from './stageText';
import { bossGroups, CC, factsAt, guideUrl, immunityChips, rankParts, stagesOf, topStage, uniq } from '../model/boss';

export function BossSheet({ B, boss, stage, now, onPick, onStage, onClear, onClose }: {
  B: Bosses; boss: Boss | null; stage: number; now: number;
  onPick: (key: string) => void; onStage: (i: number) => void; onClear: () => void; onClose: () => void;
}) {
  const t = useT();
  const [list, setList] = useState(!boss);
  return (
    <Sheet title={list ? t.boss.which : t.boss.title} onClose={onClose} className="boss-sheet">
      {list || !boss
        ? <BossList B={B} now={now} current={boss?.key ?? null} onPick={(k) => { onPick(k); setList(false); }} />
        : <BossView t={t} B={B} b={boss} stage={stage} now={now} onStage={onStage} onOther={() => setList(true)} onClear={onClear} />}
    </Sheet>
  );
}

// «до 13 окт.» under a running fight
const until = (t: Texts, b: Boss, now: number) => {
  const end = b.live ? Date.parse(b.live[1]) : NaN;
  return b.live && Date.parse(b.live[0]) <= now && now < end ? t.boss.until(new Date(end)) : null;
};
// guild raid boss: main or a sub one (key suffix)
const raidRole = (t: Texts, b: Boss) => (b.mode !== 'gr' ? null : b.key.endsWith(':main') ? t.boss.main : t.boss.sub);

function BossList({ B, now, current, onPick }: { B: Bosses; now: number; current: string | null; onPick: (key: string) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const hit = (b: Boss) => !query || b.name.toLowerCase().includes(query) || (b.group ?? '').toLowerCase().includes(query);
  const groups = bossGroups(B, now).map((g) => ({ ...g, bosses: g.bosses.filter(hit) })).filter((g) => g.bosses.length);
  const row = (b: Boss) => {
    const live = until(t, b, now), role = raidRole(t, b);
    const top = factsAt(B, b, topStage(B, b));
    return (
      <li key={b.key}>
        <button type="button" className={`boss-li${b.key === current ? ' on' : ''}`} aria-pressed={b.key === current} onClick={() => onPick(b.key)}>
          <ElementIcon el={b.element} />
          <span className="boss-ln">{b.name}</span>
          {live && <span className="boss-live">{live}</span>}
          {role && <span className="boss-lt">{role}</span>}
          {top && <span className="boss-lr">RES {top.res}</span>}
        </button>
      </li>
    );
  };
  return (
    <div className="boss-list">
      <input className="pick-q" type="search" value={q} placeholder={t.team.search} aria-label={t.team.search} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => (
        <section key={g.key} className="boss-g">
          <p className="tm-ph">{t.boss.group[g.key]}</p>
          {g.key === 'gr'
            // guild raid: a line per raid (its name), the main boss before the subs
            ? uniq(g.bosses.map((b) => b.group ?? '')).map((raid) => (
              <div key={raid} className="boss-raid">
                {raid && <p className="boss-rg">{raid}</p>}
                <ul className="boss-ul">{g.bosses.filter((b) => (b.group ?? '') === raid).map(row)}</ul>
              </div>
            ))
            : <ul className="boss-ul">{g.bosses.map(row)}</ul>}
        </section>
      ))}
    </div>
  );
}

function BossView({ t, B, b, stage, now, onStage, onOther, onClear }: {
  t: Texts; B: Bosses; b: Boss; stage: number; now: number; onStage: (i: number) => void; onOther: () => void; onClear: () => void;
}) {
  const [ccOpen, setCcOpen] = useState(false);
  const f = factsAt(B, b, stage);
  const live = until(t, b, now), role = raidRole(t, b);
  const chips = f ? immunityChips(f.imm) : { cc: false, rest: [] };
  const sub = [b.mode === 'gr' ? b.group : t.boss.group[b.mode], role].filter(Boolean).join(' · ');
  return (
    <div className="boss-view">
      <div className="boss-head">
        <ElementIcon el={b.element} />
        <div className="boss-ht">
          <b>{b.name}</b>
          <span>{sub}{live && <> <span className="boss-live">{live}</span></>}</span>
        </div>
        <button type="button" className="linkbtn hit" onClick={onOther}>{t.boss.other}</button>
      </div>
      <StagePicker t={t} B={B} b={b} stage={stage} onStage={onStage} />
      {f && (
        <div className="boss-facts">
          <div><span>RES</span><b>{f.res}</b></div>
          <div><span>SPD</span><b>{f.spd}</b></div>
        </div>
      )}
      {f && f.imm.length > 0 && (
        <div className="boss-imm">
          <span className="boss-il">{t.boss.immune}</span>
          {chips.cc && (
            <button type="button" className="boss-cc" aria-expanded={ccOpen} onClick={() => setCcOpen(!ccOpen)}>
              {t.boss.cc} {ccOpen ? '▾' : '▸'}
            </button>
          )}
          {chips.cc && ccOpen && CC.map((id) => <span key={id} className="boss-i cc">{t.team.status[id] ?? id}</span>)}
          {chips.rest.map((id) => <span key={id} className="boss-i">{t.team.status[id] ?? id}</span>)}
        </div>
      )}
      <a className="boss-guide" href={guideUrl(b)} target="_blank" rel="noopener noreferrer">{t.boss.guide}</a>
      <div className="boss-foot">
        <button type="button" className="btn" onClick={onClear}>{t.boss.noBoss}</button>
      </div>
    </div>
  );
}

// the stage chips: singularity's ranks in two rows (letter, pluses), joint challenge in words, the rest by number
function StagePicker({ t, B, b, stage, onStage }: { t: Texts; B: Bosses; b: Boss; stage: number; onStage: (i: number) => void }) {
  const labels = stagesOf(B, b).map((r) => r[3]);
  const chip = (key: string, text: string, on: boolean, go: () => void) => (
    <button key={key} type="button" className="boss-chip" aria-pressed={on} onClick={go}>{text}</button>
  );
  if (b.mode === 'ds') {
    const cur = rankParts(labels[stage] ?? '');
    const parts = labels.map(rankParts);
    // a letter keeps the pluses picked (or the nearest it has); pluses keep the letter
    const find = (letter: string, plus: string) => {
      const i = parts.findIndex((p) => p.letter === letter && p.plus === plus);
      return i >= 0 ? i : parts.findIndex((p) => p.letter === letter);
    };
    const letters = uniq(parts.map((p) => p.letter));
    const pluses = uniq(parts.filter((p) => p.letter === cur.letter).map((p) => p.plus));
    return (
      <div className="boss-stage">
        <p className="boss-sl">{t.boss.rank}</p>
        <div className="boss-chips">{letters.map((l) => chip(l, l, l === cur.letter, () => onStage(find(l, cur.plus))))}</div>
        {pluses.length > 1 && (
          <div className="boss-chips">{pluses.map((p) => chip(p || '0', p || '—', p === cur.plus, () => onStage(find(cur.letter, p))))}</div>
        )}
      </div>
    );
  }
  return (
    <div className="boss-stage">
      <p className="boss-sl">{b.mode === 'jc' ? t.boss.difficulty : t.boss.stage}</p>
      <div className="boss-chips">{labels.map((l, i) => chip(String(i), stageText(t, b, l), i === stage, () => onStage(i)))}</div>
    </div>
  );
}
