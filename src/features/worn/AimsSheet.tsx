// Шторка «Билды героев» («Надето», шаг 7) — из плашки «Выбрал билды… · Проверить»: герои, которым билд отмечен по правилу
// (features/worn/aim unconfirmed) — имя, билд, причина, прогресс связки и «▾» (шторка «Билд для X»). «Всё верно» записывает выбор
// каждому из списка (запись, флаг «показано» и «Вернуть» — у App).
import { useState } from 'react';
import { useT } from '@/i18n';
import { aimOf } from './aim';
import type { Ctx } from '@/game/context';
import type { GearStore } from '@/features/gear/model/gear';
import { type PoolView } from '@/features/gear/pool';
import { reasonOf } from './wearing';
import { Sheet } from '@/shared/ui/Sheet';
import { AimSheet } from './AimSheet';
import { partText, setName } from '@/game/set/setName';
import { variantName } from '@/features/gear/ui/pieceText';
import { HeroFace } from '@/game/hero/HeroFace';

export function AimsSheet({ ctx, view, st, ids, onClose, onConfirm, onChoose }: {
  ctx: Ctx; view: PoolView; st: GearStore; ids: readonly string[]; onClose: () => void; onConfirm: () => void;
  onChoose: (charId: string, key: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const why = (id: string) => {
    const cp = view.of(id)!;
    const w = reasonOf(cp, aimOf(cp.c, st, cp));
    if (!w) return '';
    switch (w.kind) {
      case 'only': return t.ui.aimWhy.only;
      case 'want': return t.ui.aimWhy.want;
      case 'on': return w.part ? t.ui.aimWhy.on(partText(ctx.idx, w.part)) : '';
      case 'more': return w.set ? t.ui.aimWhy.more(setName(ctx.idx, w.set)) : '';
      case 'tie': return t.ui.aimWhy.tie;
      case 'stats': return t.ui.aimWhy.stats;
      default: return t.ui.aimWhy.first;
    }
  };
  const opened = open ? view.of(open) : null;
  return (
    <Sheet title={t.ui.aimsTitle} onClose={onClose} className="aimssheet">
      <div className="vsheet">
        <ul className="tlist">
          {ids.map((id) => {
            const cp = view.of(id);
            if (!cp) return null;
            const key = aimOf(cp.c, st, cp).key;
            const v = cp.variants.find((x) => x.key === key);
            const a = cp.asm.get(key);
            const reason = why(id);
            return (
              <li key={id}>
                <HeroFace c={cp.c} />
                <span className="tl-t">
                  <b>{cp.c.name}</b>
                  <span className="muted small">{[v ? variantName(t, v) : '', reason].filter(Boolean).join(' · ')}</span>
                </span>
                {a && a.need > 0 && <span className="tl-n">{a.progress}/{a.need}</span>}
                <button type="button" className="btn small" aria-label={t.ui.aimTitle(cp.c.name)} onClick={() => setOpen(id)}>▾</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn primary aim-go" onClick={onConfirm}>{t.ui.aimsOk}</button>
      </div>
      {opened && <AimSheet c={opened.c} ctx={ctx} st={st} cp={opened} onClose={() => setOpen(null)} onChoose={(key) => onChoose(opened.c.id, key)} />}
    </Sheet>
  );
}
