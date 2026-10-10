// Панель над сеткой персонажей (.x/0070-more-sheet SPEC 4): две строки управления и, если выбран фильтр, строка чипов.
// Строка 1 — поиск по имени и кнопка фильтра (стихии и классы — в шторке, на кнопке — сколько выбрано). Строка 2 —
// «★ Мои N · Доодеть N» (ни один не нажат — все с билдами; нажатый повторно отжимается) и «⇄ Обмен» (когда обмен доступен и у кого-то есть вещи; сразу в режиме «Команда»); на самой
// узкой ширине «Обмен» — один значок (подпись остаётся для диктора). Пустой ростер — вместо строки 2 подсказка про звёздочку.
import { useState, type Dispatch, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { useIndex } from '@/game/data/IndexContext';
import { ClassIcon, ElementIcon, Icon } from '@/game/icons/Img';
import { SegSwitch } from '@/shared/ui/SegSwitch';
import { CharFilterSheet } from './CharFilterSheet';
import { effectiveMode, type CharFilter, type CharMode, type ListAction } from './charFilter';

export function CharBar({ s, dispatch, rosterSize, todressN, onTrade }: {
  s: CharFilter; dispatch: Dispatch<ListAction>; rosterSize: number; todressN: number;
  onTrade?: () => void; // нет — обмен недоступен или ни у кого нет вещей: кнопки нет
}) {
  const t = useT();
  const { D } = useIndex();
  const [open, setOpen] = useState(false);
  const filter = (patch: Partial<CharFilter>) => dispatch({ type: 'charFilter', patch });
  const picked = (s.cel ? 1 : 0) + (s.ccl ? 1 : 0);
  const mode = effectiveMode(s.cMode, rosterSize);
  return (
    <div className="cbar">
      <div className="cbar-row">
        <input className="search" id="char-q" type="search" placeholder={t.ui.charSearch} value={s.cq}
          onChange={(e) => filter({ cq: e.target.value })} autoComplete="off" enterKeyHint="search" />
        <button type="button" className="fbtn cbar-filter" id="char-filter" aria-label={t.ui.filter} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <Icon name="filter" />{picked > 0 && <b className="cbar-n">{picked}</b>}
        </button>
      </div>
      {rosterSize > 0 ? (
        <div className="cbar-row">
          <SegSwitch<CharMode> className="cmode" label="" group={t.ui.modeGroup} value={mode} onChange={(v) => filter({ cMode: v === mode ? 'all' : v })}
            options={[
              { value: 'mine', label: <><span className="vb-star">★</span> {t.ui.modeMine} {rosterSize}</> },
              { value: 'todress', label: <>{t.ui.modeToDress} {todressN}</> },
            ]} />
          {onTrade && (
            <button type="button" className="btn cbar-trade" onClick={onTrade}>
              <Icon name="arrows-exchange" /><span className="cbar-tl">{t.ui.tradeBtn}</span>
            </button>
          )}
        </div>
      ) : <p className="cbar-hint">{t.ui.charsHint}</p>}
      {picked > 0 && (
        <div className="cbar-chips">
          {s.cel && <Chip name={D.elements[s.cel]} icon={<ElementIcon el={s.cel} />} onOff={() => filter({ cel: '' })} />}
          {s.ccl && <Chip name={D.classes[s.ccl]} icon={<ClassIcon cls={s.ccl} />} onOff={() => filter({ ccl: '' })} />}
        </div>
      )}
      {open && <CharFilterSheet cel={s.cel} ccl={s.ccl} onChange={filter} onClose={() => setOpen(false)} />}
    </div>
  );
}

// выбранный фильтр: «💧 Water ✕» — нажатие снимает
function Chip({ name, icon, onOff }: { name: string; icon: ReactNode; onOff: () => void }) {
  const t = useT();
  return (
    <button type="button" className="fbtn cbar-chip" aria-label={t.ui.filterOff(name)} onClick={onOff}>
      {icon}{name}<span aria-hidden="true">✕</span>
    </button>
  );
}
