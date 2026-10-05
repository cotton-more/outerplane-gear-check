// Общее для DOM-тестов: открыть «Ещё» (.x/0070-more-sheet) — на телефоне ☰ на нижней плашке, на ПК ⋯ в шапке.
import { act } from 'react';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const press = async (el: HTMLElement | null | undefined) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => el.click());
  await act(() => new Promise<void>((r) => setTimeout(r, 40))); // слой обучения меряет страницу раз в кадр
};

// Телефон (html.narrow): ☰ стоит на плашке «Оценки»; на «Персонажах» там «← Оценка» — сперва вернуться
export async function openMore() {
  if (!document.documentElement.classList.contains('narrow')) { await press($('.top-more')); return; }
  const tab = () => $('.vbar .vb-tab');
  if (tab()?.getAttribute('aria-label') !== 'More') await press(tab());
  await press(tab());
}

export const moreButton = (text: string) => [...document.querySelectorAll<HTMLElement>('.more button')].find((b) => b.textContent?.includes(text));

// «Ещё» → «Резервная копия» раскрыта: поле кода на месте
export async function openBackup() {
  await openMore();
  await press($('#more-backup'));
  return $('#backup-code') as HTMLTextAreaElement;
}

// «Ещё» → «Обучение» (меню «Какое обучение?» откроется само)
export async function startTour() {
  await openMore();
  await press(moreButton('Tutorial'));
}
