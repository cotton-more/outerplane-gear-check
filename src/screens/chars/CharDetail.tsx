// Карточка героя (.x/0085 макет 6.0): шапка, «К обмену ▸» и закрепление набора («Закрепить набор» или «Закреплено: … ▾»),
// вкладки «Надето · Пул · Билды». «Надето» — что на герое в игре, «Переодеть» (лучшая раскладка из своих вещей лучше
// надетой на 1+ очко) и «Что искать»; «Пул» — все вещи и зачем каждая; «Билды» — справка outerpedia, только просмотр.
// На узком экране — полноэкранная шторка поверх списка.
import { useEffect, useState } from 'react';
import type { Char, SlotId } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { comboText } from '@/game/build/builds';
import type { RosterApi } from '@/features/roster/useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { setPin, undoPin, updateIn, type GearStore, type Piece, type PieceEdit } from '@/features/gear/model/gear';
import { undoWear, undoWearAll, wearAll, wearFromPool, type PoolView } from '@/features/gear/pool';
import { pinChoices, undoWearMany, wearMany, wornView } from '@/features/worn/wearing';
import { reasonOf } from '@/features/gear/pool/info';
import { namedGain } from '@/features/gear/model/vs';
import { PieceSheet } from './PieceSheet';
import { PoolList, reasonText } from '@/features/gear/ui/PoolList';
import { Redress } from '@/features/worn/Redress';
import { PinSheet } from '@/features/worn/PinSheet';
import { WornGear } from '@/features/worn/WornGear';
import { ShareButton } from '@/features/worn/ShareButton';
import { shareCodeOf } from '@/features/worn/share';
import { Icon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';
import { setName } from '@/game/set/setName';
import { BuildView } from './BuildView';
import { CharHead } from './CharHead';

// active — вкладка «Персонажи» на экране: карточка вещи (шторка в <body>) закрывается, когда её нет;
// view — пул (features/gear/pool); onTryOn — режим «для героя» (features/tryon): «Ввести» у пустого слота — только слот
// (slotOnly), «Примерить замену» — слот и сет этой вещи, «Надеть» заменит её (replacing); onOpenChar — карточка другого
// персонажа (его Core Fusion); onGearToast — сообщение с «Вернуть» («Убрать у Caren», «Надеть», закрепление).
// onPieceEdit — правка в карточке вещи (герой, прежний id, id после правки): висящее «Вернуть» прежнего действия (одно
// на все, В3) App снимает — откаты возвращают запись по id, а её поправили или скопировали (gear updateIn); копия — и
// replace режима героя переходит на неё. onRateFor — «Оценить вещь для Caren» (режим «для героя» без предустановки).
// canWear — wear actions («Да, всё надето», «Надеть», «Переодеть»): separate from onTryOn, which a batch turns off
interface Props {
  charId: string | null; ctx: Ctx; view: PoolView; rosterApi: RosterApi; gear: GearApi; active: boolean; sheetOpen: boolean; onClose: () => void;
  canWear?: boolean;
  onTryOn?: (c: Char, slot?: SlotId, from?: Piece, replacing?: boolean, slotOnly?: boolean) => void;
  onPieceOpen?: (open: boolean) => void;
  onOpenChar?: (id: string) => void;
  onGearToast?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
  onPieceEdit?: (charId: string, was: string, now: string) => void;
  onRateFor?: (c: Char) => void;
  onTrade?: (c: Char) => void; // «К обмену ▸» — шторка обмена сразу с планом героя
  canShare?: boolean; // «Поделиться» во «Надето» (.x/0060 SPEC 3.1): не в обучении и не при экипировке новой версии
}

type Tab = 'worn' | 'pool' | 'builds';

// Родитель задаёт key={charId}: смена персонажа сбрасывает вкладку и прокрутку.
export function CharDetail({ charId, ctx, view, rosterApi, gear, active, sheetOpen, onClose, canWear, onTryOn, onPieceOpen, onOpenChar, onGearToast, onPieceEdit, onRateFor, onTrade, canShare = false }: Props) {
  const { CHAR } = ctx.idx;
  const t = useT();
  const c = charId ? CHAR[charId] : undefined;
  // открыта «Надето»; у героя не из ростера и без вещей — «Билды» (смотрит справку)
  const [tab, setTab] = useState<Tab>(() => (c && !rosterApi.roster.has(c.id) && !view.of(c.id)?.pieces.length ? 'builds' : 'worn'));
  const [bi, setBi] = useState(0); // билд на вкладке «Билды»
  const [sheet, setSheet] = useState<'redress' | 'pin' | null>(null);
  const [pieceId, setPieceId] = useState<string | null>(null);
  // ушли с вкладки («← Оценка», #slug, «назад») — карточка вещи закрывается, а не висит поверх «Оценки»
  useEffect(() => { if (!active) { setPieceId(null); setSheet(null); } }, [active]);
  const hp = c ? view.hero(c.id) : null;
  const pieces = c ? view.of(c.id)?.pieces ?? [] : [];
  const piece = pieceId ? gear.store.pieces[pieceId] : undefined;
  const shownPiece = active && !!piece && pieces.some((p) => p.id === pieceId);
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
  // есть Core Fusion этого героя (features/gear/model/fusion): он неактивен — в ростере и с вещами Core Fusion; звезда — «Вернуться к X?»
  const fusedBy = ctx.off.has(c.id) ? CHAR[ctx.off.get(c.id)!] : null;
  const hasBuilds = c.builds.length > 0;
  const wv = hasBuilds ? wornView(ctx, c, gear.store, hp) : null;
  const pin = hp?.P.pin ?? null;
  const live = !!canWear && !!onGearToast && !gear.newer;
  const b = c.builds[Math.min(bi, c.builds.length - 1)];
  const shownTab: Tab = tab;

  // правка в карточке вещи — только у этого героя: общая запись делится, и шторка идёт за новым id (иначе закрылась бы
  // на первом нажатии); ничего не поменялось — ни записи, ни снятого «Вернуть»
  const editPiece = (patch: PieceEdit) => {
    if (!pieceId) return;
    const r = updateIn(ctx.idx, gear.store, c.id, pieceId, patch);
    if (r.st === gear.store) return;
    gear.set(r.st);
    setPieceId(r.id);
    onPieceEdit?.(c.id, pieceId, r.id);
  };
  // «Надеть» из «Переодеть» и из карточки вещи: вещь пула героя — надетая; сообщение с «Вернуть» (App onGearToast); прежняя
  // надетая, которую больше ничто не держит, уходит — «Лишнее убрано»
  const wear = (id: string) => {
    const r = wearFromPool(ctx, gear.store, c.id, id);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornToast(c.name, t.ui.slotNames[r.slot]), r.removed.length ? t.fit.pruned(c.name) : '', (x) => undoWear(x, c.id, r));
  };
  // «Да, всё надето»: весь пул героя надет (в нём не больше одной вещи на слот)
  const wearEverything = () => {
    const r = wearAll(gear.store, c.id);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornAllToast(c.name, Object.keys(r.worn).length), '', (x) => undoWearAll(x, c.id, r));
  };
  // «Надеть все N» в «Переодеть»: вещи по очереди, одно сообщение; «Вернуть» — все
  const wearList = (ids: string[]) => {
    const r = wearMany(ctx, gear.store, c.id, ids);
    setSheet(null);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornAllToast(c.name, r.results.length), r.results.some((x) => x.removed.length) ? t.fit.pruned(c.name) : '', (x) => undoWearMany(x, c.id, r));
  };
  // закрепить набор или снять («По статам»): сообщение с «Вернуть»
  const doPin = (key: string | null) => {
    const r = setPin(gear.store, c.id, key);
    setSheet(null);
    if (r.st === gear.store) return;
    gear.set(r.st);
    const now = key ? pinChoices(hp!).find((f) => f.pin.key === key)?.pin : null;
    onGearToast?.(now ? t.card.pinned(comboText(ctx.idx, now.combo)) : t.card.pinNone, '', (x) => undoPin(x, c.id, r));
  };
  // «Поделиться»: надета хоть одна вещь (SPEC 3.1)
  const shareCode = canShare && wv && wv.count > 0 ? shareCodeOf(c, gear.store, pieces, pin?.key ?? null) : null;
  const enter = onTryOn ? (slot: SlotId) => onTryOn(c, slot, undefined, false, true) : undefined;
  const rateFor = onRateFor && !gear.newer && hasBuilds ? () => onRateFor(c) : undefined;
  const why = (p: Piece) => {
    if (!hp) return '';
    const r = reasonOf(hp.info, p);
    return r ? reasonText(t, ctx.idx, r) : t.fit.unneeded;
  };
  const pinName = pin ? comboText(ctx.idx, pin.combo) : '';
  const canPin = own && hasBuilds && !gear.newer && !!hp;
  const redress = shownTab === 'worn' ? wv?.redress ?? null : null;
  return (
    <aside className="panel char-detail open" id="char-detail" aria-label={t.ui.charBuilds}>
      <div className="cd-top"><button type="button" className="btn" onClick={onClose}>{t.ui.toList}</button></div>
      <CharHead c={c} ctx={ctx} star={(
        <button type="button" className="cd-star" aria-pressed={own} aria-label={t.ui.rosterToggle(c.name, own)} onClick={() => rosterApi.toggle(c.id)}>
          {own ? '★' : '☆'}
        </button>
      )} />
      {fusedBy && (
        <div className="own-row">
          <button type="button" className="linkbtn small" onClick={() => onOpenChar?.(fusedBy.id)}>{t.ui.fusionOffCard(c.name, fusedBy.name)}</button>
        </div>
      )}
      {/* «К обмену ▸» (R10.1) и закрепление (FORMULA §6): закреплено — плашка на месте кнопки, первой */}
      {hasBuilds && !gear.newer && (onTrade || canPin) && (
        <div className="cd-acts">
          {canPin && pin && (
            <button type="button" className="pinned" aria-label={t.card.pinnedAria(pinName)} onClick={() => setSheet('pin')} {...tour('pin')}>
              <Icon name="pin" /><span>{t.card.pinned(pinName)}</span>▾
            </button>
          )}
          {onTrade && <button type="button" className="btn small" onClick={() => onTrade(c)} {...tour('trade')}>{t.trade.open}</button>}
          {canPin && !pin && (
            <button type="button" className="btn small pinb" onClick={() => setSheet('pin')} {...tour('pin')}><Icon name="pin" />{t.card.pin}</button>
          )}
        </div>
      )}
      {hasBuilds ? (
        <>
          {wv && (
            <div className="btabs" role="tablist" aria-label={t.card.tabs} {...tour('btabs')}>
              <button type="button" role="tab" aria-selected={shownTab === 'worn'} onClick={() => setTab('worn')}>{t.card.tabWorn}<span className="bt-n">{wv.count}/6</span></button>
              <button type="button" role="tab" aria-selected={shownTab === 'pool'} onClick={() => setTab('pool')}>{t.card.tabPool}<span className="bt-n">{pieces.length}</span></button>
              <button type="button" role="tab" aria-selected={shownTab === 'builds'} onClick={() => setTab('builds')}>{t.card.tabBuilds}</button>
            </div>
          )}
          {redress && (
            <button type="button" className="redress" onClick={() => setSheet('redress')}>
              <Icon name="hanger" /><span>{namedGain(redress.pts) ? t.card.redress(t.fit.pts(redress.pts)) : t.card.redressRank}</span>▸
            </button>
          )}
          {shownTab === 'worn' && wv && (
            <WornGear c={c} wv={wv} ctx={ctx} gear={gear} onOpenPiece={setPieceId} onEnter={live ? enter : undefined} onWearAll={live ? wearEverything : undefined}
              share={shareCode ? <ShareButton code={shareCode} /> : undefined} />
          )}
          {shownTab === 'pool' && <PoolList c={c} pieces={pieces} hp={hp} ctx={ctx} gear={gear} onOpenPiece={setPieceId} onRemoved={onGearToast} onRateFor={rateFor} />}
          {shownTab === 'builds' && (
            <>
              {c.builds.length > 1 && (
                <div className="bsel" role="group" aria-label={t.ui.builds}>
                  {c.builds.map((x, i) => <button key={i} type="button" aria-pressed={x === b} onClick={() => setBi(i)}>{x.name}</button>)}
                </div>
              )}
              <BuildView c={c} b={b} ctx={ctx} />
            </>
          )}
          {shownPiece && piece && (
            <PieceSheet c={c} p={piece} ctx={ctx} gear={gear} why={why(piece)} worn={!!hp?.wornIds.has(piece.id)} onClose={() => setPieceId(null)} onRemoved={onGearToast} onEdit={editPiece}
              onTry={onTryOn ? () => { setPieceId(null); onTryOn(c, piece.slot, piece, true); } : undefined}
              onWear={live ? () => { setPieceId(null); wear(piece.id); } : undefined} />
          )}
          {sheet === 'redress' && wv?.redress && hp && (
            <Redress c={c} ctx={ctx} P={hp.P} plan={wv.redress} onClose={() => setSheet(null)} onWear={live ? wear : undefined} onWearAll={live ? wearList : undefined} />
          )}
          {sheet === 'pin' && hp && <PinSheet c={c} ctx={ctx} choices={pinChoices(hp)} now={pin?.key ?? null} onClose={() => setSheet(null)} onPin={doPin} />}
        </>
      ) : (
        <div className="cd-empty">
          {t.ui.noBuilds}
          {c.gameSets && c.gameSets.length > 0 && <><br />{t.ui.gameSets(c.gameSets.map((id) => setName(ctx.idx, id)).join(', '))}</>}
        </div>
      )}
    </aside>
  );
}
