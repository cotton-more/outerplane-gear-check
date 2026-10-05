// Билды персонажа по outerpedia: сеты, оружие и аксессуар с main stat, приоритет сабстатов, талисманы, заметка.
// На узком экране — полноэкранная шторка поверх списка.
import { useEffect, useState, type Key, type ReactNode } from 'react';
import type { Build, Char, SlotId } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import { cap } from '@/game/text';
import type { RosterApi } from '@/features/roster/useRoster';
import type { GearApi } from '@/features/gear/store/useGear';
import { isPinned, setPinned, updateIn, type GearStore, type Piece, type PieceEdit } from '@/features/gear/model/gear';
import { isStats, play, setMark, undoWear, undoWearAll, wearAll, wearFromPool, type PoolView } from '@/features/gear/pool';
import { badgeOf } from '@/features/gear/model/poolVs';
import { redressPlan, undoWearMany, wearMany, wornView } from '@/features/worn/wearing';
import type { Variant } from '@/game/build/variants';
import { BuildGear, PieceSheet } from './BuildGear';
import { PoolList } from '@/features/gear/ui/PoolList';
import { Redress } from '@/features/worn/Redress';
import { WornGear } from '@/features/worn/WornGear';
import { VariantChips } from '@/features/gear/ui/VariantChips';
import { ClassIcon, ElementIcon, Icon } from '@/game/icons/Img';
import { tour } from '@/tour/anchors';
import { setName } from '@/game/set/setName';
import { variantName } from '@/features/gear/ui/pieceText';
import { HeroFace } from '@/game/hero/HeroFace';
import { Toggle } from '@/shared/ui/Toggle';
import { CloseButton } from '@/shared/ui/CloseButton';
import { BuildView } from './BuildView';

const ROLE: Record<string, string> = { dps: 'DPS', support: 'Support', sustain: 'Sustain' };
// оценка outerpedia PvE / PvP (S…E): подпись приглушённая, буква — плашкой цвета оценки (chars.css .tier-*)
const Tier = ({ k, v }: { k: string; v: string }) => (
  <span className="tier"><span className="tier-k">{k}</span><b className={`tier-v tier-${v.toLowerCase()}`}>{v}</b></span>
);

