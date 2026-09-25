import { useEffect, useRef, type Dispatch } from 'react';
import { SLOTS } from '../data';
import type { Action, AppState } from '../state/appState';
import type { Layout } from './useLayout';

const LEGEND = ['l', 'L', 'д', 'Д'];
const EPIC = ['e', 'E', 'у', 'У'];

// 1–6 — слот, L/E (и Д/У на русской раскладке) — грейд, Esc — сбросить предмет (открытое окно выбора закрывается раньше).
// На вкладке персонажей — только Esc, который закрывает шторку билдов на узком экране.
export function useHotkeys(state: AppState, dispatch: Dispatch<Action>, layout: Layout) {
  const ref = useRef({ state, layout });
  ref.current = { state, layout };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const { state: s, layout: l } = ref.current;
      if (s.tab === 'chars' && e.key === 'Escape' && s.charId && l.sheet) { dispatch({ type: 'selectChar', id: null }); return; }
      if (s.tab !== 'eval') return;
      const target = e.target as HTMLElement;
      const typing = !!target.matches?.('input[type="search"], input[type="text"], textarea');
      if (e.key === 'Escape') { if (typing) target.blur(); dispatch({ type: 'reset' }); return; }
      if (typing) return;
      if (/^[1-6]$/.test(e.key)) dispatch({ type: 'slot', slot: SLOTS[Number(e.key) - 1].id });
      else if (LEGEND.includes(e.key)) dispatch({ type: 'grade', grade: 'unique' });
      else if (EPIC.includes(e.key)) dispatch({ type: 'grade', grade: 'rare' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);
}
