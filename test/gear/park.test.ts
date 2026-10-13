// Parked pieces (MODEL.md §5; .x/0200-boss E2b Q3, O2): park ⊂ pooled and not worn; the mark goes once someone wears the
// piece; it travels with the record (drop / undo, Core Fusion); the verdict, reserves and the batch see a pool without it;
// the backup OGC-GEAR9 keeps it, OGC-GEAR8 still reads.
import { describe, expect, it } from 'vitest';
import { makeCtx } from '@/game/context';
import { activePieces, dropChar, parkIn, syncWorn, undoDrop, type GearStore, type Piece } from '@/features/gear/model/gear';
import { switchFusion } from '@/features/gear/model/fusion';
import { loadGear, readsWhole } from '@/features/gear/store/gearStore';
import { poolView, removeFrom, wearFromPool } from '@/features/gear/pool';
import { verdictOf } from '@/features/gear/verdict';
import { inputOfPiece, planBatch } from '@/features/batch/plan';
import { decodeBackup, encodeBackup, type Backup } from '@/features/roster/backup';
import { char, idx, mk } from './statSets';

const CAREN = char('Caren').id, RIN = char('Rin').id;
const helm = (id: string, lit: Piece['lit'], bt: 0 | 4 = 0) => mk(id, 'helmet', 'Speed', lit, bt);
const GOOD = { 'DEF%': 3, CHC: 3, CHD: 2, SPD: 3 };
const WEAK = { SPD: 1, RES: 1, EFF: 1, HP: 1 };
// Caren wears w, holds p (parked or not)
function st(parked: boolean, extra: Piece[] = []): GearStore {
  const w = helm('w', { HP: 2, RES: 1, EFF: 1, SPD: 1 }), p = helm('p', GOOD);
  const pieces = Object.fromEntries([w, p, ...extra].map((x) => [x.id, x]));
  return { v: 3, seq: 9, pieces, pools: { [CAREN]: ['w', 'p', ...extra.map((x) => x.id)] }, worn: { [CAREN]: { helmet: 'w' } }, ...(parked ? { park: ['p'] } : {}) };
}
const ctx = makeCtx(idx, { rosterOnly: true, stage: 'grow', lv120: false, quirks: true }, new Set([CAREN]));

describe('storage', () => {
  it('park ⊂ pooled, not worn: wearing it drops the mark; removing the piece drops it; repeats and strangers go', () => {
    const s = st(true);
    expect(activePieces(s, CAREN).map((p) => p.id)).toEqual(['w']);
    expect(activePieces(s, CAREN, 'p').map((p) => p.id)).toEqual(['w', 'p']);
    const worn = wearFromPool(ctx, s, CAREN, 'p')!;
    expect(worn.st.park).toBeUndefined();
    expect(removeFrom(s, CAREN, 'p').park).toBeUndefined();
    expect(syncWorn({ ...s, park: ['p', 'p', 'zz', 'w'] }).park).toEqual(['p']);
    expect(parkIn(s, ['p'])).toBe(s);
    expect(parkIn(st(false), ['w']).park).toBeUndefined(); // worn — can't be parked
  });

  it('read: only pooled, unworn ids survive; a dropped one makes the read not whole', () => {
    const raw = { ...st(true), park: ['p', 'w', 'nope', 7] };
    expect(loadGear(raw, idx, [CAREN]).st.park).toEqual(['p']);
    expect(readsWhole(raw, idx)).toBe(false);
    expect(readsWhole(st(true), idx)).toBe(true);
  });

  it('removing a hero takes his parked pieces; «Вернуть» brings the mark back', () => {
    const { st: gone, dropped } = dropChar(st(true), CAREN);
    expect(gone.park).toBeUndefined();
    expect(dropped.park).toEqual(['p']);
    expect(undoDrop(gone, dropped).park).toEqual(['p']);
  });

  it('Core Fusion moves the pieces with their ids: the parked one stays parked on Core Fusion', () => {
    const [base, fusion] = Object.entries(idx.FUSED)[0];
    const s0 = st(true);
    const s = { ...s0, pools: { [base]: s0.pools[CAREN] }, worn: { [base]: s0.worn![CAREN] } };
    const sw = switchFusion(idx, [base], s, fusion)!;
    expect(sw.st.pools[fusion]).toEqual(['w', 'p']);
    expect(sw.st.park).toEqual(['p']);
  });
});

