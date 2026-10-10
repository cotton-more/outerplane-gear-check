// Вкладка «Надето» (stat-sets макет 6.0, решения 3–4): что на герое сейчас в игре — включённые бонусы надетых сетов, 6 слотов
// (цвет сабстата — засчитан ли он герою, PLAN Д1), пустой слот — «Ввести» (режим героя на этот слот, форма — только слот),
// ниже — «Что искать»: наборы из билдов, где у героя 1–3 из 4, и каких слотов не хватает. Пустая вкладка: «Да, всё
// надето» — когда в вещах героя не больше одной на слот. «Переодеть» — кнопкой над вкладкой (CharDetail). Данные —
// features/worn/wearing (wornView); запись — CharDetail (onWearAll), у него же тост с «Вернуть».
import type { ReactNode } from 'react';
import { SLOTS } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { comboText } from '@/game/build/builds';
import { wearAll } from '@/features/gear/pool';
import type { WornView } from './wearing';
import type { GearApi } from '@/features/gear/store/useGear';
import { SlotIcon } from '@/game/icons/Img';
import { tour, tourItem } from '@/tour/anchors';
import { BtLabel, PieceName, bonusLinesOf } from '@/features/gear/ui/pieceText';
import { setName } from '@/game/set/setName';
import { SubToken } from '@/game/item/SubToken';
import { subLabel } from '@/game/data';
import { Rich } from '@/shared/ui/Rich';
import type { CSSProperties } from 'react';
import type { ChainSum } from './wearing';

// points to one decimal («37,7», «3,4») — fit.pts rounds itself
const pt = (t: ReturnType<typeof useT>, x: number) => t.fit.pts(x);

// The hero's chain with segment sums from the worn pieces (wearing chainSums): green — counts in full, yellow — at ½
// (flat), paler — fewer segments, but the colour stays recognisable; dashed — nothing worn gives the stat.
// --k — the place between the smallest and the biggest sum of the same colour (owner: a yellow 10 must not make a green
// 2 pale); one pill of a colour, or all equal — full
const kOf = (chain: ChainSum[]) => {
  const range = (full: boolean) => {
    const v = chain.filter((x) => x.seg && (x.credit >= 1) === full).map((x) => x.seg);
    return [Math.min(...v), Math.max(...v)];
  };
  const r = { ok: range(true), half: range(false) };
  return (x: ChainSum) => {
    const [lo, hi] = x.credit >= 1 ? r.ok : r.half;
    return hi > lo ? (x.seg - lo) / (hi - lo) : 1;
  };
};

function WornChain({ chain, anchor }: { chain: ChainSum[]; anchor: boolean }) {
  const t = useT();
  const k = kOf(chain);
  return (
    <span className="chain wchain" aria-label={t.ui.wornChain} {...(anchor ? tour('wchain') : {})}>
      {chain.map((x) => (
        <span key={x.key} className="wch">
          {x.sep && <i className="sep">{x.sep}</i>}
          {x.seg
            ? <span className={`pill ${x.credit >= 1 ? 'ok' : 'half'}`} style={{ '--k': k(x) } as CSSProperties}>{subLabel(x.key)} <b>{x.seg}</b></span>
            : <span className="pill miss">{subLabel(x.key)}</span>}
        </span>
      ))}
    </span>
  );
}

// строка вещи: нажатие открывает шторку вещи; в карточке показа — не кнопка
const Row = ({ onClick, slot, shown, children }: { onClick?: () => void; slot: SlotId; shown: boolean; children: ReactNode }) => (onClick
  ? <button type="button" className="bgear-row" onClick={onClick} {...(shown ? {} : tourItem(slot))}>{children}</button>
  : <div className="bgear-row">{children}</div>);