// active — вкладка «Персонажи» на экране: карточка вещи (шторка в <body>) закрывается, когда её нет;
// view — пул (features/gear/pool); onTryOn — режим «для героя» с предустановкой формы по варианту этого персонажа (BuildGear; у
// «По статам» b — его билд с именем STATS, features/tryon/tryon); onOpenChar — карточка другого
// персонажа (его Core Fusion); onGearToast — сообщение с «Вернуть» («Убрать у Caren»).
// onPieceEdit — правка в карточке вещи (герой, прежний id, id после правки): висящее «Вернуть» прежнего действия (одно
// на все, В3) App снимает — откаты возвращают запись по id, а её поправили или скопировали (gear updateIn); копия — и
// replace режима героя переходит на неё. «Ввести» на вкладке «Надето» — onTryOn с slotOnly: на форме только слот. onRateFor — «Оценить вещь для Caren» (режим
// «для героя» без предустановки). «Примерить замену» — onTryOn с from и replacing: «Надеть» заменит эту запись в любом
// случае (её id — TryOn.replace); «Слабее всех» тоже отдаёт from, но только для сета на форме
interface Props {
  charId: string | null; ctx: Ctx; view: PoolView; rosterApi: RosterApi; gear: GearApi; active: boolean; sheetOpen: boolean; onClose: () => void;
  onTryOn?: (c: Char, b: Build, slot?: SlotId, from?: Piece, combo?: string | null, replacing?: boolean, slotOnly?: boolean) => void;
  onPieceOpen?: (open: boolean) => void;
  onOpenChar?: (id: string) => void;
  onGearToast?: (text: string, note: string, undo: (st: GearStore) => GearStore) => void;
  onPieceEdit?: (charId: string, was: string, now: string) => void;
  onRateFor?: (c: Char) => void;
  onTrade?: (c: Char) => void; // «К обмену ▸» — шторка обмена сразу с планом героя
  redress?: string | null;
  onRedress?: (key: string | null) => void;
  onChooseAim?: (charId: string, key: string) => void;
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
export function CharDetail({ charId, ctx, view, rosterApi, gear, active, sheetOpen, onClose, onTryOn, onPieceOpen, onOpenChar, onGearToast, onPieceEdit, onRateFor, onTrade, redress = null, onRedress, onChooseAim }: Props) {
  const { D, CHAR } = ctx.idx;
  const t = useT();
  const c = charId ? CHAR[charId] : undefined;
  const cp = c ? view.of(c.id) : null;
  // вкладка: 'worn' — «Надето» (у героев ростера), 'stats' — «По статам», иначе номер билда; при открытии — «Надето», если
  // на герое что-то надето, иначе билд лучшего варианта
  const lead = cp ? [...cp.inPlay].filter((v) => !v.dupOf).sort(byRank(cp.asm))[0] ?? null : null;
  const [tab, setTab] = useState<number | 'stats' | 'worn'>(() => (c && rosterApi.roster.has(c.id) && c.builds.length > 0 && Object.keys(gear.store.worn?.[c.id] ?? {}).length > 0 ? 'worn'
    : lead ? (isStats(lead) ? 'stats' : Math.max(0, c!.builds.indexOf(lead.parent))) : 0));
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
  // есть Core Fusion этого героя (features/gear/model/fusion): он неактивен — в ростере и с вещами Core Fusion; звезда — «Вернуться к X?»
  const fusedBy = ctx.off.has(c.id) ? CHAR[ctx.off.get(c.id)!] : null;
  const asm = cp!.asm;
  const variantsOfBuild = (b: Build) => cp!.variants.filter((v) => v.parent === b && !isStats(v)).sort(byRank(asm));
  const has = cp!.pieces.length > 0;
  // «N/6» на вкладке — у лучшего варианта билда
  const badge = (b: Build) => (has ? Math.max(0, ...variantsOfBuild(b).map((v) => badgeOf(asm.get(v.key)!))) : 0);
  const statsTab = tab === 'stats' && cp!.stat;
  const showWorn = own && c.builds.length > 0;
  const wornTab = tab === 'worn' && showWorn;
  const wv = showWorn ? wornView(ctx, c, gear.store, cp!) : null;
  const bi = typeof tab === 'number' ? Math.min(tab, c.builds.length - 1) : 0;
  const b = statsTab ? cp!.stat!.parent : c.builds[bi];
  const list = b && !statsTab ? variantsOfBuild(b) : [];
  const v = statsTab ? cp!.stat! : list.find((x) => x.key === picked[String(tab)]) ?? list[0];
  // «Собираю»: нажали — противоположная отметка, а если так было бы и без неё — отметку снять
  const onWant = (x: Variant) => {
    const on = cp!.inPlay.includes(x);
    const { [x.key]: _, ...rest } = gear.store.marks ?? {};
    const auto = play(ctx, c, cp!.pieces, { ...cp!.opts, marks: rest }).inPlay.some((y) => y.key === x.key);
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
  // «Надеть» из совета и из карточки вещи: вещь пула героя — надетая; сообщение с «Вернуть» (App onGearToast); прежняя надетая,
  // которую больше ничто не держит, уходит — «Лишнее убрано»
  const live = !!onTryOn && !!onGearToast && !gear.newer;
  const wear = (id: string) => {
    const r = wearFromPool(ctx, gear.store, c.id, id);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornToast(c.name, t.ui.slotNames[r.slot]), r.removed.length ? t.ui.prunedNote : '', (x) => undoWear(x, c.id, r));
  };
  // «Да, всё надето»: весь пул героя надет (в нём не больше одной вещи на слот)
  const wearEverything = () => {
    const r = wearAll(gear.store, c.id);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornAllToast(c.name, Object.keys(r.worn).length), '', (x) => undoWearAll(x, c.id, r));
  };
  // «Надеть все N» на «Переодеть»: вещи по очереди, одно сообщение; «Вернуть» — все
  const wearList = (ids: string[]) => {
    const r = wearMany(ctx, gear.store, c.id, ids);
    if (!r) return;
    gear.set(r.st);
    onGearToast?.(t.ui.wornAllToast(c.name, r.results.length), r.results.some((x) => x.removed.length) ? t.ui.prunedNote : '', (x) => undoWearMany(x, c.id, r));
  };
  // билд героя на «Надето» (aimOf): «Ввести» и «Примерить замену» идут с ним, на других вкладках — с показанным
  const cur = wornTab && wv?.variant ? wv.variant : v;
  const aimName = wv?.variant ? variantName(t, wv.variant) : t.ui.byStats;
  // вкладка билда: билд героя (aimOf) обведён; x null — «По статам»
  const tabOf = (x: Build | null, selected: boolean, onClick: () => void, body: ReactNode, key: Key) => {
    const av = wv?.variant;
    const aim = !!av && (x ? !isStats(av) && av.parent === x : isStats(av));
    return (
      <button key={key} type="button" role="tab" aria-selected={selected} onClick={onClick}
        {...(aim ? { className: 'bt-aim', title: t.ui.aimTab(aimName) } : {})}>{body}</button>
    );
  };
  // «Переодеть в …» под вкладками: показан не билд героя — запись билда с «Вернуть» и экран «Переодеть» (App, onChooseAim).
  // Не во вкладках: иначе ширина выбранной меняется и ряды перескакивают
  const dressTo = !wornTab && wv && live && onChooseAim && v && wv.variant?.key !== v.key ? v : null;
  const enter = onTryOn && wv?.variant ? (slot: SlotId) => onTryOn(c, isStats(wv.variant!) ? wv.variant!.b : wv.variant!.parent, slot, undefined, wv.variant!.sig, false, true) : undefined;
  // «Оценить вещь для Caren»: есть вещи — у заголовка «Вещи Caren · N», нет — под шапкой (одна кнопка на экране)
  const rateFor = onRateFor && !gear.newer && c.builds.length > 0 ? () => onRateFor(c) : undefined;
  // «Переодеть»: подвид карточки (App держит выбор — к нему же ведёт «Билды героев»); вариант пропал — обычная карточка
  const plan = redress && showWorn && b ? redressPlan(ctx, c, gear.store, cp!, redress) : null;
  if (plan) {
    return (
      <aside className="panel char-detail open" id="char-detail" aria-label={t.ui.charBuilds}>
        <Redress c={c} ctx={ctx} plan={plan} onBack={() => onRedress?.(null)} onWear={live ? wear : undefined} onWearAll={live ? wearList : undefined} />
      </aside>
    );
  }
  return (
    <aside className="panel char-detail open" id="char-detail" aria-label={t.ui.charBuilds}>
      <div className="cd-top"><button type="button" className="btn" onClick={onClose}>{t.ui.toList}</button></div>
      <div className="cd-head">
        {/* стихия и класс — значками на подложке поверх портрета: названия класса и стихии на экране нет, поэтому aria-label */}
        <span className="cd-face">
          <HeroFace c={c} />
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
          <button type="button" className="linkbtn small" onClick={() => onOpenChar?.(fusedBy.id)}>{t.ui.fusionOffCard(c.name, fusedBy.name)}</button>
        </div>
      )}
      {/* «Обмен вещами» (R10.1): «К обмену ▸» и «Не отдавать надетое» (у героя без вещей отметки нет, R3.4) */}
      {c.builds.length > 0 && !gear.newer && (onTrade || has) && (
        <div className="cd-trade">
          {onTrade && <button type="button" className="btn small" onClick={() => onTrade(c)} {...tour('trade')}>{t.trade.open}</button>}
          {has && (
            <Toggle checked={isPinned(gear.store, c.id)} onChange={(on) => gear.set(setPinned(gear.store, c.id, on))}><Icon name="pin" />{t.trade.pin}</Toggle>
          )}
        </div>
      )}
      {rateFor && !has && <div className="cd-rate"><button type="button" className="btn small" onClick={rateFor}>{t.tryon.rateFor(c.name)}</button></div>}
      {/* «Лучше всего собран…» — про сборку билдов; на «Надето» про надетое, не про неё */}
      {!wornTab && headline}
      {autoNew.map((k) => (
        <p key={k} className="cd-note">
          <span>{t.ui.autoNew(cp!.variants.find((x) => x.key === k)!.name, c.name)}</span>
          <CloseButton className="tour-x" label={t.ui.close} onClick={() => dismiss(k)} />
        </p>
      ))}
      {b && v ? (
        <>
          {/* «По статам» — отдельный билд у каждого персонажа с билдами (находка 28): вкладка последней */}
          <div className="btabs" role="tablist" aria-label={t.ui.builds} {...((c.builds.length > 1 || cp!.stat) && tour('btabs'))}>
            {wv && (
              <button type="button" role="tab" aria-selected={wornTab} onClick={() => setTab('worn')}>
                {t.ui.tabWorn}<span className="bt-n">{wv.count}/6</span>
              </button>
            )}
            {c.builds.map((x, i) => {
              const one = variantsOfBuild(x);
              const dup = one.length === 1 && one[0].dupOf ? cp!.variants.find((y) => y.key === one[0].dupOf) : null;
              return tabOf(x, !statsTab && !wornTab && x === b, () => setTab(i),
                <>{x.name}{dup ? <span className="bt-n">{t.ui.dupOf(dup.name)}</span> : badge(x) > 0 && <span className="bt-n">{badge(x)}/6</span>}</>, i);
            })}
            {cp!.stat && tabOf(null, !!statsTab, () => setTab('stats'),
              <>{t.ui.byStats}{has && <span className="bt-n">{badgeOf(asm.get(cp!.stat.key)!)}/6</span>}</>, 'stats')}
          </div>
          {list.length > 1 && !wornTab && <VariantChips list={list} cur={v} cp={cp!} ctx={ctx} st={gear.store} onPick={(x) => setPicked((p) => ({ ...p, [String(tab)]: x.key }))} onWant={onWant} />}
          {dressTo && (
            <div className="cd-dress">
              <button type="button" className="btn small" onClick={() => onChooseAim!(c.id, dressTo.key)} {...tour('wchange')}>
                <Icon name="hanger" />{t.ui.aimRedress(variantName(t, dressTo))}
              </button>
            </div>
          )}
          {wornTab && wv
            ? <WornGear c={c} wv={wv} ctx={ctx} gear={gear} onOpenPiece={setPieceId} onEnter={enter} onWear={live ? wear : undefined} onWearAll={live ? wearEverything : undefined} />
            : <BuildGear c={c} v={v} cp={cp!} ctx={ctx} gear={gear} view={view} onOpenPiece={setPieceId} onWant={onWant}
              onTryOn={onTryOn && ((x, slot, from, combo) => onTryOn(c, x, slot, from, combo))} />}
          <PoolList cp={cp!} ctx={ctx} gear={gear} view={view} own={own} onOpenPiece={setPieceId} onRemoved={onGearToast} onRateFor={rateFor} />
          {shownPiece && piece && <PieceSheet c={c} p={piece} ctx={ctx} gear={gear} view={view} onClose={() => setPieceId(null)} onRemoved={onGearToast} onEdit={editPiece}
            onTry={onTryOn ? () => { setPieceId(null); onTryOn(c, isStats(cur) ? cur.b : cur.parent, piece.slot, piece, cur.sig, true); } : undefined}
            onWear={live ? () => { setPieceId(null); wear(piece.id); } : undefined} />}
          {!statsTab && !wornTab && <BuildView c={c} b={b} ctx={ctx} />}
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

