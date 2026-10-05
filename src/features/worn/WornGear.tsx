// Вкладка «Надето» (шаг 6): что на герое сейчас в игре — билд героя (aimOf; сменить — «Speed ▾» рядом с вкладкой, CharDetail), бонусы надетых сетов и 6 слотов
// как в «Собрано» (BuildGear). Пустой слот — «Ввести»: режим героя на этот слот, форма — только слот. Совет у слота: вещь
// раскладки билда из вещей героя лучше надетой («Лучше из своих») или слот пуст («Из своих») — «Надеть» ставит её надетой.
// Пустая вкладка: «Да, всё надето» — когда в вещах героя не больше одной на слот. Данные — features/worn/wearing (wornView); запись —
// CharDetail (onWear, onWearAll), у него же тост с «Вернуть».
import { SLOTS } from '@/game/data';
import type { Char, SlotId } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { isStats, wearAll } from '@/features/gear/pool';
import { vsFigure } from '@/features/gear/model/vs';
import type { WornAdvice, WornView } from './wearing';
import type { GearApi } from '@/features/gear/store/useGear';
import { SlotIcon } from '@/game/icons/Img';
import { Rich } from '@/shared/ui/Rich';
import { tour } from '@/tour/anchors';
import { PieceName, bonusLinesOf, pieceText } from '@/features/gear/ui/pieceText';
import { setName } from '@/game/set/setName';
import { variantName } from '@/features/gear/ui/pieceText';
import { SubToken } from '@/game/item/SubToken';
import { BtLabel } from '@/features/gear/ui/pieceText';

// «▲ +25%», «▲ ×3»; выигрыша нет (пустой слот, вещь лишь включит бонус сета) — ничего
function deltaText(a: WornAdvice): string {
  const f = a.delta === null ? null : vsFigure({ delta: a.delta, wornEmpty: false });
  if (!f || f.kind === 'empty') return '';
  const body = f.kind === 'times' ? `×${f.n}` : `${f.n >= 0 ? '+' : '−'}${Math.abs(f.n)}%`;
  return a.up ? `▲ ${body}` : body;
}

// onEnter — «Ввести» у пустого слота; onWear — надеть вещь пула; onWearAll — «Да, всё надето». Нет onEnter/onWear —
// обучение и новая версия страницы: слоты показываются, действий нет
export function WornGear({ c, wv, ctx, gear, onOpenPiece, onEnter, onWear, onWearAll }: {
  c: Char; wv: WornView; ctx: Ctx; gear: GearApi; onOpenPiece: (id: string) => void;
  onEnter?: (slot: SlotId) => void; onWear?: (id: string) => void; onWearAll?: () => void;
}) {
  const t = useT();
  const { idx } = ctx;
  if (gear.newer) return <div className="bgear" {...tour('wtab')}><p className="muted small">{t.ui.gearNewer}</p></div>;
  const v = wv.variant;
  const build = v ? variantName(t, v) : t.ui.byStats;
  const aim = wv.set && v && !isStats(v) ? t.ui.wornBuild(build, wv.set.k, wv.set.n) : t.ui.wornBuildPlain(build);
  const empty = wv.count === 0;
  const all = empty && !!onWearAll && wearAll(gear.store, c.id) !== null;
  const lines = [...bonusLinesOf(t, idx, c, wv.bonuses, v?.b.sets[0] ?? []), ...wv.t4.map((p) => t.ui.partT4(setName(idx, p.set), p.k, p.n))];
  return (
    <div className="bgear worn" {...tour('wtab')}>
      <p className="worn-aim"><Rich text={aim} /></p>
      {empty && <p className="worn-hint">{t.ui.wornEmpty(c.name)}</p>}
      {all && (
        <div className="bgear-none">
          <p>{t.ui.wornAllAsk(c.name, wv.pool)}</p>
          <button type="button" className="btn primary" onClick={onWearAll}>{t.ui.wornAllYes}</button>
        </div>
      )}
      <h4>{t.ui.wornTitle(wv.count)}</h4>
      {lines.length > 0 && <div className="bgear-set">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>}
      <ul className="bgear-list">
        {SLOTS.map(({ id: slot }) => {
          const s = wv.slots.find((x) => x.slot === slot)!;
          const p = s.piece;
          const adv = s.advice && onWear && !all ? s.advice : null;
          const label = adv ? pieceText(ctx, adv.piece) : '';
          return (
            <li key={slot}>
              {p ? (
                <button type="button" className="bgear-row" onClick={() => onOpenPiece(p.id)}>
                  <SlotIcon slot={slot} />
                  <span className="bgear-n"><PieceName ctx={ctx} p={p} /></span>
                  <BtLabel p={p} />
                  <span className="bgear-t">
                    {s.tokens.map((k) => (
                      <SubToken key={k.key} stat={k.key} lit={k.lit} credit={k.credit} />
                    ))}
                  </span>
                </button>
              ) : (
                <div className="bgear-empty">
                  <SlotIcon slot={slot} /><span>{t.ui.slotNames[slot]}</span>
                  <span className="bgear-act">
                    {onEnter && <button type="button" className="btn small" onClick={() => onEnter(slot)}>{t.ui.wornEnter}</button>}
                  </span>
                </div>
              )}
              {adv && (
                <p className="worn-advice">
                  <span>{p ? t.ui.wornBetter(label, deltaText(adv)) : t.ui.wornFrom(label)}</span>
                  <button type="button" className="btn small" aria-label={t.ui.wornWearAria(label)} onClick={() => onWear!(adv.piece.id)}>{t.ui.wornWear}</button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
