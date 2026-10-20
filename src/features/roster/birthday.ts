// Hero birthdays (HISTORY.md 0240): who of the roster has one today and whom the card already congratulated this year.
// A person is the base name and the day: variants share the base hero's day (Regina and Poolside Trickster Regina), two
// people may share a name but not the day (Vlada 02/27, Demiurge Vlada 08/14). Only roster heroes (owner Q1), only on
// the day itself (Q2): a missed day waits for next year.
import type { Char } from '@/game/data/types';

export interface BdayPerson {
  key: string; // `${base}|MM/DD`: what ogc.bday remembers
  c: Char;     // the portrait and the card to open: the first owned version in data order
}

const pad = (n: number) => String(n).padStart(2, '0');
export const mdOf = (d: Date): string => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`; // local day, as outerpedia writes it

export function birthdaysOn(chars: readonly Char[], roster: ReadonlySet<string>, md: string): BdayPerson[] {
  const out = new Map<string, BdayPerson>();
  for (const c of chars) {
    if (c.bday !== md || !roster.has(c.id)) continue;
    const key = `${c.base}|${md}`;
    if (!out.has(key)) out.set(key, { key, c });
  }
  return [...out.values()];
}

// ogc.bday: person key → the year the card showed them. Only this year's entries matter; older ones are dropped on write
export type BdaySeen = Record<string, number>;
export const unseen = (people: BdayPerson[], seen: BdaySeen, year: number) => people.filter((p) => seen[p.key] !== year);
export const markSeen = (seen: BdaySeen, people: BdayPerson[], year: number): BdaySeen => ({
  ...Object.fromEntries(Object.entries(seen).filter(([, y]) => y === year)),
  ...Object.fromEntries(people.map((p) => [p.key, year])),
});
