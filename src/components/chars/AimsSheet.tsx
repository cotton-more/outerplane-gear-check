// Шторка «Билды героев» («Надето», шаг 7) — из плашки «Выбрал билды… · Проверить»: герои, которым билд отмечен по правилу
// (logic/aim unconfirmed) — имя, билд, причина, прогресс связки и «▾» (шторка «Билд для X»). «Всё верно» записывает выбор
// каждому из списка (запись, флаг «показано» и «Вернуть» — у App).
import { useState } from 'react';
import { useT } from '../../i18n';
import { aimOf } from '../../logic/aim';
import type { Ctx } from '../../logic/context';
import type { GearStore } from '../../logic/gear';
import { isStats, type PoolView } from '../../logic/pool';
import { reasonOf } from '../../logic/wearing';
import { Img } from '../Img';
import { Sheet } from '../Sheet';
import { AimSheet, partName } from './AimSheet';

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
      case 'on': return w.part ? t.ui.aimWhy.on(partName(ctx, w.part)) : '';
      case 'more': return w.set ? t.ui.aimWhy.more(ctx.idx.SET[w.set]?.short ?? w.set) : '';
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
                <Img k={'face:' + cp.c.icon} className="face" />
                <span className="tl-t">
                  <b>{cp.c.name}</b>
                  <span className="muted small">{[v ? (isStats(v) ? t.ui.byStats : v.name) : '', reason].filter(Boolean).join(' · ')}</span>
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
