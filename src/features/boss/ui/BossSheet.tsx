// The boss sheet (mockups OK 2026-10-12, .x/0200-boss/mock; redesigned in .x/0206-boss-sheet, owner 2026-10-14): a draft —
// the boss and the stage change freely inside, «Команда» changes only on the gold «Выбрать» (Q2); ✕, a tap outside or Esc
// cancel (the boss and stage stay as before). Removing the boss is the ✕ on the boss slot, not here.
// The card: the portrait on a wash of the boss's element, the name, the kind (guild raid — the raid and main / sub), «Другой»;
// the stage picker in gold (special request and guild raid — a grid of numbers, singularity — the letters and a «— | + | ++»
// switch, joint challenge — a three-way switch of words); SPD and RES at the stage as two medallions with the stats' icons,
// no words; immunities («Контроль» stands for the six hard CC ids; tap lists them); the outerpedia guide. Without a boss (or
// after «Другой») — the list of fights by group with a name search, a portrait on every row; a tap opens the card.
import { useState, type CSSProperties } from 'react';
import type { Boss, Bosses } from '@/game/data/types';
import { useIndex } from '@/game/data/IndexContext';
import { ElementIcon, Icon, SetIcon, StatIcon } from '@/game/icons/Img';
import { useT, type Texts } from '@/i18n';
import { Sheet } from '@/shared/ui/Sheet';
import { stageText } from './stageText';
import { BossFace } from './BossFace';
import { bossGroups, bossOf, CC, factsAt, guideUrl, immunityChips, rankParts, stagesOf, topStage, uniq } from '../model/boss';

// boss — the one on «Команда» (null — none); stageOf — a boss's stored stage (fitStage); onPick — «Выбрать»
export function BossSheet({ B, boss, stageOf, now, onPick, onClose }: {
  B: Bosses; boss: Boss | null; stageOf: (b: Boss) => number; now: number;
  onPick: (key: string, stage: number) => void; onClose: () => void;
}) {
  const t = useT();
  const [key, setKey] = useState(boss?.key ?? null);
  const [stages, setStages] = useState<Record<string, number>>({});
  const [list, setList] = useState(!boss);
  const b = bossOf(B, key);
  const stage = b ? stages[b.key] ?? stageOf(b) : 0;
  const card = !list && b;
  return (
    <Sheet title={card ? t.boss.title : t.boss.which} onClose={onClose} className="boss-sheet"
      foot={card ? <button type="button" className="boss-go" onClick={() => onPick(b.key, stage)}>{t.boss.pick}</button> : undefined}>
      {card
        ? <BossView t={t} B={B} b={b} stage={stage} now={now} onStage={(i) => setStages({ ...stages, [b.key]: i })} onOther={() => setList(true)} />
        : <BossList B={B} now={now} current={key} onPick={(k) => { setKey(k); setList(false); }} />}
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
        <button type="button" className="boss-li" aria-pressed={b.key === current} onClick={() => onPick(b.key)}>
          <BossFace b={b} />
          <span className="boss-ln">{b.name}</span>
          {(live || role) && <span className="boss-ls">{live ? <span className="boss-live">{live}</span> : role}</span>}
          {top && <span className="boss-lr"><StatIcon stat="RES" /><span className="sr-only">RES </span>{top.res}</span>}
        </button>
      </li>
    );
  };
  return (
    <div className="boss-list">
      <input className="pick-q" type="search" value={q} placeholder={t.team.search} aria-label={t.team.search} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g) => (
        <section key={g.key} className="boss-g">
          <p className={g.key === 'live' ? 'boss-gh now' : 'boss-gh'}>{t.boss.group[g.key]}</p>
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

function BossView({ t, B, b, stage, now, onStage, onOther }: {
  t: Texts; B: Bosses; b: Boss; stage: number; now: number; onStage: (i: number) => void; onOther: () => void;
}) {
  const idx = useIndex();
  const speed = Object.values(idx.SET).find((x) => x.short === 'Speed');
  const [ccOpen, setCcOpen] = useState(false);
  const f = factsAt(B, b, stage);
  const live = until(t, b, now), role = raidRole(t, b);
  const chips = f ? immunityChips(f.imm) : { cc: false, rest: [] };
  const sub = [b.mode === 'gr' ? `${t.boss.group.gr} · ${b.group ?? ''}` : t.boss.group[b.mode], role].filter(Boolean).join(' · ');
  return (
    <div className="boss-view">
      <div className={`boss-card el-${b.element}`}>
        <span className="boss-cf"><BossFace b={b} /><span className="boss-ce"><ElementIcon el={b.element} /></span></span>
        <b className="boss-cn">{b.name}</b>
        <span className="boss-cs">{sub}{live && <> <span className="boss-live">{live}</span></>}</span>
        <button type="button" className="boss-co" onClick={onOther}><Icon name="arrows-exchange" />{t.boss.other}</button>
      </div>
      <StagePicker t={t} B={B} b={b} stage={stage} onStage={onStage} />
      {f && (
        <div className="boss-facts">
          <div><SetIcon set={speed} /><span className="sr-only">SPD </span><b>{f.spd}</b></div>
          <div><StatIcon stat="RES" /><span className="sr-only">RES </span><b>{f.res}</b></div>
        </div>
      )}
      {f && f.imm.length > 0 && (
        <div className="boss-imm">
          <p className="boss-il"><Icon name="shield-check" />{t.boss.immune}</p>
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
    </div>
  );
}

// the stage picker, the chosen one in gold: singularity — the letters in a grid and the pluses as a three-way switch; joint
// challenge — a switch of the three words; the rest — a grid of numbers in two even rows (13 → 7 + 6, 10 → 5 + 5; 5 — one row)
function StagePicker({ t, B, b, stage, onStage }: { t: Texts; B: Bosses; b: Boss; stage: number; onStage: (i: number) => void }) {
  const labels = stagesOf(B, b).map((r) => r[3]);
  const chip = (key: string, text: string, on: boolean, go: () => void) => (
    <button key={key} type="button" aria-pressed={on} onClick={go}>{text}</button>
  );
  const grid = (n: number) => ({ '--n': n > 5 ? Math.ceil(n / 2) : n }) as CSSProperties;
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
        <div className="boss-chips" style={grid(letters.length)}>{letters.map((l) => chip(l, l, l === cur.letter, () => onStage(find(l, cur.plus))))}</div>
        {pluses.length > 1 && (
          <div className="boss-seg plus" style={{ '--n': pluses.length } as CSSProperties}>{pluses.map((p) => chip(p || '0', p || '—', p === cur.plus, () => onStage(find(cur.letter, p))))}</div>
        )}
      </div>
    );
  }
  if (b.mode === 'jc') {
    return (
      <div className="boss-stage">
        <p className="boss-sl">{t.boss.difficulty}</p>
        <div className="boss-seg" style={{ '--n': labels.length } as CSSProperties}>{labels.map((l, i) => chip(String(i), stageText(t, b, l), i === stage, () => onStage(i)))}</div>
      </div>
    );
  }
  return (
    <div className="boss-stage">
      <p className="boss-sl">{t.boss.stage}</p>
      <div className="boss-chips" style={grid(labels.length)}>{labels.map((l, i) => chip(String(i), stageText(t, b, l), i === stage, () => onStage(i)))}</div>
    </div>
  );
}
