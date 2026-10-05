// Шторка «Билд для X» («Надето», шаг 7): варианты билда героя (features/worn/wearing aimOptions) — что для каждого есть в вещах и
// надето. Нажатие на текущий закрывает шторку; на другой — выбирает его, кнопка «Переодеть в …» записывает выбор и открывает
// экран «Переодеть» (запись, «Вернуть» и переход — у родителя: CharDetail, App). Строки — только про вещи героя.
import { useState } from 'react';
import type { Char, SetPiece } from '@/game/data/types';
import { useT } from '@/i18n';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import type { CharPool } from '@/features/gear/pool';
import { aimOptions, type AimOption, type AimPart } from './wearing';
import { Sheet } from '@/shared/ui/Sheet';

type T = ReturnType<typeof useT>;

// «Speed ×4»
export const partName = (ctx: Pick<Ctx, 'idx'>, p: SetPiece): string => `${ctx.idx.SET[p.set]?.short ?? p.set} ×${p.n}`;
// «DPS · Penetration ×4»; «По статам» — своё имя
export const optionName = (t: T, o: Pick<AimOption, 'stats' | 'variant'>): string => (o.stats ? t.ui.byStats : o.variant.name);

// строка части связки: не хватает — «не хватает m»; бонус только на T4 и его нет — «1 из 2 · бонус ×2 только на T4»;
// иначе надето (все надеты) или в вещах
function partLine(t: T, ctx: Ctx, p: AimPart): string {
  const name = partName(ctx, p.part);
  if (p.missing > 0) return t.ui.aimPartMissing(name, p.missing);
  if (p.t4 && !p.on) return t.ui.partT4(ctx.idx.SET[p.part.set]?.short ?? p.part.set, p.owned, p.part.n);
  return p.worn >= p.part.n ? t.ui.aimPartWorn(name, p.worn, p.part.n) : t.ui.aimPartHave(name, p.owned, p.part.n);
}

// кнопка билда героя «Speed ▾» — открывает эту шторку: план и ромб обмена. Нет onClick — видна, но не нажимается
export function AimButton({ name, aria, onClick }: { name: string; aria: string; onClick?: () => void }) {
  return (
    <button type="button" className="aimb" disabled={!onClick} aria-label={aria} title={name} onClick={onClick}>
      <span className="aimb-n">{name}</span> ▾
    </button>
  );
}

export function AimSheet({ c, ctx, st, cp, onClose, onChoose }: {
  c: Char; ctx: Ctx; st: GearStore; cp: CharPool; onClose: () => void; onChoose: (key: string) => void;
}) {
  const t = useT();
  const options = aimOptions(ctx, c, st, cp);
  const [sel, setSel] = useState<string | null>(() => options.find((o) => !o.now && o.canRedress)?.key ?? null);
  const picked = options.find((o) => o.key === sel && !o.now) ?? null;
  return (
    <Sheet title={t.ui.aimTitle(c.name)} onClose={onClose} className="aimsheet">
      <div className="vsheet">
        <ul className="alist" role="radiogroup" aria-label={t.ui.aimTitle(c.name)}>
          {options.map((o) => {
            const checked = picked ? picked.key === o.key : o.now;
            return (
              <li key={o.key}>
                <button type="button" role="radio" aria-checked={checked} className="arow" onClick={() => (o.now ? onClose() : setSel(o.key))}>
                  <span className="arow-h">
                    <b>{optionName(t, o)}</b>
                    <span className="arow-c">
                      {o.now && <span className="achip now">{t.ui.aimNow}</span>}
                      {o.canRedress && <span className="achip can">{t.ui.aimCan}</span>}
                      {!o.now && !o.stats && o.missing > 0 && <span className="achip">{t.ui.aimMissing(o.missing)}</span>}
                    </span>
                  </span>
                  {o.stats
                    ? <span className="arow-l">{t.ui.aimStatsLine(c.name)}</span>
                    : o.parts.map((p, i) => <span key={i} className="arow-l">{partLine(t, ctx, p)}</span>)}
                </button>
              </li>
            );
          })}
        </ul>
        {picked && <button type="button" className="btn primary aim-go" onClick={() => onChoose(picked.key)}>{t.ui.aimRedress(optionName(t, picked))}</button>}
      </div>
    </Sheet>
  );
}
