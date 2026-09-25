// Билды персонажа по outerpedia: сеты, оружие и аксессуар с main stat, приоритет сабстатов, талисманы, заметка.
// На узком экране — полноэкранная шторка поверх списка.
import { Fragment, useEffect, useState } from 'react';
import { FLAT } from '../../data';
import type { Build, Char, GearKind, GearRef } from '../../data/types';
import type { Ctx } from '../../logic/context';
import { flatFactor } from '../../logic/score';
import { cap, classText } from '../../logic/text';
import type { RosterApi } from '../../state/useRoster';
import { Frame, Img } from '../Img';

const ROLE: Record<string, string> = { dps: 'DPS', support: 'Support', sustain: 'Sustain' };

interface Props { charId: string | null; ctx: Ctx; rosterApi: RosterApi; sheetOpen: boolean; onClose: () => void }

// Родитель задаёт key={charId}: смена персонажа сбрасывает выбранный билд и прокрутку.
export function CharDetail({ charId, ctx, rosterApi, sheetOpen, onClose }: Props) {
  const { D, CHAR } = ctx.idx;
  const c = charId ? CHAR[charId] : undefined;
  const [bi, setBi] = useState(0);
  useEffect(() => {
    document.body.classList.toggle('sheet-open', sheetOpen);
    return () => document.body.classList.remove('sheet-open');
  }, [sheetOpen]);

  if (!c) {
    return (
      <aside className="panel char-detail" id="char-detail" aria-label="Билды персонажа">
        <div className="cd-empty">Выбери персонажа — покажу рекомендованные сеты, оружие, аксессуары и приоритет сабстатов по билдам outerpedia.</div>
      </aside>
    );
  }
  const own = rosterApi.roster.has(c.id);
  const b = c.builds[Math.min(bi, c.builds.length - 1)];
  return (
    <aside className="panel char-detail open" id="char-detail" aria-label="Билды персонажа">
      <div className="cd-top"><button type="button" className="btn" onClick={onClose}>← к списку</button></div>
      <div className="cd-head">
        <Img k={'face:' + c.icon} className="face" />
        <div>
          <h2>{c.name}</h2>
          <div className="meta">
            <span><Img k={'elem:' + c.element} /> {D.elements[c.element] || c.element}</span>
            <span><Img k={'class:' + c.class} /> {D.classes[c.class] || c.class}{c.subClass ? ' · ' + cap(c.subClass) : ''}</span>
            {c.role && <span>{ROLE[c.role] || c.role}</span>}
            {c.rank && <span>PvE {c.rank}</span>}
            {c.rankPvp && <span>PvP {c.rankPvp}</span>}
          </div>
          {c.nick && c.nick !== c.prefix && <div className="muted small">{c.nick}</div>}
        </div>
      </div>
      <div className="own-row">
        <button type="button" className="own-btn" aria-pressed={own} onClick={() => rosterApi.toggle(c.id)}>{own ? '★ в ростере' : '☆ добавить в ростер'}</button>
      </div>
      {b ? (
        <>
          <div className="btabs" role="tablist" aria-label="Билды">
            {c.builds.map((x, i) => (
              <button key={i} type="button" role="tab" aria-selected={x === b} onClick={() => setBi(i)}>{x.name}</button>
            ))}
          </div>
          <BuildView c={c} b={b} ctx={ctx} />
        </>
      ) : (
        <div className="cd-empty">
          У outerpedia пока нет рекомендаций по шмоту для этого персонажа.
          {c.gameSets && c.gameSets.length > 0 && <><br />Сама игра советует сеты: {c.gameSets.map((id) => ctx.idx.SET[id]?.short ?? id).join(', ')}.</>}
        </div>
      )}
    </aside>
  );
}

