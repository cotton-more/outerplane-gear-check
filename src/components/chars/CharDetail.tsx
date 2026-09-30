// Билды персонажа по outerpedia: сеты, оружие и аксессуар с main stat, приоритет сабстатов, талисманы, заметка.
// На узком экране — полноэкранная шторка поверх списка.
import { Fragment, useEffect, useState } from 'react';
import { FLAT } from '../../data';
import type { Build, Char, GearKind, GearRef, SlotId } from '../../data/types';
import { useT } from '../../i18n';
import type { Ctx } from '../../logic/context';
import { flatFactor } from '../../logic/score';
import { cap, classText } from '../../logic/text';
import type { RosterApi } from '../../state/useRoster';
import type { GearApi } from '../../state/useGear';
import type { GearStore, Piece } from '../../logic/gear';
import { isStats, play, setMark, type PoolView } from '../../logic/pool';
import { badgeOf } from '../../logic/poolVs';
import type { Variant } from '../../logic/variants';
import { BuildGear, PieceSheet } from './BuildGear';
import { PoolList } from './PoolList';
import { VariantChips } from './VariantChips';
import { ClassIcon, ElementIcon, Frame, Img, SetIcon, TalismanIcon } from '../Img';
import { tour } from '../../tour/anchors';

const ROLE: Record<string, string> = { dps: 'DPS', support: 'Support', sustain: 'Sustain' };
// оценка outerpedia PvE / PvP (S…E): подпись приглушённая, буква — плашкой цвета оценки (chars.css .tier-*)
const Tier = ({ k, v }: { k: string; v: string }) => (
  <span className="tier"><span className="tier-k">{k}</span><b className={`tier-v tier-${v.toLowerCase()}`}>{v}</b></span>
);

// active — вкладка «Персонажи» на экране: карточка вещи (шторка в <body>) закрывается, когда её нет;
// view — пул (logic/pool); onTryOn — примерка варианта этого персонажа (BuildGear; у «По статам» b — его билд с именем
// STATS: примерка «По статам», logic/tryon); onOpenChar — карточка другого
// персонажа (его Core Fusion); onGearToast — сообщение с «Вернуть» («Убрать у Caren»)
interface Props {
  charId: string | null; ctx: Ctx; view: PoolView; rosterApi: RosterApi; gear: GearApi; active: boolean; sheetOpen: boolean; onClose: () => void;
  onTryOn?: (c: Char, b: Build, slot?: SlotId, from?: Piece, combo?: string | null) => void;
  onPieceOpen?: (open: boolean) => void;
  onOpenChar?: (id: string) => void;
  onGearToast?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
}

// ранг варианта для заголовка и выбора: доля сборки, потом итог сборки, потом порядок outerpedia
const rankOf = (cpAsm: Map<string, { progress: number; need: number; total: number }>, v: Variant) => {
  const a = cpAsm.get(v.key)!;
  return [a.need ? a.progress / a.need : 0, a.total];
};
const byRank = (asm: Map<string, { progress: number; need: number; total: number }>) => (x: Variant, z: Variant) => {
  const [a1, a2] = rankOf(asm, x), [z1, z2] = rankOf(asm, z);
  return z1 - a1 || z2 - a2;
};

