// Общее для DOM-тестов (0197, owner 2026-10-12): из ростера — только через карточку: звёзды у имени → лист звёзд →
// «Remove from roster». Золотая ★ на плитке — значок, нажатие по ней — нажатие по плитке (открывает карточку).
import { act } from 'react';

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const press = async (el: HTMLElement | null | undefined) => {
  if (!el) throw new Error('нет элемента');
  await act(async () => el.click());
};
// плитка героя в списке по имени (title — «Имя — прозвище»)
export const tileOf = (name: string) => [...document.querySelectorAll<HTMLElement>('#cgrid .ctile')].find((x) => x.getAttribute('title')?.split(' — ')[0] === name);

// открытая карточка: звёзды у имени → «Remove from roster»
export async function removeOnCard() {
  await press($('.cd-head .cd-stars'));
  await press([...document.querySelectorAll<HTMLElement>('.hs-act .btn')].find((b) => b.textContent === 'Remove from roster'));
}

// со списка: открыть карточку героя и убрать его из ростера
export async function removeFromRoster(name: string) {
  await press(tileOf(name));
  await removeOnCard();
}