// onEnter — «Ввести» у пустого слота; onWearAll — «Да, всё надето». Нет их — обучение и новая версия страницы: слоты
// показываются, действий нет. share — «Поделиться» у заголовка (ShareButton). shown — карточка показа чужого героя
// (DEVELOPMENT.md "features/worn"): строки вещей не кнопки, якорей обучения нет, «Что искать» нет; pinned — его закреплённый набор
export function WornGear({ c, wv, ctx, gear, onOpenPiece, onEnter, onWearAll, share, shown = false, pinned }: {
  c: Char; wv: WornView; ctx: Ctx; gear: GearApi; onOpenPiece?: (id: string) => void;
  onEnter?: (slot: SlotId) => void; onWearAll?: () => void; share?: ReactNode; shown?: boolean; pinned?: string | null;
}) {
  const t = useT();
  const { idx } = ctx;
  if (gear.newer) return <div className="bgear" {...(shown ? {} : tour('wtab'))}><p className="muted small">{t.ui.gearNewer}</p></div>;
  const empty = wv.count === 0;
  const all = empty && !!onWearAll && wearAll(gear.store, c.id) !== null;
  const lines = bonusLinesOf(t, idx, wv.bonuses);
  // a set's points go on its last bonus line
  const setPts = (i: number) => {
    const r = wv.bonuses[i];
    if (wv.bonuses[i + 1]?.set === r.set) return null;
    const v = wv.value?.sets.find((x) => x.set === r.set)?.value;
    return v ? <span className="wpts"> +{pt(t, v)}</span> : null;
  };
  const shownPts = !empty && wv.value !== null;
  const title = <h4>{t.ui.wornTitle(wv.count)}{shownPts && <span className="wtotal"> · {t.ui.wornPts(pt(t, wv.value!.v))}</span>}</h4>;
  return (
    <>
      <div className="bgear worn" {...(shown ? {} : tour('wtab'))}>
        {pinned && <p className="worn-aim">{t.card.pinned(pinned)}</p>}
        {empty && !shown && <p className="worn-hint">{t.ui.wornEmpty(c.name)}</p>}
        {all && (
          <div className="bgear-none">
            <p>{t.ui.wornAllAsk(c.name, wv.pool)}</p>
            <button type="button" className="btn primary" onClick={onWearAll}>{t.ui.wornAllYes}</button>
          </div>
        )}
        <div className="worn-h" {...(shown ? {} : tour('bgear'))}>{title}{share}</div>
        {/* two or more chains: each one's name stands on its own line above its stats, so every chain starts at one left edge */}
        {shownPts && wv.chain.length > 0 && (wv.alt.length
          ? <div className="wchain-alt"><span className="wchain-b">{wv.build}</span><WornChain chain={wv.chain} anchor={!shown} /></div>
          : <WornChain chain={wv.chain} anchor={!shown} />)}
        {shownPts && wv.alt.map((a) => (
          <div key={a.build} className="wchain-alt"><span className="wchain-b">{a.build}</span><WornChain chain={a.chain} anchor={false} /></div>
        ))}
        {lines.length > 0 && <div className="bgear-set">{lines.map((l, i) => <p key={i}>{l}{setPts(i)}</p>)}</div>}
        <ul className="bgear-list" {...(shown ? {} : tour('gslots'))}>
          {SLOTS.map(({ id: slot }) => {
            const s = wv.slots.find((x) => x.slot === slot)!;
            const p = s.piece;
            return (
              <li key={slot}>
                {p ? (
                  <Row onClick={onOpenPiece && (() => onOpenPiece(p.id))} slot={slot} shown={shown}>
                    <SlotIcon slot={slot} />
                    <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                    <BtLabel p={p} />
                    <span className="bgear-t">
                      {s.tokens.map((k) => <SubToken key={k.key} stat={k.key} lit={k.lit} credit={k.credit} />)}
                      {wv.value && <b className="wpts bgear-pts">{pt(t, wv.value.ptsBySlot[slot] ?? 0)}</b>}
                    </span>
                  </Row>
                ) : (
                  <div className="bgear-empty">
                    <SlotIcon slot={slot} /><span>{t.ui.slotNames[slot]}</span>
                    <span className="bgear-act">
                      {onEnter && <button type="button" className="btn small" onClick={() => onEnter(slot)}>{t.ui.wornEnter}</button>}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {!shown && wv.seek.length > 0 && (
        <div className="seek">
          <h4>{t.card.seekTitle}</h4>
          {wv.seek.map((f) => (
            <p key={f.pin.key} className="seek-row">
              <Rich text={t.card.seek(`**${comboText(idx, f.pin.combo)}**`, f.k, f.n, f.need.map((x) => ({ slot: x.slot, set: x.set && setName(idx, x.set) })))} />
            </p>
          ))}
        </div>
      )}
    </>
  );
}