describe('the verdict and the batch do not see it (O2)', () => {
  const judge = (s: GearStore, x: Piece) => verdictOf(ctx, poolView(ctx, s).hero, inputOfPiece(x));
  it('a new piece is judged as if the parked one were not there; the Pool tab still lists it', () => {
    const copy = helm('n', GOOD); // the same content — material for p if p were held
    const without: GearStore = { ...st(false), pools: { [CAREN]: ['w'] } };
    expect(judge(st(true), copy)).toEqual(judge(without, copy));
    expect(judge(st(false), copy)).not.toEqual(judge(without, copy)); // without parking p does matter
    expect(poolView(ctx, st(true)).of(CAREN)!.pieces.map((p) => p.id)).toEqual(['w', 'p']);
    expect(poolView(ctx, st(true)).of(CAREN)!.unused.map((p) => p.id)).not.toContain('p');
  });
  it('the batch neither feeds it nor feeds into it', () => {
    const weak = helm('k', WEAK), good = helm('g', GOOD);
    const entries = [{ input: inputOfPiece(weak), twin: false }, { input: inputOfPiece(good), twin: false }];
    const fates = (s: GearStore) => planBatch(ctx, s, entries).lines.map((l) => `${l.id}:${l.fate.kind}`);
    const without: GearStore = { ...st(false), pools: { [CAREN]: ['w'] } };
    expect(fates(st(true))).toEqual(fates(without));
    const plan = planBatch(ctx, st(true), entries);
    expect(plan.st.park).toEqual(['p']);
    expect(plan.st.pools[CAREN]).toContain('p');
  });
});

describe('backup', () => {
  const round = (s: GearStore, roster: string[]): Backup => decodeBackup(encodeBackup(s, roster)) as Backup;
  it('OGC-GEAR9: the parked piece comes back parked, in its place in the pool', () => {
    const code = encodeBackup(st(true), [CAREN]);
    expect(code).toMatch(/^OGC-GEAR9-/);
    const b = round(st(true), [CAREN]);
    const ids = b.raw.pools[CAREN];
    expect(b.raw.park).toEqual([ids[1]]);
    expect(b.raw.pieces[ids[1]].lit).toEqual(GOOD);
    expect(round(st(false), [CAREN]).raw.park).toBeUndefined();
  });
  // a code of the released version (OGC-GEAR8, before parking), made by main's encoder: Caren — Speed helmet T4 worn and a
  // Critical Hit helmet in the pool, level 120; Rin — roster only
  it('OGC-GEAR8 reads: pools, worn, level as they were; nothing parked', () => {
    const b = decodeBackup('OGC-GEAR8-NZoRaXg81DQ0To0i8hRRuYjO3PLKAY0YqGO') as Backup;
    expect(new Set(b.roster)).toEqual(new Set([CAREN, RIN]));
    const ids = b.raw.pools[CAREN];
    expect(ids.map((id) => [b.raw.pieces[id].slot, b.raw.pieces[id].bt, b.raw.pieces[id].lit])).toEqual([
      ['helmet', 4, { CHC: 2, SPD: 1 }], ['helmet', 0, { HP: 1, ATK: 2 }]]);
    expect(b.raw.worn).toEqual({ [CAREN]: { helmet: ids[0] } });
    expect(b.raw.lv).toEqual({ [CAREN]: 120 });
    expect(b.raw.park).toBeUndefined();
  });
});