// Родитель задаёт key={charId}: смена персонажа сбрасывает выбранный билд и прокрутку.
export function CharDetail({ charId, ctx, view, rosterApi, gear, active, sheetOpen, onClose, onTryOn, onPieceOpen, onOpenChar, onGearToast }: Props) {
  const { D, CHAR } = ctx.idx;
  const t = useT();
  const c = charId ? CHAR[charId] : undefined;
  const cp = c ? view.of(c.id) : null;
  // вкладка: 'stats' — «По статам», иначе номер билда; при открытии — билд лучшего варианта
  const lead = cp ? [...cp.inPlay].filter((v) => !v.dupOf).sort(byRank(cp.asm))[0] ?? null : null;
  const [tab, setTab] = useState<number | 'stats'>(() => (lead ? (isStats(lead) ? 'stats' : Math.max(0, c!.builds.indexOf(lead.parent))) : 0));
  const [picked, setPicked] = useState<Record<string, string>>({}); // вкладка → выбранный вариант (чипы)
  const [pieceId, setPieceId] = useState<string | null>(null);
  // ушли с вкладки («← Оценка», #slug, «назад») — карточка вещи закрывается, а не висит поверх «Оценки»
  useEffect(() => { if (!active) setPieceId(null); }, [active]);
  const piece = pieceId ? gear.store.pieces[pieceId] : undefined;
  const shownPiece = active && !!piece && !!cp?.pieces.some((p) => p.id === pieceId);
  useEffect(() => { onPieceOpen?.(shownPiece); }, [shownPiece]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPieceOpen?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.body.classList.toggle('sheet-open', sheetOpen);
    return () => document.body.classList.remove('sheet-open');
  }, [sheetOpen]);

  if (!c) {
    return (
      <aside className="panel char-detail" id="char-detail" aria-label={t.ui.charBuilds}>
        <div className="cd-empty">{t.ui.pickChar}</div>
      </aside>
    );
  }
  const own = rosterApi.roster.has(c.id);
  const elName = D.elements[c.element] || c.element;
  const clsName = D.classes[c.class] || c.class;
  // есть Core Fusion этого героя (logic/fusion): он неактивен — в ростере и с вещами Core Fusion; звезда — «Вернуться к X?»
  const fusedBy = ctx.off.has(c.id) ? CHAR[ctx.off.get(c.id)!] : null;
  const asm = cp!.asm;
  const variantsOfBuild = (b: Build) => cp!.variants.filter((v) => v.parent === b && !isStats(v)).sort(byRank(asm));
  const has = cp!.pieces.length > 0;
  // «N/6» на вкладке — у лучшего варианта билда
  const badge = (b: Build) => (has ? Math.max(0, ...variantsOfBuild(b).map((v) => badgeOf(asm.get(v.key)!))) : 0);
  const statsTab = tab === 'stats' && cp!.stat;
  const bi = typeof tab === 'number' ? Math.min(tab, c.builds.length - 1) : 0;
  const b = statsTab ? cp!.stat!.parent : c.builds[bi];
  const list = b && !statsTab ? variantsOfBuild(b) : [];
  const v = statsTab ? cp!.stat! : list.find((x) => x.key === picked[String(tab)]) ?? list[0];
  // «Собираю»: нажали — противоположная отметка, а если так было бы и без неё — отметку снять
  const onWant = (x: Variant) => {
    const on = cp!.inPlay.includes(x);
    const { [x.key]: _, ...rest } = gear.store.marks ?? {};
    const auto = play(ctx, c, cp!.pieces, { marks: rest, tryOn: view.opts.tryOn }).inPlay.some((y) => y.key === x.key);
    gear.set(setMark(gear.store, x.key, !on === auto ? null : !on ? 'want' : 'skip'));
  };
  // заголовок: лучше всего собран / ближе всех к сборке; «Собраны ещё»; «По статам», если ничего не начато (он живой:
  // ни одной вещи из сетов связок и рекомендованного оружия из списков, Р12, Р18, П3, а не по «Собираю» — иначе «ни один
  // билд не начат» при «Не собираю»)
  const shownLead = lead && !isStats(lead) ? lead : null;
  const done = cp!.inPlay.filter((x) => !isStats(x) && !x.dupOf && asm.get(x.key)!.need && asm.get(x.key)!.progress === asm.get(x.key)!.need);
  const la = shownLead ? asm.get(shownLead.key)! : null;
  const headline = !has ? null : cp!.statLive && !cp!.inPlay.some((x) => !isStats(x) && asm.get(x.key)!.progress > 0)
    ? <p className="cd-lead"><span>{t.ui.cdStats(c.name)}</span></p>
    : la && shownLead && la.progress > 0
      ? (
        <p className="cd-lead">
          <span>{la.progress === la.need ? t.ui.cdBest(shownLead.name, la.progress, la.need) : t.ui.cdClosest(shownLead.name, la.progress, la.need)}</span>
          {done.filter((x) => x !== shownLead).length > 0 && <span className="muted small">{t.ui.cdAlso(done.filter((x) => x !== shownLead).map((x) => x.name).join(', '))}</span>}
        </p>
      )
      : null;
  // разовая подсказка после переноса: вариант теперь собирается сам; закрыл — ключ удалён. Вещей нет (ушли к Core Fusion
  // или от него) — не о чем
  const autoNew = has ? (gear.store.autoNew ?? []).filter((k) => k.startsWith(c.id + '/') && cp!.variants.some((x) => x.key === k)) : [];
  const dismiss = (k: string) => gear.set({ ...gear.store, autoNew: (gear.store.autoNew ?? []).filter((x) => x !== k) });
  return (
    <aside className="panel char-detail open" id="char-detail" aria-label={t.ui.charBuilds}>
      <div className="cd-top"><button type="button" className="btn" onClick={onClose}>{t.ui.toList}</button></div>
      <div className="cd-head">
        {/* стихия и класс — значками на подложке поверх портрета: названия класса и стихии на экране нет, поэтому aria-label */}
        <span className="cd-face">
          <Img k={'face:' + c.icon} className="face" />
          <span className="cd-badge el" role="img" aria-label={elName} title={elName}><ElementIcon el={c.element} /></span>
          <span className="cd-badge cls" role="img" aria-label={clsName} title={clsName}><ClassIcon cls={c.class} /></span>
        </span>
        <div>
          <div className="cd-name">
            <h2>{c.name}</h2>
            <button type="button" className="cd-star" aria-pressed={own} aria-label={t.ui.rosterToggle(c.name, own)} onClick={() => rosterApi.toggle(c.id)}>
              {own ? '★' : '☆'}
            </button>
          </div>
          {/* класса текстом нет — его показывает значок; подкласс есть у всех, но без него — название класса */}
          <div className="meta">{[c.subClass ? cap(c.subClass) : clsName, c.role && (ROLE[c.role] || c.role)].filter(Boolean).join(' · ')}</div>
        </div>
        {/* оценки outerpedia, прозвище (режется многоточием) и ссылка на страницу персонажа — без языкового префикса: /ru/ нет */}
        <div className="cd-foot">
          {c.rank && <Tier k="PvE" v={c.rank} />}
          {c.rankPvp && <Tier k="PvP" v={c.rankPvp} />}
          {c.nick && c.nick !== c.prefix && <span className="cd-nick muted small">{c.nick}</span>}
          <a className="cd-opedia" href={`https://outerpedia.com/characters/${c.slug}`} target="_blank" rel="noopener noreferrer"
            aria-label={t.ui.opediaAria(c.name)}>{t.ui.opedia} ↗</a>
        </div>
      </div>
      {fusedBy && (
        <div className="own-row">
          <button type="button" className="linkbtn small" onClick={() => onOpenChar?.(fusedBy.id)}>{t.ui.fusionOffCard(c.name)}</button>
        </div>
      )}
      {headline}
      {autoNew.map((k) => (
        <p key={k} className="cd-note">
          <span>{t.ui.autoNew(cp!.variants.find((x) => x.key === k)!.name, c.name)}</span>
          <button type="button" className="tour-x" aria-label={t.ui.close} onClick={() => dismiss(k)}>✕</button>
        </p>
      ))}
      {b && v ? (
        <>
          {/* «По статам» — отдельный билд у каждого персонажа с билдами (находка 28): вкладка последней */}
          <div className="btabs" role="tablist" aria-label={t.ui.builds} {...((c.builds.length > 1 || cp!.stat) && tour('btabs'))}>
            {c.builds.map((x, i) => {
              const one = variantsOfBuild(x);
              const dup = one.length === 1 && one[0].dupOf ? cp!.variants.find((y) => y.key === one[0].dupOf) : null;
              return (
                <button key={i} type="button" role="tab" aria-selected={!statsTab && x === b} onClick={() => setTab(i)}>
                  {x.name}{dup ? <span className="bt-n">{t.ui.dupOf(dup.name)}</span> : badge(x) > 0 && <span className="bt-n">{badge(x)}/6</span>}
                </button>
              );
            })}
            {cp!.stat && (
              <button type="button" role="tab" aria-selected={!!statsTab} onClick={() => setTab('stats')}>
                {t.ui.byStats}{has && <span className="bt-n">{badgeOf(asm.get(cp!.stat.key)!)}/6</span>}
              </button>
            )}
          </div>
          {list.length > 1 && <VariantChips list={list} cur={v} cp={cp!} ctx={ctx} st={gear.store} onPick={(x) => setPicked((p) => ({ ...p, [String(tab)]: x.key }))} onWant={onWant} />}
          <BuildGear c={c} v={v} cp={cp!} ctx={ctx} gear={gear} view={view} onOpenPiece={setPieceId} onWant={onWant}
            onTryOn={onTryOn && ((x, slot, from, combo) => onTryOn(c, x, slot, from, combo))} />
          <PoolList cp={cp!} ctx={ctx} gear={gear} view={view} own={own} onOpenPiece={setPieceId} onRemoved={onGearToast} />
          {shownPiece && piece && <PieceSheet c={c} p={piece} ctx={ctx} gear={gear} view={view} onClose={() => setPieceId(null)} onRemoved={onGearToast}
            onTry={onTryOn ? () => { setPieceId(null); onTryOn(c, statsTab ? v.b : v.parent, piece.slot, piece, v.sig); } : undefined} />}
          {!statsTab && <BuildView c={c} b={b} ctx={ctx} />}
        </>
      ) : (
        <div className="cd-empty">
          {t.ui.noBuilds}
          {c.gameSets && c.gameSets.length > 0 && <><br />{t.ui.gameSets(c.gameSets.map((id) => ctx.idx.SET[id]?.short ?? id).join(', '))}</>}
        </div>
      )}
    </aside>
  );
}

