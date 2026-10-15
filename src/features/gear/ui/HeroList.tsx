// The hero list under the verdict stamp (0230 B, replaces «Сейчас на персонажах» and «Кому надеть?»): groups «Вместо надетого» /
// «В пустой слот» / «Отложить» (features/gear/model/heroList), three rows each and «ещё N ▸» for the rest; the switch «Кратко ·
// Подробно» (React state, all rows at once) adds what the piece gives the hero and what it replaces; name search at the end.
// Hero mode keeps its single row (HeroSingle: the hero's outcome lines and the button).
import { useMemo, useState } from 'react';
import type { Char } from '@/game/data/types';
import type { Ctx } from '@/game/context';
import { useT } from '@/i18n';
import { useIndex } from '@/game/data/IndexContext';
import type { Part } from '@/game/build/score';
import type { ItemInput } from '@/game/item/item';
import type { PoolView } from '@/features/gear/pool';
import type { CharVs } from '@/features/gear/model/poolVs';
import { heroRow, type HeroGroup, type HeroRow } from '@/features/gear/model/heroList';
import { namedGain } from '@/features/gear/model/vs';
import { partText } from '@/game/set/setName';
import { HeroFace } from '@/game/hero/HeroFace';
import { HeroName } from '@/game/hero/HeroName';
import { SubToken } from '@/game/item/SubToken';
import { Icon } from '@/game/icons/Img';
import { Expand } from '@/shared/ui/Expand';
import { tour } from '@/tour/anchors';
import { VsChip } from './VsChip';
import { EquipButton } from './EquipButton';
import { heroLines } from './outcomeText';
import { usePieceLabel } from './pieceText';

// rows a name search shows
const FOUND_CAP = 8;

// an outcome line list of the hero (outcomeText heroLines): the half-sets, the pool's pieces that go with it, why to keep it
export function OutcomeLines({ x, item, brief = false }: { x: CharVs; item: ItemInput; brief?: boolean }) {
  const t = useT();
  const idx = useIndex();
  const label = usePieceLabel();
  const lines = heroLines(t, idx, x.h, item, label, brief);
  return <>{lines.map((l, i) => <p key={i}>{l}</p>)}</>;
}

// the piece's substats as the chips of the hero's chain: green counts, yellow half, grey none
function Subs({ parts, lit }: { parts: Part[]; lit: Record<string, number> }) {
  return <>{parts.map((p) => <SubToken key={p.key} stat={p.key} lit={lit[p.key] ?? 0} credit={p.ok ? (p.half ? 0.5 : 1) : 0} />)}</>;
}

// compact — the phone's sheet: no switch, a tap on the row's face, name and note expands its detail in place (the name doesn't
// open the hero there); legend — the quiet line of the chip colours, under the first expanded row
function HeroRowView({ row, item, detail, compact = false, legend = false, onToggle, onEquip, onStash, onOpenChar }: {
  row: HeroRow; item: ItemInput; detail: boolean; compact?: boolean; legend?: boolean; onToggle?: () => void;
  onEquip?: (c: Char) => void; onStash?: (c: Char) => void; onOpenChar: (id: string) => void;
}) {
  const t = useT();
  const idx = useIndex();
  const c = row.vs.c;
  const notes: string[] = [];
  if (row.was && !row.stash) notes.push(t.fit.instead(t.fit.pts(row.was.pts)));
  if (row.parts.on.length) notes.push(t.fit.rowOn(row.parts.on.map((p) => partText(idx, p)).join(', ')));
  if (row.parts.off.length) notes.push(t.fit.rowOff(row.parts.off.map((p) => partText(idx, p)).join(', ')));
  const act = row.action === 'stash' ? onStash : row.action ? onEquip : undefined;
  const btn = row.action === 'stash' ? { icon: 'archive' as const, text: t.fit.btnStash } : row.action === 'replace' ? { icon: 'replace' as const, text: t.fit.btnReplace } : { icon: 'check' as const, text: t.fit.btnEquip };
  const pill = row.stash ? <span className="vs fill">{row.stash === 'keep' ? t.fit.chipKeep : t.fit.chipReserve}</span>
    : namedGain(row.gain) ? <span className="vs up"><Icon name="trending-up" />+{t.fit.pts(row.gain)}</span> : null;
  const button = act && row.action && (
    <button type="button" className="btn vs-act hl-btn" onClick={() => act(c)} {...(row.action === 'stash' ? tour('stash') : {})}><Icon name={btn.icon} />{btn.text}</button>
  );
  return (
    <li className={`hl-row${row.star ? ' is-pick' : ''}${compact ? ' is-compact' : ''}`}>
      {compact ? (
        <div className="hl-l1">
          <button type="button" className="hl-tog" aria-expanded={detail} onClick={onToggle}>
            <HeroFace c={c} />
            <span className="hl-nm"><b><HeroName c={c} /></b>{row.star && <span className="hl-star" aria-hidden="true">★</span>}</span>
            {pill}
            <span className="hl-note">{notes.join(' · ')}</span>
          </button>
          {button}
        </div>
      ) : (
        <div className="hl-l1">
          <HeroFace c={c} />
          <span className="hl-nm">
            <button type="button" onClick={() => onOpenChar(c.id)}><b><HeroName c={c} /></b></button>
            {row.star && <span className="hl-star" aria-hidden="true">★</span>}
          </span>
          {pill}
          <span className="hl-note">{notes.join(' · ')}</span>
          {button}
        </div>
      )}
      {detail && row.vs.chain.parts.length > 0 && (
        <div className="hl-d"><span className="hl-dk">{t.fit.gives}</span><span className="bgear-t"><Subs parts={row.vs.chain.parts} lit={item.subs} /></span></div>
      )}
      {detail && row.was && (
        <div className="hl-d"><span className="hl-dk">{t.fit.wasLabel}</span>
          <span className="bgear-t"><Subs parts={row.was.marks} lit={row.was.piece.lit} /><span className="hl-pts">{t.fit.wasPts(t.fit.pts(row.was.pts))}</span></span>
        </div>
      )}
      {detail && legend && <p className="hl-legend muted small">{t.fit.chipLegend}</p>}
    </li>
  );
}

