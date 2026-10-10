// @vitest-environment jsdom
// Разбор хранилища при загрузке и устаревшие закрепления (ревью этапа 10, находки 2–3, В3 и В5): снимать или переносить
// только при целом чтении и данных страницы не старше уже виденных; сообщение — вместе с остальными после загрузки.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { createIndex } from '@/game/data';
import type { Dataset } from '@/game/data/types';
import { pinOptions } from '@/game/build/profile';
import { readStored, takeLoadNote } from '@/features/gear/store/stored';

const D: Dataset = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/data.json', 'file://' + __filename)), 'utf8'));
const idx = createIndex(D);
const caren = D.chars.find((c) => c.name === 'Caren')!;
const [a] = pinOptions(caren);
const LOST = `${caren.id}/${a.build.name}#999x4`;
const helmet = { id: 'p1', slot: 'helmet', grade: 'unique', setId: a.combo[0].set, itemKey: null, main: null, yellow: { CHC: 2 }, lit: { CHC: 2 }, bt: null, at: '' };
const gear = (o: Record<string, unknown> = {}) => ({ v: 3, seq: 1, pieces: { p1: helmet }, pools: { [caren.id]: ['p1'] }, pin: { [caren.id]: LOST }, ...o });
const put = (k: string, v: unknown) => localStorage.setItem('ogc.' + k, JSON.stringify(v));
const got = (k: string) => JSON.parse(localStorage.getItem('ogc.' + k) ?? 'null');
const dataAt = (date: string) => createIndex({ ...D, meta: { ...D.meta, commitDate: date } });

beforeEach(() => localStorage.clear());

describe('устаревшее закрепление при загрузке', () => {
  it('целое чтение, свежие данные: снято, записано, сообщение — в заметке загрузки', () => {
    put('gear', gear());
    put('roster', [caren.id]);
    expect(readStored(idx).st.pin).toBeUndefined();
    expect(got('gear').pin).toBeUndefined();
    expect(takeLoadNote(idx)?.pins).toEqual([[caren.id, LOST]]);
    expect(takeLoadNote(idx)).toBeNull();
  });

  it('прочитано не целиком (саб не из данных): закрепление не трогаем — ни в памяти, ни в хранилище', () => {
    const odd = { ...helmet, id: 'p2', yellow: { NEWSUB: 1 }, lit: { NEWSUB: 1 } };
    const raw = gear({ seq: 2, pieces: { p1: helmet, p2: odd }, pools: { [caren.id]: ['p1', 'p2'] } });
    put('gear', raw);
    put('roster', [caren.id]);
    expect(readStored(idx).st.pin).toEqual({ [caren.id]: LOST });
    expect(got('gear')).toEqual(raw);
    expect(takeLoadNote(idx)).toBeNull();
  });

  it('данные страницы старше уже виденных (кэш PWA): закрепление лежит; свежая страница потом снимает', () => {
    put('dataSeen', '2030-01-01T00:00:00Z');
    put('gear', gear());
    put('roster', [caren.id]);
    expect(readStored(idx).st.pin).toEqual({ [caren.id]: LOST });
    expect(got('gear').pin).toEqual({ [caren.id]: LOST });
    expect(got('dataSeen')).toBe('2030-01-01T00:00:00Z');
    const fresh = dataAt('2030-02-01T00:00:00Z');
    expect(readStored(fresh).st.pin).toBeUndefined();
    expect(got('dataSeen')).toBe('2030-02-01T00:00:00Z');
  });

  it('билд переименовали, набор на месте: молча переходит, без сообщения', () => {
    const renamed = a.key.replace(a.build.name, a.build.name + ' old');
    put('gear', gear({ pin: { [caren.id]: renamed } }));
    put('roster', [caren.id]);
    expect(readStored(idx).st.pin).toEqual({ [caren.id]: a.key });
    expect(got('gear').pin).toEqual({ [caren.id]: a.key });
    expect(takeLoadNote(idx)).toBeNull();
  });
});
