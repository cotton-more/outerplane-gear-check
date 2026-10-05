import { createContext, useContext } from 'react';
import type { Index } from './index';

// Датасет и индексы — один раз на страницу, доступны любому компоненту.
export const IndexContext = createContext<Index | null>(null);

export function useIndex(): Index {
  const idx = useContext(IndexContext);
  if (!idx) throw new Error('useIndex() outside <IndexContext.Provider>');
  return idx;
}
