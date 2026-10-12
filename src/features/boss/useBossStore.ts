// 'ogc.boss' on the page (model/stored): read once, written on every change. Android unloads the page while the player
// is in the game — the boss, its stage and the team come back after a restart.
import { useState } from 'react';
import { storage } from '@/shared/storage';
import { restoreBoss, type BossStore } from './model/stored';

export function useBossStore(): [BossStore, (change: (s: BossStore) => BossStore) => void] {
  const [store, setStore] = useState<BossStore>(() => restoreBoss(storage.get<unknown>('boss', null)));
  const update = (change: (s: BossStore) => BossStore) => setStore((s) => {
    const next = change(s);
    storage.set('boss', next);
    return next;
  });
  return [store, update];
}