function BuildView({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const { D, SET, SUB } = ctx.idx;
  return (
    <div className="bsec">
      <div>
        <h4>Сеты брони</h4>
        {b.sets.length ? b.sets.map((combo, i) => (
          <div key={i} className="combo">
            {i > 0 && <span className="or">или</span>}
            {combo.map((p, j) => {
              const st = SET[p.set];
              return <span key={j} className="setpill"><Img k={'eq:' + (st ? st.icon : '')} />{st ? st.short : p.set} <span className="n">×{p.n}</span></span>;
            })}
          </div>
        )) : <span className="muted">—</span>}
      </div>
      <GearBlock title="Оружие" refs={b.weapons} kind="weapon" ctx={ctx} />
      <GearBlock title="Аксессуар" refs={b.amulets} kind="accessory" ctx={ctx} />
      <div>
        <h4>Приоритет сабстатов</h4>
        <div className="prio">
          {b.subs.map((tier, t) => (
            <Fragment key={t}>
              {t > 0 && <span className="gt">›</span>}
              {tier.length ? tier.map((k, j) => (
                <Fragment key={k}>
                  {j > 0 && <span className="gt">=</span>}
                  {SUB[k] || FLAT.has(k.replace(/%$/, ''))
                    ? <span className={`tok t${Math.min(t, 2)}`}>{k}</span>
                    : <span className="tok no" title="не выпадает сабстатом на 6★ снаряжении">{k}</span>}
                </Fragment>
              )) : <span className="gt" title="разрыв в приоритете">…</span>}
            </Fragment>
          ))}
        </div>
        <PrioHint c={c} b={b} ctx={ctx} />
      </div>
      {b.talismans.length > 0 && (
        <div>
          <h4>Талисманы</h4>
          <div className="tal">
            {b.talismans.map((id) => {
              const t = D.talismans[id];
              return <span key={id}><Img k={'eq:' + t.icon} />{t.name}{t.name === "Executioner's Charm" ? ' +10' : ''}</span>;
            })}
          </div>
        </div>
      )}
      {b.note && <div><h4>Заметка outerpedia</h4><div className="bnote">{b.note}</div></div>}
    </div>
  );
}

// «ATK, DEF, HP в приоритете — что брать: flat или %» для этого персонажа
function PrioHint({ c, b, ctx }: { c: Char; b: Build; ctx: Ctx }) {
  const axes = [...new Set(b.subs.flat().map((k) => k.replace(/%$/, '')).filter((k) => FLAT.has(k)))];
  if (!axes.length) return null;
  const { lv120, quirks } = ctx.settings;
  return (
    <>
      <ul className="prio-hint">
        {axes.map((ax) => {
          const r = flatFactor(ctx, c, ax);
          const pct = Math.round(r * 100);
          if (Math.abs(1 / r - 1) <= 0.05) return <li key={ax}><b>{ax}</b> — flat и {ax}% примерно равны, бери любой.</li>;
          if (r > 1) return <li key={ax}><b>{ax}</b> — выгоднее flat: сегмент flat {ax} даёт ≈{pct}% от сегмента {ax}% (то есть больше).</li>;
          return <li key={ax}><b>{ax}</b> — выгоднее {ax}%: сегмент flat {ax} даёт только ≈{pct}% от сегмента {ax}%.</li>;
        })}
      </ul>
      <p className="muted small" style={{ margin: '4px 0 0' }}>Для lv {lv120 ? 120 : 100}{quirks ? ' с прокачанными Quirks' : ' без Quirks'} — меняется в «Настройках оценки».</p>
    </>
  );
}

function GearBlock({ title, refs, kind, ctx }: { title: string; refs: GearRef[]; kind: GearKind; ctx: Ctx }) {
  const { D, ITEM } = ctx.idx;
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
                  {(g.bad || []).map((m) => <span key={'bad' + m} className="tok bad" title="у этого предмета не бывает такого main stat — вероятно, опечатка в outerpedia">{m}?</span>)}
                  {it.classLimits.length > 0 && <span className="tok">{classText(it, D.classes)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
