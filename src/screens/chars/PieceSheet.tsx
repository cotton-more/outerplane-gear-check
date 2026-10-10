// Шторка вещи из карточки героя: узкая правка (Н1) — сегменты 1–6, «T4», 4-й сабстат у Epic с тремя; «Надеть» (вещь пула
// не надета), «Примерить замену» (режим «для героя», слот и сет этой вещи на форме), «Убрать у X». Почему пул её держит —
// строкой под именем (why, как во вкладке «Пул»).
import { useState } from 'react';
import { isArmor, subLabel } from '@/game/data';
import type { Char } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { pieceInput, type GearStore, type Piece, type PieceEdit } from '@/features/gear/model/gear';
import { itemMains } from '@/game/item/mains';
import { MAX_SUBS, withinCap, type Subs } from '@/game/item/subs';
import { removeFrom, removeUndo } from '@/features/gear/pool';
import type { GearApi } from '@/features/gear/store/useGear';
import { PieceName } from '@/features/gear/ui/pieceText';
import { StatIcon } from '@/game/icons/Img';
import { tour, tourItem } from '@/tour/anchors';
import { Sheet } from '@/shared/ui/Sheet';
import { SubPicker } from '@/features/eval/form/SubPicker';
import { BtChip } from '@/features/eval/form/BtChip';
import { ShareCode } from '@/features/eval/code/ItemCode';
import { CapNote, LevelButtons } from '@/game/item/SubLevels';

// Карточка вещи — узкая правка (Н1): сегменты сабстатов 1–6 одним цветом (нажатие ставит уровень, на текущий — на
// один меньше, не ниже 1), «T4», «+ 4-й сабстат» у Epic с тремя (уровень 1, В-А2). Стат не меняется:
// Transistone — ввести вещь заново (pieceEditNote). Нажатие, с которым сумма уровней ушла бы выше предела грейда
// (game/item/subs levelCap), не срабатывает — строка «больше N не бывает», как на форме (SubRows); уходит со следующей
// правкой. Правку делает onEdit (CharDetail: gear updateIn — у этого героя, общая запись делится, шторка идёт за новым
// id). Кнопки уровня — как на форме: 5–6 (после Reforge) узкие. Окно выбора 4-го — внутри этой же шторки (вложенные
// закрывались бы одним Esc). «Убрать у Caren» — только из её вещей (пулы независимы, В9); onRemoved — сообщение с «Вернуть»
// Под сегментами — код вещи для чата и «Скопировать», как в вердикте (у вещи с 5–6 сегментами кода нет)
export function PieceSheet({ c, p, ctx, gear, why, worn, onClose, onEdit, onTry, onRemoved, onWear }: {
  c: Char; p: Piece; ctx: Ctx; gear: GearApi; why: string; worn: boolean; onClose: () => void; onEdit: (patch: PieceEdit) => void; onTry?: () => void; onWear?: () => void;
  onRemoved?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
}) {
  const t = useT();
  const [fourth, setFourth] = useState(false);
  // на каких уровнях нажатие упёрлось в предел; новый объект на каждое — строка снова прокручивается в видимую часть
  const [capAt, setCapAt] = useState<{ lit: Subs } | null>(null);
  const capped = capAt?.lit === p.lit;
  const keys = Object.keys(p.lit);
  const { blocked } = itemMains(ctx.idx, pieceInput(p));
  const edit = (lit: Subs, patch: PieceEdit) => {
    if (!withinCap(p.grade, p.lit, lit)) { setCapAt({ lit: p.lit }); return; }
    onEdit(patch);
  };
  const tap = (k: string, n: number) => {
    const to = n === p.lit[k] ? Math.max(1, n - 1) : n;
    if (to !== p.lit[k]) edit({ ...p.lit, [k]: to }, { lit: { [k]: to } });
  };
  const remove = () => {
    const undo = removeUndo(gear.store, c.id, p);
    gear.set(removeFrom(gear.store, c.id, p.id));
    onRemoved?.(t.ui.removedFrom(c.name), '', undo);
    onClose();
  };
  const canFourth = p.grade === 'rare' && keys.length === MAX_SUBS - 1;
  // в заголовке — слот и персонаж; билды — строкой в теле
  const title = t.ui.pieceTitle(t.ui.slotNames[p.slot], c.name);
  if (fourth) {
    return (
      <Sheet title={t.ui.fourthSheet} onClose={() => setFourth(false)}>
        <SubPicker ctx={ctx} subs={p.lit} blocked={blocked} editing={null}
          onPick={(k) => { edit({ ...p.lit, [k]: 1 }, { add: k }); setFourth(false); }} />
      </Sheet>
    );
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="piece" {...tour('gpiece')}>
        <div className="piece-top">
          <p className="piece-n"><PieceName ctx={ctx} p={p} /></p>
          <BtChip anchor={false} armor={isArmor(p.slot)} on={p.bt === 4} onToggle={() => onEdit({ bt: p.bt === 4 ? 0 : 4 })} />
        </div>
        <p className="muted small">{why}</p>
        <div className="subrows">
          {keys.map((k) => (
            <div key={k} className="subrow">
              <span className="subkey"><StatIcon stat={k} /><span className="lab">{subLabel(k)}</span></span>
              <LevelButtons level={p.lit[k]} label={subLabel(k)} onTap={(n) => tap(k, n)} />
            </div>
          ))}
          {canFourth && <button type="button" className="subadd" onClick={() => setFourth(true)}>+ {t.ui.addFourth}</button>}
          <CapNote shown={capped} grade={p.grade} at={capAt} />
        </div>
        <ShareCode item={pieceInput(p)} anchor={false} />
        <p className="muted small">{t.ui.pieceEditNote(c.name)}</p>
        <div className="piece-act">
          <button type="button" className="btn primary" onClick={onClose}>{t.ui.pieceDone}</button>
          {onWear && !worn && <button type="button" className="btn" onClick={onWear}>{t.ui.wornWear}</button>}
          {onTry && <button type="button" className="btn" onClick={onTry} {...tourItem('try')}>{t.tryon.replace}</button>}
          <button type="button" className="btn" onClick={remove}>{t.ui.pieceRemove(c.name)}</button>
        </div>
        <p className="muted small">{t.ui.pieceRemoveNote(c.name)}</p>
      </div>
    </Sheet>
  );
}

