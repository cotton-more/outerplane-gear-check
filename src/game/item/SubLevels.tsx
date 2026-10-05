// Уровень сабстата кнопками 1–6 — сколько сегментов горит в игре: 1–4 у свежей вещи, 5–6 — только после Reforge (узкие,
// приглушены). На форме оценки и в карточке вещи. CapNote — строка «больше N не бывает»: нажатие упёрлось в предел
// суммы уровней грейда (levelCap); появилась — прокрутка к ней ровно настолько, чтобы её было видно, без анимации.
// at — на чём упёрлось: новый объект на каждое нажатие, строка снова прокручивается в видимую часть.
import { useEffect, useRef } from 'react';
import type { Grade } from '@/game/data/types';
import { useT } from '@/i18n';
import { DROP_LEVEL, MAX_LIT, levelCap } from './subs';

const LEVELS = Array.from({ length: MAX_LIT }, (_, i) => i + 1);

export function LevelButtons({ level, label, onTap }: { level: number; label: string; onTap: (n: number) => void }) {
  const t = useT();
  return (
    <span className="roll-b" role="group" aria-label={label}>
      {LEVELS.map((n) => (
        <button key={n} type="button" aria-pressed={level === n} className={[n < level && 'lit', n > DROP_LEVEL && 'after'].filter(Boolean).join(' ') || undefined}
          aria-label={t.ui.segLabel(n)} title={n > DROP_LEVEL ? t.ui.segAfter : undefined} onClick={() => onTap(n)}>{n}</button>
      ))}
    </span>
  );
}

export function CapNote({ shown, grade, at }: { shown: boolean; grade: Grade; at: unknown }) {
  const t = useT();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (shown) ref.current?.scrollIntoView?.({ block: 'nearest' }); }, [shown, at]);
  return shown ? <p ref={ref} className="seg-cap" role="status">{t.ui.segCap(levelCap(grade))}</p> : null;
}
