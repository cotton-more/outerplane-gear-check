import { useEffect, useRef, useState } from 'react';
import { subLabel } from '@/game/data';
import type { Grade } from '@/game/data/types';
import { useT } from '@/i18n';
import { withinCap, type Subs } from '@/game/item/subs';
import { CapNote, LevelButtons } from '@/game/item/SubLevels';
import { Sheet, type Point } from '@/shared/ui/Sheet';

// Окно уровня нового сабстата: нажатие в сетке открывает его у нажатой клетки (at — её центр: кнопки 1–6 вокруг
// курсора и пальца), кнопки 1–6 — 3×2, как цифры на телефоне.
// Нажал уровень — стат встаёт в строку с ним; ✕, мимо окна или Esc — стат не добавляется. Прыжка к строке нет:
// уровень ставится сразу, а поправить его можно в строке, как обычно.
// Уровень, с которым сумма ушла бы выше предела грейда (game/item/subs levelCap), не срабатывает — строка «больше N
// не бывает» в самом окне: под строками её закрыло бы затемнение. Клавиши 1–6 — уровень, а не слот (горячие клавиши
// страницы их не получают).
export function LevelAsk({ stat, at, grade, subs, onPick, onClose }: {
  stat: string; at: Point; grade: Grade; subs: Subs; onPick: (n: number) => void; onClose: () => void;
}) {
  const t = useT();
  const label = subLabel(stat);
  // на чём нажатие упёрлось: новый объект на каждое — строка снова прокручивается в видимую часть
  const [cap, setCap] = useState<object | null>(null);
  const pick = (n: number) => {
    if (!withinCap(grade, subs, { ...subs, [stat]: n })) { setCap({}); return; }
    onPick(n);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-6]$/.test(e.key)) return;
      e.stopPropagation();
      e.preventDefault();
      pickRef.current(Number(e.key));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <Sheet title={t.ui.levelSheet(label)} onClose={onClose} className="lvl" at={at}>
      <LevelButtons level={0} label={t.ui.subYellow(label)} onTap={pick} />
      <CapNote shown={cap !== null} grade={grade} at={cap} />
    </Sheet>
  );
}
