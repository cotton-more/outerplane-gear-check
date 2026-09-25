// Язык интерфейса и вердиктов: русский или английский. Выбор хранится в ogc.lang,
// пока не выбран — по языку браузера: русский для ru, иначе английский.
import { createContext, useContext } from 'react';
import { storage } from '../state/storage';
import { en } from './en';
import { ru, type Texts } from './ru';

export type { Texts };
export type Lang = 'ru' | 'en';

export const LANGS: Lang[] = ['ru', 'en'];
export const LANG_NAME: Record<Lang, string> = { ru: 'Русский', en: 'English' }; // каждый — на своём языке
export const TEXTS: Record<Lang, Texts> = { ru, en };

export const detectLang = (): Lang => (/^ru\b/i.test(navigator.language || '') ? 'ru' : 'en');

export function savedLang(): Lang {
  const v = storage.get<unknown>('lang', null);
  return LANGS.includes(v as Lang) ? (v as Lang) : detectLang();
}

export const LangContext = createContext<Texts>(ru);
export const useT = (): Texts => useContext(LangContext);