// the gold pill of the star controls (.lv-pill / .lv-seg of chars.css)
function ViewSwitch({ detail, onChange }: { detail: boolean; onChange: (d: boolean) => void }) {
  const t = useT();
  return (
    <div className="lv-pill hl-seg" role="group" aria-label={t.fit.viewSwitch}>
      <button type="button" className={`lv-seg${detail ? '' : ' on'}`} aria-pressed={!detail} onClick={() => onChange(false)}>{t.fit.viewBrief}</button>
      <button type="button" className={`lv-seg${detail ? ' on' : ''}`} aria-pressed={detail} onClick={() => onChange(true)}>{t.fit.viewDetail}</button>
    </div>
  );
}

export function HeroList({ groups, ctx, viewOf, item, search, compact = false, onEquip, onStash, onOpenChar }: {
  groups: HeroGroup[]; ctx: Ctx; viewOf: (charId: string) => PoolView; item: ItemInput; search: boolean; compact?: boolean;
  onEquip?: (c: Char) => void; onStash?: (c: Char) => void; onOpenChar: (id: string) => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({}); // compact: the rows expanded in place
  const needle = q.trim().toLowerCase();
  // name search: any hero of the game with builds (not X when there is a Core Fusion X), «Надеть» whatever the gain
  const found = useMemo(() => {
    if (!needle) return [];
    const { D } = ctx.idx;
    return D.chars.filter((c) => c.builds.length && (!ctx.off.has(c.id) || !!c.fusionOf) && c.name.toLowerCase().includes(needle))
      .map((c) => heroRow(ctx, viewOf(c.id), c.id, item, { any: true }))
      .filter((r): r is HeroRow => !!r).sort((a, z) => z.gain - a.gain).slice(0, FOUND_CAP);
  }, [ctx, viewOf, item, needle]);
  // compact: the first expanded row of the visible ones carries the legend
  const firstOpen = !compact ? null : [...groups.flatMap((g) => (open[g.kind] ? [...g.rows, ...g.more] : g.rows)), ...found].find((r) => openRows[r.vs.c.id])?.vs.c.id ?? null;
  const rows = (list: HeroRow[]) => list.map((r) => {
    const id = r.vs.c.id;
    return <HeroRowView key={id} row={r} item={item} detail={compact ? !!openRows[id] : detail} compact={compact} legend={id === firstOpen}
      onToggle={() => setOpenRows({ ...openRows, [id]: !openRows[id] })} onEquip={onEquip} onStash={onStash} onOpenChar={onOpenChar} />;
  });
  const head: Record<string, string> = { replace: t.fit.listReplace, empty: t.fit.listEmpty, stash: t.fit.listStash };
  if (!groups.length && !search) return null;
  return (
    <div className="hl">
      {groups.length > 0 && (
        <div {...tour('vs')}>
          {!compact && <div className="hl-bar"><ViewSwitch detail={detail} onChange={setDetail} /></div>}
          {!compact && detail && <p className="hl-legend muted small">{t.fit.chipLegend}</p>}
          {groups.map((g) => (
            <div key={g.kind} className="hl-grp">
              <div className="v-list-h"><h3>{head[g.kind]}</h3></div>
              <ul className="hl-list">{rows(g.rows)}</ul>
              {g.more.length > 0 && (
                <div className="hl-more">
                  <Expand title={t.fit.more(g.more.length)} open={!!open[g.kind]} onToggle={(o) => setOpen({ ...open, [g.kind]: o })}>
                    <ul className="hl-list">{rows(g.more)}</ul>
                  </Expand>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {search && (
        <div className="hl-find">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.fit.findHero} aria-label={t.fit.findHero} />
          {needle && (found.length ? <ul className="hl-list">{rows(found)}</ul> : <p className="muted small">{t.fit.noHero}</p>)}
        </div>
      )}
    </div>
  );
}

// hero mode (the piece for one hero, «Примерить замену», entering what he wears): one row, as before the list — the hero, the
// chip, his outcome lines, «Надеть» / «Заменить» and, for «Оставь» and a reserve, «Отложить для X»
export function HeroSingle({ x, item, slot, t4 = false, nextNote = null, onEquip, onStash, onOpenChar }: {
  x: CharVs; item: ItemInput; slot: string; t4?: boolean; nextNote?: string | null; onEquip?: (x: CharVs) => void; onStash?: (x: CharVs) => void;
  onOpenChar: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="v-vs" {...tour('vs')}>
      <div className={`vs-row vs-${x.h.kind}`}>
        <div className="vs-h">
          <HeroFace c={x.c} />
          <div className="nm"><button type="button" onClick={() => onOpenChar(x.c.id)}><b><HeroName c={x.c} /></b></button></div>
          <VsChip x={x} />
        </div>
        <OutcomeLines x={x} item={item} />
        {onEquip && x.useful && <EquipButton place="vs-act" x={x} slot={slot} t4={t4} good={x.h.kind === 'wear'} onEquip={onEquip} />}
        {onStash && x.stash && <button type="button" className="btn vs-stash" onClick={() => onStash(x)} {...tour('stash')}><Icon name="archive" />{t.fit.stash(x.c.name)}</button>}
        {onEquip && x.asWorn && !x.replaces && <p className="muted small vs-wear">{t.ui.equipAsWorn}</p>}
        {onEquip && x.useful && nextNote && <p className="muted small vs-wear vs-next">{nextNote}</p>}
      </div>
    </div>
  );
}

// rows the phone card's line names before «ещё N ▸»
const NEXT_SHOWN = 2;

// The phone card's line under the big button (0230 H4): the next heroes of the list as portrait chips «Sigma +7,4 · Maxie +6,5 ·
// ещё 51 ▸»; the whole line is one button — it opens the «Вердикт» sheet with the groups. The tail counts every other hero of
// the list (rows behind «ещё N» of a group too)
export function NextHeroes({ rows, onOpen }: { rows: HeroRow[]; onOpen: () => void }) {
  const t = useT();
  const shown = rows.slice(0, NEXT_SHOWN);
  const rest = rows.length - shown.length;
  const label = (r: HeroRow) => (r.stash ? (r.stash === 'keep' ? t.fit.chipKeep : t.fit.chipReserve) : namedGain(r.gain) ? '+' + t.fit.pts(r.gain) : '');
  return (
    <button type="button" className="vc-heroes" onClick={onOpen} {...tour('vs')} aria-label={[...shown.map((r) => `${r.vs.c.name} ${label(r)}`.trim()), rest > 0 ? t.fit.more(rest) : ''].filter(Boolean).join(', ')}>
      {shown.map((r) => (
        <span key={r.vs.c.id} className="vh-chip">
          <HeroFace c={r.vs.c} /><b><HeroName c={r.vs.c} /></b>
          {label(r) && <span className={r.stash ? 'vh-v fill' : 'vh-v'}>{label(r)}</span>}
        </span>
      ))}
      {rest > 0 && <span className="vh-more">{t.fit.more(rest)}</span>}
    </button>
  );
}