function BuildView({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const { D, SET, SUB } = ctx.idx;
  const t = useT();
  return (
    <div className="bsec">
      <div>
        <h4>{t.ui.armorSets}</h4>
        {b.sets.length ? b.sets.map((combo, i) => (
          <div key={i} className="combo">
            {i > 0 && <span className="or">{t.ui.or}</span>}
            {combo.map((p, j) => {
              const st = SET[p.set];
              return <span key={j} className="setpill"><SetIcon set={st} />{st ? st.short : p.set} <span className="n">×{p.n}</span></span>;
            })}
          </div>
        )) : <span className="muted">—</span>}
      </div>
      <GearBlock title={t.ui.weapon} refs={b.weapons} kind="weapon" ctx={ctx} />
      <GearBlock title={t.ui.accessory} refs={b.amulets} kind="accessory" ctx={ctx} />
      <div>
        <h4>{t.ui.subPriority}</h4>
        <div className="prio" {...tour('prio')}>
          {b.subs.map((tier, ti) => (
            <Fragment key={ti}>
              {ti > 0 && <span className="gt">›</span>}
              {tier.length ? tier.map((k, j) => (
                <Fragment key={k}>
                  {j > 0 && <span className="gt">=</span>}
                  {SUB[k] || FLAT.has(k.replace(/%$/, ''))
                    ? <span className={`tok t${Math.min(ti, 2)}`}>{k}</span>
                    : <span className="tok no" title={t.ui.notSub}>{k}</span>}
                </Fragment>
              )) : <span className="gt" title={t.ui.prioGap}>…</span>}
            </Fragment>
          ))}
        </div>
        <PrioHint c={c} b={b} ctx={ctx} />
      </div>
      {b.talismans.length > 0 && (
        <div>
          <h4>{t.ui.talismans}</h4>
          <div className="tal">
            {b.talismans.map((id) => {
              const t = D.talismans[id];
              return <span key={id}><TalismanIcon icon={t.icon} />{t.name}{t.name === "Executioner's Charm" ? ' +10' : ''}</span>;
            })}
          </div>
        </div>
      )}
      {b.note && <div><h4>{t.ui.buildNote}</h4><div className="bnote">{b.note}</div></div>}
    </div>
  );
}

// «ATK, DEF, HP в приоритете — что брать: flat или %» для этого персонажа
function PrioHint({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const axes = [...new Set(b.subs.flat().map((k) => k.replace(/%$/, '')).filter((k) => FLAT.has(k)))];
  const t = useT();
  if (!axes.length) return null;
  const { lv120, quirks } = ctx.settings;
  return (
    <>
      <ul className="prio-hint">
        {axes.map((ax) => {
          const r = flatFactor(ctx, c, ax);
          const pct = Math.round(r * 100);
          if (Math.abs(1 / r - 1) <= 0.05) return <li key={ax}><b>{ax}</b>{t.ui.flatEqual(ax)}</li>;
          if (r > 1) return <li key={ax}><b>{ax}</b>{t.ui.flatBetter(ax, pct)}</li>;
          return <li key={ax}><b>{ax}</b>{t.ui.pctBetter(ax, pct)}</li>;
        })}
      </ul>
      <p className="muted small" style={{ margin: '4px 0 0' }}>{t.ui.flatFor(lv120 ? 120 : 100, quirks)}</p>
    </>
  );
}

function GearBlock({ title, refs, kind, ctx }: { title: string; refs: GearRef[]; kind: GearKind; ctx: Ctx }) {
  const { D, ITEM } = ctx.idx;
  const t = useT();
  if (!refs.length) return null;
  return (
    <div>
      <h4>{title}</h4>
      <div className="gear">
        {refs.map((g) => {
          const it = ITEM[kind][g.key];
          if (!it) return null;
          return (
            <div key={g.key} className="gearrow">
              <Frame item={it} />
              <div>
                <b>{it.name}</b>
                {it.passives[0] && <> <span className="ps">· {it.passives[0].name}</span></>}
                {it.star < 6 && <> <span className="ps">· {it.star}★</span></>}
                <div className="gm">
                  {g.mains.map((m) => <span key={m} className="tok ok">{m}</span>)}
                  {(g.bad || []).map((m) => <span key={'bad' + m} className="tok bad" title={t.ui.badMain}>{m}?</span>)}
                  {it.classLimits.length > 0 && <span className="tok">{classText(it, D.classes, t.anyClass)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
