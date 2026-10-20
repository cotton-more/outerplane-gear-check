import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Char } from '@/game/data/types';
import { storage } from '@/shared/storage';
import { birthdaysOn, markSeen, mdOf, unseen, type BdayPerson, type BdaySeen } from './birthday';

// Today's birthdays of the roster (features/roster/birthday): `today` — char ids for the tile's cake, all day; `card` —
// the people the card greets, once a year. The card counts as seen the moment it shows (a reload doesn't bring it back);
// quiet (the tour, the welcome card) holds it back without marking. The day is re-read when the page comes back on
// screen: the app may stay open past midnight
export function useBirthdays(chars: readonly Char[], roster: ReadonlySet<string>, quiet: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const md = mdOf(now);
  const year = now.getFullYear();
  const people = useMemo(() => birthdaysOn(chars, roster, md), [chars, roster, md]);
  const today = useMemo(() => new Set(chars.filter((c) => c.bday === md && roster.has(c.id)).map((c) => c.id)), [chars, roster, md]);
  const [card, setCard] = useState<BdayPerson[] | null>(null);
  const shown = useRef<BdaySeen>({}); // this page's own: without storage the closed card would come right back
  useEffect(() => {
    if (quiet || card) return;
    const fresh = unseen(unseen(people, storage.get<BdaySeen>('bday', {}), year), shown.current, year);
    if (!fresh.length) return;
    shown.current = markSeen(shown.current, fresh, year);
    storage.set('bday', markSeen(storage.get<BdaySeen>('bday', {}), fresh, year));
    setCard(fresh);
  }, [people, year, quiet, card]);
  const close = useCallback(() => setCard(null), []);
  return { today, card, close };
}
