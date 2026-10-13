# The evaluation model

The spec of the "stats + sets" model: how a gear piece is valued for a hero, how a hero's loadout is chosen, and how
that becomes a verdict (keep / equip / feed to Breakthrough / dismantle). Players read the Wiki; this file is for
people changing the code. The code is the final word — where a comment disagrees with it, the code wins.

History: this spec was `FORMULA.md` of the stat-set-model working folder (lost); it was rebuilt from the code, the tests, the Wiki and
the commit bodies on 2026-10-10. The numbering below keeps the old section numbers, so a comment that says
«§3 п. 3» / "§3 item 3" now means **MODEL.md §3 item 3** (see §10 for the other tags that survive in comments).
Product background — [GEARPOOL.md](GEARPOOL.md) (obsolete, history) and the Wiki pages `Equipment`, `Upgrading`,
`Fast-cleanup`.

Conventions. **V** is the value of a hero's layout (piece points + set value − the crit loss of §12; in the boss team trade
also − the EFF goal's term of §13). **Points** are decimals inside the model
and whole thousandths (**milli**, `game/build/points:milli`) wherever two numbers are compared: `milli(p) = round(p·1000)`,
because six points as a sum of shares can come out 5.999999999999999. `EPS = 1e-9` (`features/gear/pool/base`) is the
float tolerance for plain decimals. The **+1 point margin** is `THRESHOLD = milli(1)` (`features/gear/model/vs`).
Items are recorded as `Piece` (`features/gear/model/gear`): slot, grade (`rare` = Epic, `unique` = Legendary), set,
item key, main, `lit` (segments 1–6 per substat), `bt` (0–4, `null` = unknown, counts as below T4). A piece typed on the
form is a `Piece` with id `NEW_ID`, newer than every record (`layout:NEW_ID`). Settings that change numbers:
`lv120`, `quirks` (hero base for flat credit and SPD rows), `stage` ('grow' keeps stopgaps, 'end' does not),
`rosterOnly` (`game/context:Ctx`).

**Display.** Points are printed with one decimal everywhere (`i18n:dec`, `fit.pts`; the Wiki too). A gain is named in
text only from 0.05 (`model/vs:namedGain`), so a printed «+0» never appears. The «Переодеть» button (`worn/Redress:
redressLabel`) shows «+N очк.» when the gain is named, «пассивка лучше» only on a rank-up (a recommended weapon or
accessory goes on), and plain «Переодеть» otherwise (a Legendary for an Epic at equal points, an effect-set half at equal
V). English keeps "pts" also for 1.

## §0 Hero profile

`game/build/profile:profileOf(ctx, hero)` — null for a hero with no builds (no points, no verdict, no trade).

1. **Chain "By stats".** `defaultChain`: the substat priority chain (`Build.subs`, tiers separated by `›`, a tier may
   hold several stats joined by `=`) that most of the hero's builds share; a tie goes to the first build in outerpedia
   order. Points always follow this chain. A hero whose builds disagree (≈8 of 95) shows the other chains on the Worn
   tab for reference only (`worn/wearing:altChains`); the verdict judges by the first — an owner decision.
2. **Weights without main** `W0 = pointWeights(ctx, hero, chain)`: the chain's weights with no main line, used for set
   rows (§2).
3. **Set menu and U** — defined in §2 item 3 (`parts`, `menuSets`, `U`); a pinned hero (§6) has only the pinned combo's
   parts.
4. The profile also carries the `pin` (§6) and `ctx`: lv120, quirks and the set data change the numbers.
5. Profiles are memoized per (ctx, hero); the pin variants per profile (`pinnedProfile`, `comboProfile`).

## §1 Piece points

`game/build/points:pointsOf(ctx, hero, chain, item)` — the unit of value. The sum over the piece's substats of

    points(sub) = weightOfPlace(place) × credit × min(6, lit)

1. **Places.** `score:tierPlaces` numbers the chain's tiers by *place*: a tier of k stats takes k places, `SPD=CHD`
   shares one place and the next tier starts after all of them; an empty tier (a gap, `SPD>>CHC`) takes one place. A
   stat the item's main has closed completely (`mains:takenByMain` — the main sits on the stat's axis and every form of
   that axis is blocked, not a substat, or worthless for the hero) takes no place: the places after it move up. Tokens that are not
   substats (`PEN%`, `CDMG RED%`) are skipped, but their tier still takes its places.
2. **Every place counts** (`subWeights(…, allPlaces = true)`): no cut-off after the 4th place (the old rules used
   `CFG.tierCredit = [1,1,1,½]`; points do not). Weight by place (0 = first): `CFG.tierWeights = [1, .8, .65, .5, .4, .32,
   .26, .2]`, the last repeated. A perfect line (6 segments at the first place) is 6 points, hence the "good piece" bar
   of §4. SPD always has credit 1.
3. **Flat vs %** (owner: both count, % never below flat). ATK, DEF and HP are one parameter with two different
   substats, flat and %, and one item can roll both; each counts for its own segments at the *same* place. `X%` has
   credit 1. Flat `X` has credit by the hero's flat factor `r = min(1, flatFactor)`: `r ≥ 0.9` → 1, `r ≥ 0.6` → ½,
   else 0 (`CFG.flatFull/flatHalf`, `score:flatCredit`). `flatFactor` = the flat tick over the % tick applied to the
   hero's own base (level 100/120 by `lv120`, plus quirks by `quirks`; medians `CFG.flatFallback` without data). So flat
   credit is a step function — flipping `lv120` moves 109 of 285 hero-axis pairs. Flat axes that credit 0 for the hero
   are `uselessFor` and count as "closed" for `takenByMain` (a helmet with main HP% leaves only flat HP, usually 0).
4. **Main stat gives no points.** Fixed main lines (armor by set/slot/grade, weapon base flat ATK) and the chosen main
   only *block* substats (`mains:itemMains`: the game blocks a substat with the same stat **and** the same flat/%
   kind). Enhance and Reforge are not forecast: the piece counts as entered. Legendary and Epic are equal in points.
   **No Reforge forecast anywhere in the verdict** (owner, 2026-10-01): no dice, no «Worth a Reforge» line, no Roll
   line, no Top-roll badge, no "if this stat rolls…". Reforge is the player's gamble; afterwards the piece is entered as
   new, or its segments are fixed on the card. The app also never pre-fills a form modifier from an old record
   («Try a replacement» on a T4 record does not press «T4»).
5. `pointsBreakdown` (per substat: key, place, weight, credit, points) feeds the Worn tab; `piecePoints(P, piece)` in
   `features/gear/layout` is the memoized per-(profile, piece) value.
6. **Rank of a weapon or accessory** (`layout:gearRank`, `model/vs:fit`) — the *passive matters more than substats*:
   - `rec` (1): a Legendary whose item is in the list of any of the hero's builds and, if the list names mains, whose
     main is among them; class limits respected (`wearable`).
   - `stopgap` (0): any other piece (Epic, Legendary off the list or with another main) whose main some build of the
     hero asks for in that slot — only at `stage = 'grow'` — and whose substats pass `score:tempOk`: useful ≥ 3, or
     ≥ 2 (Epic) / ≥ 3 (Legendary) useful with ≥ 5 useful segments (`CFG.tempGood/tempGood2/tempYellow`).
   - `no` (0): the rest. A stopgap has the same rank as `no` — only `rec` outranks points (owner 2026-10-10: an Epic
     stopgap took an off-list Legendary with the same 2 useful substats and more points, by rank). `stopgap` still
     decides what is kept and fed (§4). Armor adds nothing to the layout's rank (`gearRank` for armor only says whether the set is in
     the chain's combos).

## §2 Set value

`game/set/setValue:setValue(P, set, n, n4)` — n pieces of a set in the layout, n4 of them at T4; only for n ≥ 2.
**`value = halves × U + rowsValue`.**

1. **Which bonus rows are on** (`game/set/setBonus:bonusRows`; owner's Breakthrough rule, checked against outerpedia):
   - 4P: the T4 row if n = 4 and n4 = 4; otherwise the T0–T3 row if n = 4.
   - 2P: the T4 row if n4 ≥ 2; otherwise the T0–T3 row if n ≥ 2.
   - Speed, Penetration and Bursting have no 2P T0–T3 row, and their 4P T0–T3 row is the whole bonus: when 4P is the
     T0–T3 row and the set has no 2P T0–T3 row, no 2P row is added (Speed T4 T4 T0 T0 = +25 %, not 13 + 25).
   Mixed T4 examples: Speed T4 T4 T0 = +13 %; Speed T4 ×4 = 13 + 12; Attack T4 T4 T0 T0 = 35 + 20. `bt = null` is
   not T4. A set whose bonus data is missing counts as an effect set.
2. **Halves** (what the hero's menu wants of the set): 2 if `parts` has `set:4` and the 4P row is on; else 1 if `parts`
   has `set:2` and a 2P or 4P row is on; else 0. (A menu part ×4 gives no half for only 2 pieces.)
3. **Menu and U** (`game/build/profile`): `parts` = `set:n` for every part (`{set, n}`, n = 2 or 4) in every combo of
   every build of the hero, `menuSets` = their sets; a pinned hero has only the pinned combo's parts (§6). **U** = points of
   the most valuable 2-piece T4 bonus row among the sets whose bonus is expressible in stats (`convertible`), `rowPoints`
   over `W0` (§0.2); `uBy` lists them. A half is priced U, "as if it were points".
4. **Rows not covered by a half** — a half covers the row on 2 pieces, or, when that row does not exist (Speed &
   co.), the 4P row that replaced it; two halves cover both. For a **stat set** (`convertible`: every row is expressible
   in a stat, SPD only when the hero's SPD base is known) an uncovered row is worth its points:
   `rowPoints = weightOfPlace(place) × credit × segments` over `W0`, segments = `value / step` (SPD:
   `value/100 × base / step`), **no 6-segment cap** (a row is not a substat). For an **effect set** (some row has no
   stat: Immunity, Penetration …) uncovered rows are worth 0: such a set gives no points of its own, only the half's
   price U, so the layout trades it for stats only when stats win.
5. `SetValue` also reports `halves`, `effect` and per-row points; `layoutValue` sums `halves` and the part that comes
   from effect sets (`effHalves`), used by `better` (§3).

## §3 Best layout

`features/gear/layout`. **V** = Σ piece points of the filled slots + Σ `setValue` over the armor sets with n ≥ 2 − the
crit loss (§12; `layoutValue`; also `ptsSum`, `setSum`, `critLoss`, `chc`, `halves`, `effHalves`, `rank`, `filled`). Slots: weapon, accessory, helmet,
armor, gloves, shoes.

1. **V is one function of the whole layout** — the same for the Worn tab, the verdict, the pool and trade.
2. **Who can stand and in what order** (`bestLayout`): candidates are pool pieces the hero can wear (`wearable`) and that
   are `eligible` — in the app (`pool/info:eligibleIn`) a piece worn now or one that passes the §4 bar; a weak piece
   the hero does not wear never enters. **Weapon and accessory** are decided per slot: higher rank first (§1.6), then
   points, then the tie-breaks of item 4. **Armor**: exhaustive over "one piece or empty" per slot, maximum V.
   `armorOnly` skips the gear slots (tests only). The pinned preview (`worn/wearing:fillOf`) passes armor plus the current
   weapon and accessory as the only gear candidates, so armor CHC is valued with the hero's real C₀ (§12 item 4).
3. **`better(a, z)`** — when layout `a` is worth switching to from `z` (used for "Equip", "Re-dress", trade steps):
   a. higher weapon/accessory rank (`Σ RANK`, empty slot = 0) — rank decides before points; or
   b. at equal rank, V higher by at least 1 point (`milli(a.v) − milli(z.v) ≥ THRESHOLD`); or
   c. at equal rank, an effect-set half turns on and V is not lower (`a.effHalves > z.effHalves`).
   **Legendary over Epic** (owner Q7, 2026-10-09): when the layouts differ only by Legendary pieces replacing Epic ones
   (`epicToLegend`), V not lower is enough (margin 0): the bigger main stat breaks the tie. A rank loss is never
   outweighed by points ("passive beats substats" — owner rule; the plan row and the Re-dress sheet show the cost).
4. **Tie-breaks.** Armor at equal V (`|Δ| ≤ EPS`): more filled slots; then more Legendary pieces (Q7); then the smaller
   sum of record numbers (older records first; `NEW_ID` is newest). Gear at equal rank and points: Legendary before
   Epic, then older. (Merge review: in 2 of 9,000 shuffles the record-number tie-break picks differently — a nit.)
5. **Exact pruning** (`prune`, default): V is Σ points + Σ `setValue(set, n, n4)`, so in a slot only the best piece per
   `(set, is-T4)` matters (equal keys are interchangeable for set value; ties inside a key follow item 4). The search is
   `O(k⁴)` over what is left (12 ms typical, 1.3 s at 168 passing pieces in 21 sets). `prune: false` is the full product,
   the test oracle (`test/gear/layout.test.ts`). When the hero's crit can reach the soft cap the search is different
   (§12.4).
6. **"Current layout"** (`pool/info:poolInfo.layout`) is the best layout over *worn + good* pieces; it is not stored.
   The **worn layout** is what the player marked worn. "Re-dress" (`worn/wearing:redressOf`) = `better(best, worn)`,
   shown as points, parts turned on/off and "better passive" (`rankUp`, points may be negative).

## §4 Verdict

`features/gear/verdict:verdictOf(ctx, pools, input, opts)` — for a new piece, every roster hero with builds is asked
what the piece would give them (`heroOutcome`), then the piece gets its best outcome. It is `null` (the old
by-thresholds verdict, `features/eval/verdict`, applies) when the roster is off or empty (`!ctx.scoped`), the item is
not in outerpedia (`unlisted`), or fewer substats than the grade drops (4 Legendary, 3 Epic, `dropSubs`) are typed.
Heroes replaced by their Core Fusion (`ctx.off`) and heroes that cannot wear the piece (class) are skipped.

**The bar («Порог») — "good piece" for a hero** (`pool/info:pieceBar`, `eval/verdict/bar`). `pass = keep || temp`.
- **Armor**: `keep` = the *old rule* (`armorBar.passesOld` on the hero's chain: ≥ 3 useful substats and, for Epic, SPD
  or a top-2-place stat or ≥ 5 useful segments; or SPD useful with ≥ 2 segments and ≥ 2 useful; or two main stats
  with ≥ 5 segments on Epic — `CFG.keepCount/spdKeep/spdRoll/epicTopTiers/epicYellow`) **OR points ≥ 6**
  (`points:goodPoints`, compared in thousandths, exactly 6.000 passes). `temp` (Epic only, not `keep`) = a stat of the top-2
  places with ≥ 2 segments plus another fully credited one, ≥ 5 segments on the fully credited stats (`armorBar.tempOk`,
  `CFG.epicTempRoll/tempYellow`). A pinned hero (§6) fails for armor of sets outside the pinned combo.
- **Weapon / accessory**: `keep` = rank `rec`, `temp` = rank `stopgap` (§1.6); points do not take part.
- On the owner's roster only 19 of 263 worn pieces reach 6 points, so in practice the old rule does most of the work.

**Outcomes per hero** (`heroOutcome`), in the order tried:
1. **wear** («Надень») — the piece passes the bar, stands in the hero's best layout with it (`uses`) and
   `better(layoutWith, current, epicToLegend(…))` holds (§3.3). The result carries dV (V with it − V now), `rankUp`,
   the set parts turned on/off and other pool pieces that now stand with it (`alsoWear`).
2. **keep** («Оставь») — armor that passes the bar but is not wear:
   a. *Pinned set in the menu*: no held piece of that set in the slot (a T4 piece is compared with the held T4 one), or
      points ≥ the held one + 1; `needT4` hint when the part needs T4 (`pool/info:needsT4`).
   b. *Otherwise* (no pin: every set is "by stats"; or a set outside the pinned combo is already excluded by the bar):
      the slot holds nothing, or points ≥ the best held piece of the slot + 1 (menu sets' held pieces get +U/2,
      `offBar`). Held = pool pieces the pool keeps (`info.strong`).
   In a and b "points" are **points in the current layout** (§12.5): CHC substats counted where the hero's crit leaves
   them, the new piece and each held one as if it stood in its slot. The bar stays plain points.
   Weapons and accessories are never "keep" without wear.
3. A hero's `temp` flag (`!bar.keep && bar.temp`) turns the stamp to **Stopgap** («Временно»).

**The piece's outcome** (`Result.kind`; the stamp is always about *the evaluated piece* — owner rule):
1. **wear** if any hero has wear (sorted by dV, then margin; up to 3 named). Stamp Keep («Оставить») with an "Equip on X"
   line, or Stopgap if the named hero's `temp` flag is set.
2. **keep** if any hero has keep (sorted by margin). Stamp Keep («Оставить», "Set aside for X") or Stopgap.
3. **material** — the piece *is* Breakthrough material, stamp Fodder («Фоддер»):
   a. **now** — `materialTargets`: the hero's pool pieces held by the pool, same kind below T4 (`sameForBt`: armor same
      slot/set/grade; Legendary weapon/accessory same item; Epic any of that slot), and *worth a Breakthrough*
      (`btWorth`): armor that passes the bar (stopgap Epic armor included — owner Q1: T4 counts toward the set bonus);
      weapon/accessory only if `keep` (a Legendary from the hero's list with the right main). Best target (most points)
      first. A **T4 piece nobody wears or keeps is feed too** and lifts the target straight to T4 (commit `f5612c9`).
   b. **reserve** — a weak piece kept for a future strong one (§5 item 5): the pool's reserve rules, at most
      `CFG.reservePerHero = 4` per hero per kind (a full T0 → T4) and `CFG.reserveMax = 8` of one kind over all heroes
      (`reservesOf`); the hero who already holds a look-alike is named first. A Legendary reserve is not covered by a
      good Epic of that set and slot (`overEpic` text: wear the Epic until a good Legendary drops).
   c. **weapon/accessory reserve** — a Legendary from the hero's list that is not good (wrong main) is kept while the
      hero holds no good copy of that item (`pool/info:listedFor`, `verdict:reserveFor`). Not one copy: as for armor, up
      to `CFG.reservePerHero = 4` copies of the item per hero (`reserveKey` `item:key`, so a full T0 → T4), under the
      same cap of 8 over all heroes.
   Material order: now → reserve.
4. **maybe** («Спорно») — `maybeFor`: heroes *outside* the roster (`ctx.outScope`) whose builds take this set/item and
   to whom the piece passes the bar (old rule or temp for armor; `rec`, or `stopgap` with `tempOk`, for gear). It is
   judged against outerpedia only: heroes outside the roster have no pool and no worn pieces (pieces exist only for
   roster heroes), so no record can lower it — the stamp comes from the piece and the builds alone.
5. **junk** («Разобрать») — nobody needs it. The text says who already has as good. A Legendary can be junk (the
   Wiki's "Fast cleanup" says so; the older note "Legendary is never dismantled" does not hold in code).
6. **Quiet line**: for material/maybe/junk, the hero who would gain V ≥ 1 from the piece if it stood anyway (it is weak,
   so it is never offered to wear) — "look for ATK and CHC" (`quietOf`, `lookFor`). CHC is not named once the hero's crit
   in the current layout is ≥ N − 15 (§12).
7. **Same piece guard** (`samePiece`): a not-worn pool record with identical slot, grade, set/item, main and substats
   **in the same order** → "looks like the one set aside" and the verdict is computed without it, until "It's a
   different one" (`twin`). Worn records never count as look-alikes: **what is entered is always a new piece from the
   inventory** (owner, 2026-10-01), never "the one on the hero". A copy of a worn piece is compared as is: below T4 an
   exact copy is material for the worn piece it copies when that one is worth a Breakthrough (§4.3a) — «Фоддер»; at
   equal T4 nobody gains and it is «Разобрать» («already as good»; «Спорно» if only outside heroes want it); a T4 copy
   of a worn piece below T4 is feed that lifts it straight to T4.

**Feed (`reserveBt`).** A good new piece eats reserves of its kind: the hero's own first (`heroOutcome`), then other
heroes' (`feedFrom`), up to `feedsLeft = 4 − bt` (T0 → T4). Not for a stopgap weapon/accessory, not when the piece
fails the bar. **Breakthrough rules by kind:** armor — every piece that passes the bar (Epic stopgap armor is fed, Q1);
weapon/accessory — only "Keep" (rec); **Epic weapons/accessories are never fed or targets** (no Epic is `rec`), spare
Epic copies go to dismantle; a T4 piece nobody wears = feed. "Upgrading" lines (`eval/verdict/upgrade:upgradePlan`)
follow: Keep → Enhance + Breakthrough; Stopgap → Enhance; Stopgap armor may take Breakthrough, stopgap weapons/accessories
do not.

**Below T4 the advice is Breakthrough** (owner, 2026-10-01, "pool is truth"): what is in the pool is what is in the
game, so the app does not second-guess an unmarked "T4". For a held piece below T4 the line is the game action
(«Breakthrough it to T4 — …», «Do it now: … isn't T4 yet»), never "check, maybe you forgot to mark T4". A form piece
without «T4» is T0–T3; `bt = null` is only an old record, shown «T?» and counted below T4 (no hint to "mark" it). Tapping
«T4» on a card is what the player does after the Breakthrough was done in the game (the plan's footnote «up to 4 each —
at T4, tap "T4"» says so).

**After Equip** (`gear/model/material:oldFate`): the taken-off same-kind piece is material for the new one (Epic, below
T4), "evaluate first" (Legendary), or nothing (Epic weapon/accessory, new piece already T4).

## §5 Pool — what the app keeps for a hero

`features/gear/pool/info:poolInfo(P, pool, wornIds)`. The pool never deletes a record on its own: "no longer needed" is a
hint, and the player removes the record («Убрать у X», `ops:removeFrom`). The one thing that removes records by itself is
«Надеть» (`ops:planPut`, `putOn`): every piece of that hero's pool that the pool held before (for any reason below,
reserves included) and no longer holds once the new piece is worn — in *any* slot, not only its own (a new set or layout
can free a piece elsewhere) — and, for «Try a replacement», exactly the replaced record. The new piece is never removed;
a piece that was already "unneeded" before, or that the player removed by hand, is not touched; a hero without builds
(no profile) loses only the replaced record. «Equip» from the pool (`wearFromPool`) can lose only the piece worn before in
that slot, and only if the pool no longer holds it. A removal in the piece's own slot is what the «Заменить» button
announces, one in other slots is named in the message («Лишнее убрано»); «Вернуть» undoes all of them.

**Worn and the pool are what the player recorded.** `worn` is written only by the player's own actions — «Equip»
(`putOn`, `wearFromPool`), «Yes, all worn» (`wearAll`: only when the hero holds at most one piece per slot and wears
nothing yet), a recorded batch plan — and moved with the pieces by Core Fusion (`fusion:wornTo`). It is never inferred
from the best layout (§3.6: the current layout is computed, never stored). "Pool is truth": what is in a hero's pool is
what is in the game, so the app shows no "maybe you forgot to mark X" hints about the player's own records (owner,
2026-10-01); advice is only real upgrade advice (§4).

Reasons, in the order they are added (the numbers are cited from code):
1. **worn** — marked worn.
2. **layout** — in the current layout (§3.6).
3. **menu-best / menu-t4** — only for a *pinned* hero: in each armor slot the best passing piece of each menu set, and the
   best passing T4 one when the best is not T4.
4. **offmenu** — the best passing piece of a set outside the menu (all sets when unpinned) if it is ≥ 1 point above
   every held piece of the slot (menu sets' pieces get +U/2, `offBar`). Items 3 and 4 compare points in the current
   layout (§12.5), the same as the verdict's «Оставь», so a piece set aside stays held.
5. **reserve** — a weak (not passing), non-T4, non-held piece: armor whose set is *started* (the pool holds a piece of
   that set) while the slot holds none of it (`coversSlot`: an Epic reserve is covered by any held piece of that set and
   slot, a Legendary one only by a Legendary), and the hero is not pinned to another set; weapon/accessory — `listedFor`
   with no held copy of the item. Per kind (`reserveKey`: armor `set:slot:grade`, gear `item:key`) at most
   `CFG.reservePerHero = 4` per hero, strongest first; the cap of 8 over all heroes is applied by the verdict (§4.3b).
6. **unneeded** — everything else: "no longer needed — dismantle in the game, then Remove" (`reasonOf` picks one reason by
   seniority: worn › best at T4 › best of set › by stats › reserve).

**Parked** (`GearStore.park`; .x/0200-boss E2b Q2, Q3, O2, owner 2026-10-13): a piece a trade took off and could give to
nobody (§7 item 7) stays in the pool of the hero it came off, not worn, locked in the game, marked «припаркована» in the
Pool tab instead of a reason. It is **outside** the reasons above: the verdict, reserves, material, the bar a new piece is
held against, «Надеть»'s removals and the batch see the pool **without** it (`gear:activePieces`) — never feed, never a
Breakthrough target, never dismantled, never «no longer needed». The trade offers it first (§7 item 2). Invariant: park ⊂
pooled and not worn (`syncWorn`): the mark goes once someone wears it; «Убрать» removes it as usual; it travels with the
record (drop / undo, Core Fusion — ids) and is in the backup (OGC-GEAR9). A parked piece whose own hero now wears a better
one is a later question (owner's follow-up, .x/0200-boss PLAN §5).

`strong` = pieces held for any reason except reserve; `needsT4(P, set)` — Breakthrough to T4 is advised when T4 is needed
by *every* menu part of the set (Speed/Penetration/Bursting ×2, Immunity ×4).

## §6 Pin

A hero is "By stats" until the player pins a set. `game/build/profile:Pin` = one combo of one build; key
`hero/build#sig` (`pinKey`, `comboSig`; survives a build rename while the same combo with the same chain exists; a dropped
set unpins at load). Pinned profile (`pinnedProfile`): the chain of the pinned build, halves only for the combo's parts,
armor of other sets fails the bar (§4), best piece of each pinned-set slot is kept from the first one (§5.3), reserves
only for the pinned sets. No pin → the hero is wanted by stats only: build-set pieces are kept only for a pinned set, and
no weak stopgap goes into an empty slot (owner rule "pin = intent"). `worn/wearing:fillOf` gives "k of n" and "what to
look for" for a combo; a pin is not moved by Core Fusion.

## §7 Trade ("Обмен вещами")

`features/trade/model`. The calculation works on pre-computed numbers (`World`, `Gauge`, `Cand`), never on app objects.
It reuses the model: `world:worldOf` builds each hero's **gauge** from `piecePoints`, `gearRank`, `pieceBar`, `setValue`.
1. **A hero's order** (the gauge; `world:worldOf`, `profile:combosOf`): "By stats", or one set from his builds
   (`orderCombo`, by `comboSig`); a pinned hero's order is his pin, hard (the pinned profile, §6).
2. **What an order values, and candidates for the receiver.** Under an order, halves exist only for that combo's parts
   (`comboProfile`); other sets count as random ones (rows only). Candidates: his pieces (worn cost 0, spare cost 1), free
   (2) and other heroes' worn (3). **Other heroes' spare is never a candidate** (owner, 2026-10-12, Q1b): it is held for its
   hero (a better piece, Breakthrough; in game locked, not worn). Only the spare held when the calculation started
   (`World.held`): a piece a team member's step took off is a candidate at cost 2, so two members still swap. **A parked
   piece** (§5, `World.parked`; .x/0200-boss E2b Q3) is not held: it is a candidate for anyone at cost 2 (its own hero:
   cost 1, his spare), and into an **empty** slot it needs no bar — anything is better than nothing; into a filled slot
   the usual rules apply. Not candidates: wrong class, **not passing the receiver's bar (§4; his own worn is always
   eligible)** — a swap between two team members never hands over a piece unfit for the receiver — a code (content
   without Breakthrough) he already has at an equal or higher BT. **One extra condition, in the team trade only** (2–4
   members; owner, 2026-10-13, review 0203: "not an exception — an extra rule-condition of the team trade"): a **weapon or
   accessory** that a teammate holds — worn by him (cost 3), or in his pool and taken off by this same calculation (cost 2,
   holder him; never his spare, never a parked one) — may go to a member **below his bar** when the receiver's own piece in
   that slot is empty or off his list (`fit` `no`: neither recommended nor a stopgap — `model:belowBarOk`; `cands:candidates`
   and the pair swap's `was` in `team:bestSwap`). Armor keeps the bar; the rank rule (a recommended weapon or accessory
   outranks points) is untouched; the one-hero trade and «Кого переодеть?» have no team and keep the bar. (Why: Maxwell wears
   an Epic necklace off his list; with a teammate's accessory, below his bar, his EFF goes 187 → 298.) A **frozen slot**
   (item 4): only the receiver's own worn piece there, and nobody else takes it. (Was, until E2b: «Не брать» per piece,
   and the window's «free pieces» — both gone.)
3. **"Was → becomes"** per hero: points of each piece over the worn one; a part of the order that cannot be built —
   `missingOf`: no piece of the set in enough slots, or pieces exist but are below T4 and the part needs T4.
4. **Session locks**: a hero re-dressed in this window is `locked`: his worn gear is not taken by later steps (his
   pool is); team members whose step is ahead stay open. **«Оставить как было»** (.x/0200-boss E2b Q1, owner
   2026-10-13) on a recommended piece freezes **that receiver's slot** (`frozen`: `slotKey(hero, slot)`): nothing comes in
   (no substitute is searched for him there) and nothing leaves it; the declined piece stays in play for other members;
   the plan is counted again. A frozen slot takes part in no pair swap.
5. **Threshold** (`gate:planFor`, `model:gains`) — the same as §3.3: a slot changes only if the kit is better than with the
   *worn* piece by rank, by ≥ 1 point (`THRESHOLD`), or by an effect-set half at not-lower V; `legendOverEpic` (Q7,
   candidate Legendary not worn by anyone else) softens the margin to 0. In a slot where the best kit changes the piece,
   the cheapest source (`cheaper`: cost, then points) among pieces inside the window "worse than best by 0…1 point, same
   halves and effect halves, not lower rank, and itself passing the threshold against the worn piece" is taken. The best kit
   (`kit:bestKit`) is the exact armor search with branch-and-bound over the same key as §3 (`cmpKit`: rank, V, filled,
   Legendary, lower cost, lower loss, holder rank, record age). V of a kit includes its crit loss (§12.6).
6. **Team trade objective** (`team:teamSteps`, `scoreOf`; owner, 2026-10-02: heroes are equal, no priorities). The team
   trade is opened from «Команда» («Подобрать вещи», .x/0200-boss E2, owner 2026-10-13) for **two to four** members with
   builds (`teamOk`; was exactly four); each member's order is the build under his spot, kept with the team (`ogc.boss`),
   never the worn gear — the trade reads the store as it is. The
   exact search tries all orders of the members (24 for four) and keeps the order with the best result, compared in this
   sequence — (a) the **sum** of the members' kits (rank, V, filled slots; `use`), so sacrificing one hero for a bigger
   total gain is allowed; (b) the points of heroes outside the team (the swap must not take them from others needlessly);
   (c) the members' gains sorted ascending, compared lexicographically — at an equal sum the variant whose *smaller* gain
   is larger wins («Б → Caren 15, А → Rin 12» beats «А → Caren 20, Б → Rin 7»); (d) the first order. Pairs inside the
   four then swap worn pieces in several slots at once when nobody is worse and at least one is better by the threshold.
   **With a boss** each member who needs EFF has the EFF goal of §13 inside his V; the sum, the thresholds, the swaps and
   the order search see it through `keyOf`, nothing else changes.
7. **The end: no orphans** (`ends:endsOf`; .x/0200-boss E2b Q2, Q6, owner 2026-10-13 — reverses «holes are not filled»,
   owner 2026-10-04). After **every** member's step (a piece a later step takes at cost 2 is no replacement), each piece
   the plan took off a hero — worn at the start, worn by nobody after, still in a pool — goes, in the plan's order of
   heroes and then slots: (a) to the **giver** of that slot — the hero at the end of the chain (Rin took Caren's helmet →
   Caren; Rin ← Caren ← Stella → Stella) — if he can wear it (class; a total miss is fine); else (b) to another **team
   member** whose slot this trade emptied and who can; else (c) it is **parked** on the hero it came off (§5). The giver
   who gets a replacement may lose it again to the next hero (dressing in turn); the piece a receiver just got is his
   (session lock). A replacement **kept as it was** (`kept`: `slotKey(target, slot)`) leaves the target's slot empty and
   parks the piece. **Holes** of a receiver (a re-dressed hero, a team member): every empty slot — the hint names what to
   look for (`breaks` — a set whose half, §2, switched off with the hole); the player enters the piece he put there from
   the inventory («Ввести», an entry window in the plan — recorded only on «Сделал», no recount) or leaves it empty. A
   giver's slot this trade emptied and no replacement fills is **not shown** (O4, owner 2026-10-13): the record keeps it
   empty; the player fills it later (evaluation, batch, another team).
8. **Dressing in turn** (`turn:heroGain`, `turnOrder`; owner, 2026-10-12, 0200 Q1 + Q1a): «Кого переодеть?» shows each
   open hero's gain now — the number on his plan's hero line (`planOf` → `advance` → `lineGain`; «—» when the plan changes
   nothing), counted in chunks after every «Сделал» / «Вернуть» / order change. The first hero re-dressed takes the best,
   the next ones what is left — expected. Order: by name (the player decides whom to re-dress), the re-dressed last in
   done order with ✓, not pickable; «Закончить» closes the window (locks dropped). Each hero's plan is the same walk as the
   team's (item 9); his «Сделал» records it with its end (item 7), so nothing is left free between heroes.
9. **The walk** (`walk:walkOf`, `outcomeOf`; .x/0200-boss E2b Q7, owner 2026-10-13): the plan is recorded exactly as
   done in the game. Lines per hero (receivers in the plan's order), slot by slot: «Замок: <old piece>» right before the
   equip — only when that piece stays with him **parked** (O3, owner 2026-10-13: a piece that moves to someone — a
   replacement, a later member — is found in the game by grade, main and substats, so its line names it in full and needs
   no lock; the lock line names the parked piece in full, O5 — the player checks the game holds the same piece); the equip with its source (worn by X / X's spare / parked on X /
   inventory); a frozen slot («как было»); an empty slot («Ввести» / «Оставить»). Then «В конце — замены»: replacements
   («Caren ← шлем Rin» with the piece in full, each may be kept as it was); parking has no line of its own — the «Замок» line names the
   parked piece in full (O5); a giver's empty slot is no line (item 7). A line
   has a key — a recount keeps the ticks of unchanged lines. «Сделал» only when every line is done (ticked; kept, entered,
   left count): **one record** (`apply:applyWalk` — moves, replacements, parking, entered pieces) and **one «Вернуть»**
   (the store before, if untouched since). The ticks and decisions live on the device until «Сделал» / «Отмена»
   (`ogc.trade`, not in the backup; ✕ keeps them — the same hero's or team's trade picks them up; one walk at a time).

## §8 Batch plan ("Партия")

`features/batch/plan.ts:planBatch` — one plan for pieces entered as a batch. **No new rules**: every piece goes through
`verdictOf` (parked pieces are not in the pools it sees, §5 — never fed, never a target); a one-piece batch equals the single verdict on the real roster (0 of 69,000 differ; in synthetic worlds
119 of 24,738 differ through the re-plan, item 3). Entry kinds
(`batch.ts`): a typed piece, "E · worn" by a hero, "🔒" locked set-aside; all hold a position `#n` in the game list.

1. **Order**: strongest outcome first judged against the real store (wear > keep > material > maybe > junk), then the
   bigger gain (wear dV / keep margin); a T4 piece first among equals; then content, then `#n`. The entered order never
   decides a fate.
2. **Decisions are applied to a copy of the store** with the usual operations (`putOn`, `stashOn`, `removeFrom`), so
   later pieces see earlier keepers. Wear → `putOn` (the piece it replaces and other heroes' reserves it eats get lines
   of their own); keep/reserve → `stashOn`; material-now → feed (`feeds` per target, up to `FEEDS = 4`; a T4 piece counts
   as all four and the target is `full`, not offered again); «Спорно» (only heroes outside the roster want it) is junk.
3. **One piece — one fate.** A record the plan itself made and a later "Equip" takes off or drops is fixed: eaten → "feed"
   for the eater; held → "set aside"; gone → **re-plan round** without that hero for that line (`skipKey`, an internal
   "Don't take", not saved). Rounds only add exclusions, at most one per entry — bounded (the rare "Equip → dismantle"
   is a known limitation, Q2).
4. **Feed re-look** (`pass`, after all lines): a junk line, or a feed whose target left the pool (stranded), is
   judged again on the final store, with the player's «Don't take» only (a re-plan round's exclusion is about a record,
   and a feed makes none); if it is now material it feeds (a piece taken off one hero and worn by another can
   feed a piece that reached a hero later); a stranded feed that finds no target becomes junk, and its count is dropped
   so "T4" never lands on a gone record.
5. **T4 marks**: any piece fed four times (new or recorded, any tier below T4) gets "T4" — an op `{bt}` for "Undo";
   a recorded piece fed fewer than four times raises the footnote. Counts: wear, keep (+ reserves), feed, junk.
6. **Undo** (`undoPlan`): the operations' own undos, newest first, not a snapshot. "Record the plan" saves the plan's final
   store after the walk; recording only at the walk's end.
7. The **walk** (`walk.ts`) turns the plan into steps by game screen: equip → lock → Breakthrough → dismantle (dismantle
   last, so no feed is dismantled by mistake). Only equip and lock use positions; Breakthrough and dismantle name pieces
   by stats ("several identical in the game — take the first"). The titles: equip «Hero → caption» with a quiet grey
   «№ k» (the place in the hero's slot list) on the right; lock «Ряд r, p-й · #n» (the game's grid is 10 per row,
   `PER_ROW`). Reserves, caps and Breakthrough rules are those of §4–§5.
8. **No greed limit** (owner, 2026-10-08, "keep it simple"): a piece worth wearing is worn and fed now; there is no rule
   to hold it back for a better drop tomorrow (the piece worn today is replaced later through the usual «Equip» and
   Breakthrough). The owner's caveat — be careful where a T4 set bonus forms the build, maybe keep the better piece until
   three more arrive — is not implemented; an Epic armor stopgap is fed too (§4).
9. **No «Спорно» in a batch** (owner, 2026-10-10): a piece that suits only heroes outside the roster is dismantled —
   nothing is set aside for a hero the player doesn't have, so there is no hero to lock it for and nothing to decide.
   Material for the player's own heroes is checked before it (item 4). Was: «Отложить» / «Разобрать» chips, the walk
   waited, «Отложить» locked the piece for no one.
10. **Display order**: plan lines are *shown* in the entered order (`#n`), not the processing order of item 1. The line of
    a piece the plan takes off a hero (`off`: the worn piece a new one replaces, a set-aside record it pushes out) sits
    right under the entry that caused it; such lines are decided after all entries, in the order the pieces came off.
11. **«Record the plan» recomputes** (`useBatchMode.done`): the plan is made again on the *current* store at the tap,
    never applied stale — the batch can live for days in `ogc.batch` and the worn pieces may have changed meanwhile.
    Then the plan's store is written, the batch is cleared and a message with «Вернуть» (item 6) is shown.
12. **An item not in outerpedia data** (`verdictOf` → null, fate `none`): the line says «Не посчитать: предмета нет в
    данных outerpedia»; the plan does nothing with it (no operation on the store, not counted) and the walk skips it.

**Known limitations** (reviewed, left as they are):
- The re-plan (item 3) can turn the verdict's «Надень» into another fate (dismantle, feed, reserve): bounded (one round
  per entry, rounds only add exclusions); 0 of 69,000 on a real roster and 0 dismantles in 800 chained batches, but about 120
  of 24,738 in synthetic worlds (owner Q2: leave).
- `gear.newer` (the gear was saved by a newer page): `gear.set` does nothing, yet «Record the plan» says "recorded".
  No real path today — the tour hides the batch and nothing writes a newer store.
- Look-alike entries (same piece entered twice) can get a double line or none; line keys of taken-off pieces («n~k») move
  when a piece is added; walk ticks go stale when the store changes.
- A T4 piece and other feed going to one target waste feed (T4 piece first among equals helps; 836 of 6,000 synthetic
  batches, 46 of 450 real).
- Plan time on a laptop: ~60–180 ms for 25–60 pieces, worst 0.36 s (60 Legendary); about 0.5–1.4 s per tap on a phone
  (it is recomputed on every change of the batch while the plan or walk is open).
- «Не брать» on a hero holding 4 reserves can lift the cap of 8 per kind for that line (`verdictOf` counts the reserves
  of the heroes left in, `reservesOf`).

## §9 Constants

All in `game/config:CFG` unless noted.

| Constant | Value | Meaning |
|---|---|---|
| `tierWeights` | 1, .8, .65, .5, .4, .32, .26, .2 | weight by chain place (last repeats) |
| `tierCredit` | 1, 1, 1, ½ | old rules only (not points) |
| `flatFull` / `flatHalf` | 0.9 / 0.6 | flat credit 1 / ½ / 0 by `r = min(1, flatFactor)` |
| `goodPoints` | 6 | good piece by points, in thousandths |
| `keepCount` / `spdKeep` / `spdRoll` | 3 / 2 / 2 | old "keep" rule |
| `epicTopTiers` / `epicYellow` | 2 / 5 | Epic armor strictness |
| `epicTempRoll` / `tempGood` / `tempGood2` / `tempYellow` | 2 / 3 / 2 / 5 | stopgap rules (armor Epic, gear) |
| `reservePerHero` / `reserveMax` | 4 / 8 | reserves per hero per kind / per kind over all heroes; also the feeds to T4 |
| `flatFallback` | ATK .88, DEF 1.05, HP .57 | flat factor without hero data |
| `THRESHOLD` (`model/vs`) | 1 point | "better by at least 1" |
| `MAX_LIT` / `levelCap` (`game/item/subs`) | 6 / 22 Legendary, 17 Epic | segments per substat / sum of a piece |
| `FEEDS` (`batch/plan`) | 4 | feeds per target in a batch |

- **Why `reserveMax` is 8** (owner, 2026-10-08; measured on a roster of 46 heroes with builds, 51 set + slot pairs that
  need a Legendary): with 4 reserves per hero and no ceiling the pools could ask to keep up to 2,224 reserve pieces in
  total (all kinds; the whole inventory is ~1,500 incl. worn); a ceiling of 8 per kind gives at most 380, 12 would give
  556. The widest kinds are Speed armor pieces (34–37 heroes each). `reservePerHero = 4` is a full T0 → T4.
- **The segment-sum cap blocks only growth.** `withinCap(grade, from, to)` passes when the new sum is ≤ `levelCap` *or* ≤
  the old sum: an edit that raises the sum above the cap does nothing («can't be more than N»), while lowering a segment,
  moving points between segments and «T4» (no segment change) always work — old records can hold 24 / 18 (yellow up to 4
  on every stat plus orange). The same check runs on the form (`SubRows`, `LevelAsk`, `formState`), in the piece card and
  in `gear:updateIn`.

## §10 Tags that survive in comments

`PLAN Д#`, `TEXTS`, `TESTS T#`, «этап N», «макет 6.0» refer to sibling files of that lost working folder;
they are history. Short keys still readable in code: **A4** set rows for Speed/Penetration/Bursting (§2.4); **A5** gear
rank by any build (§1.6); **A10** name the hero with the biggest gain first; **A11** `needsT4`; **A12** off-menu bar with
+U/2 (§5.4); **A20/A21** no verdict without all substats / roster (§4); **D2** stopgap needs good substats; **D3** current
layout is computed, not stored (§3.6); **D6** "a T4 piece is never material" — **removed** 2026-10-09 (a T4 piece nobody
wears is feed; it is still never a *reserve*); **D10/D11** T4 need for all parts / `alsoWear`; **Д1** substat credit shown
on Worn; **Д2** the stamp is about the piece; **Д3** "On your characters now" shows up to three heroes; **Д9** pin
instead of a build; **Д11** storage v3 migration; **Q1** Epic armor stopgaps are fed; **Q7** Legendary over Epic at equal
points; **Q6** the plan row shows the cost when a recommended Legendary wins by rank but loses points; **Q2** the re-plan
may turn «Надень» into another fate (§8, known limitation); **Q3** the upgrade notice adds a sentence about cleared marks
only when the old v2 store had marks, «Не отдавать надетое» or a chosen build (`ui.modelNoteMarks`); **Q4** one caption
rule wherever a piece is named — a Legendary weapon or accessory «item · main», an Epic «Steel Sword» / «Steel Necklace ·
main», armor in batch rows the slot word alone, «T4» only at T4, the caption coloured by grade (DEVELOPMENT.md "Shared
elements").

**Review tags.** «Р1…Р20» are decisions of [GEARPOOL.md](GEARPOOL.md) (still in the repo). «В#», «П#», «вопрос N», «находка N»,
«ревью этапа 10» and «ревью eval-only» name numbered questions, findings and owner decisions of review documents that no
longer exist; each comment that carries one still states the rule, and the rules are in this file and in DEVELOPMENT.md.
Comments that say «решение владельца 2026-10-01/02» come from the eval-only feature review.

**Trade tags** (`features/trade`, `test/trade`; history — the rules are in §7). `R#.#` are requirement numbers of the lost
trade `SPEC.md`, as far as the code shows: R1 piece identity (R1.2 the code without Breakthrough, R1.7 the cost
classes 0–3), R2 the metric and order (R2.2 whole thousandths, R2.5 the full order of kits, R2.6 the world as at the moment
of calculation, R2.7 only heroes with builds), R3 candidates and session locks (R3.2, R3.5 team members whose step is
ahead stay open), R4 entry and session (R4.1 a team is exactly four, R4.2 four places in a diamond, R4.5 nothing
unconfirmed is stored), R5 which pieces may be candidates (R5.4 free pieces, R5.5 Breakthrough of a code the receiver
has, R5.6 an unmarked slot has no threshold), R6 the plan (R6.1 tie-breaks, R6.2–R6.4 threshold and losses, R6.6 «Сделал»),
R7 team trade, R8 holes (R8.4 the hint), R9 how to find a piece in the game (R9.1 search key and source, R9.2 the hint for
a hole), R10 screens and texts (R10.1 the «К обмену» button, R10.3 team pick, R10.4 plan view, R10.8 the advice
threshold), R11 speed (R11.1 a hero's plan synchronously, ≤ 50 ms). Letters with a number in the titles of `test/trade`
(A1, C1–C9, D1–D18, E1–E12, F8, F9, H1–H17, I, J7, X1/X5/X6) are cases of the lost `TESTS.md` (J7 — «Cancel» of the team
calculation has no consequences; X — tests on the owner's snapshot, see DEVELOPMENT.md "Tests"); «этап 5» / `DESIGN.md
«Этап 5»` is the team stage (`team.ts`, §7 item 6).

## §11 Open questions

Not decided, kept on purpose (owner, 2026-10-09: left for a future stat-model experiment, deferred). The model above stays as it is until an
experiment answers them:
1. **Passive vs substats.** Rank decides before points (§3.3), so a recommended Legendary weapon with level-1 substats
   replaces a T4 Epic with 3–5 useful substats at a cost of several points (the plan row shows the cost, Q6). The owner
   doubts "passive always beats substats"; the rule stays for now.
2. **Main-stat value.** Points ignore the main stat (§1.4), so Legendary and Epic are equal in points and a bigger main
   only breaks ties (Q7); how much a main stat is worth outside points is open.
3. **Linear points vs balanced stats.** (For CHC answered by the soft cap, §12.) Points are linear per stat: `ATK% 6 + junk` = 6.0 beats `ATK% 2 + CHC 2 + CHD 2` =
   4.9, although the game rewards a balanced set (chain weights against a real final-stat model). This also shapes the
   «Что искать» lines ("the first chain stats by points"); stat combinations are to be checked in the experiment.

## §12 Crit soft cap («Крит: 45%»)

Owner decisions 1–15 of `.x/0135-stat-targets` (outside git). In the game crit chance (CHC) is clamped at 100 % after gear
and passive buffs (`CStatValue_SetFinalValue.cs`), so linear points kept rewarding CHC a hero no longer uses. Only CHC;
EFF and SPD are later tickets.

1. **N** — «сколько крита нужно герою», an integer 0…100 per hero, default 100 (`GearStore.crit`, the sheet on «Надето»).
   The player lowers it for what the app does not see: gems, talisman, EE, team buffs (they only add,
   so the app's crit is never above the game's). It applies to every hero with **CHC in the chain** (`Profile.critOn`;
   off on data without `Char.chc` or `mainValues`). The profile carries N (`Profile.need`, `withNeed`, `profileFor(…,
   need)`), so per-profile memos stay right.
2. **The curve.** Per CHC %: f = 1 up to the knee N − 15 (not below 0), linear down to 0 at N, 0 above N
   (`game/stat/curve`). **C₀** — crit that carries no points: the hero (base 5 %, Striker class passive +5 %, awakening
   quirks +10 % by the `quirks` setting — `Char.chc`), the transcend stars' CHC (`Char.chc.trans` at the hero's ★ — `Ctx.stars`, the card's
   stars; not set → the hero's minimum ★1–★3, where no hero has it; the passive counts before the 100 % clamp, so it is just a smaller N), CHC main lines at +10 by Breakthrough tier (`mainValues`, `bt`
   null = T0), CHC set rows that carry no points (covered by a half, or of an effect set). **Segments** — the layout's
   CHC substats (≤ 6 per piece, 3 % each, weight = place weight × credit *on that piece*: a main that closes an earlier
   stat moves CHC up) and the CHC rows of stat sets that are not covered by a half (owner Q-A, B: the Critical Hit set's
   crit counts by the curve too; weight = the row's points per 3 %).
   Segments are laid on the curve from C₀ **heaviest first**: a band of weight w over [c, c + δ] is worth
   w·(F(c + δ) − F(c))/3. The **crit loss** = linear points of the segments − their value (`critLoss`; exactly 0 while the
   whole run stays under the knee). V = points + sets − loss. Check value: N 100, C₀ + earlier 80 %, weight 0.8 → six CHC
   segments are worth 0.80 / 0.79 / 0.67 / 0.51 / 0.35 / 0.19 = 3.30 instead of 4.8, so CHC 2 + CHD 4 (4.19) beats CHC 6.
   Heaviest first keeps V one function of the layout, and an added segment adds between 0 and its linear points.
   A CHC **main** is different: it raises C₀, so every CHC segment of the hero is worth less, and a CHC main can lower V.
   V is therefore not monotone in gear pieces; the search still never leaves a gear slot empty (item 4: the real
   alternative is another accessory, not nothing), and trade's holder loss is clamped at 0 (`cands:holderLoss`).
3. **What the card shows**: «Крит: 45%» (`statTotal` — C₀ + substats, floored), amber from N − 15, red from N; the sheet:
   the bar (zones, the hero's face at their crit, N with its flag), «Герой 20% · звёзды 65% · вещи 25%» (the stars part only when > 0), the number N. The budget gets
   «Лишний крит −x» (from 0.05), so Stats + Sets − crit = the heading.
4. **Best layout** (`bestLayout`): `critBinds` — an upper bound of the crit over the candidates (the hero + the most CHC
   main and segments in each slot + every CHC row the pool could switch on); ≤ the knee → the old search, the same result
   and speed. Else `critBest`: weapon and accessory of the top rank join the search (an accessory's CHC main changes what
   armor CHC is worth); every slot keeps its **Pareto front** instead of one piece per (set, T4): a dominates b when it comes
   first by points, has at least b's points without CHC, no more CHC from its main, the same CHC weight (or one has no CHC
   substat) — then lower C₀ never lowers V and with one weight the extra segments add between 0 and their linear points —
   and it does not lose the ties after V (armor: more Legendary, then older; gear ties go by list order). Branch and bound
   on the plain V (points so far + most points left + the most four slots' sets can be worth). `prune: false` is the full
   product; the oracle (`test/gear/layout.test.ts` T4.2, T4.2b) has its own curve. A gear slot is never left empty when it
   has a top-rank candidate.
5. **Points in the current layout** (`pointsIn`, decisions 3 and 15): a piece's points with its CHC substats valued where the
   current layout leaves them (= points − the loss its segments add, the piece standing in its slot). The current layout,
   not the worn one — owner decision 15: the same layout «Надень» compares with, so a piece set aside is always held.
   Used by «Оставь» (§4) and pool reasons 3–4 (§5); the bar, reserves and Breakthrough targets stay plain points.
6. **Trade** (§7): the gauge has `crit` (`CritGauge`: loss of a kit, per-item facts, a quick bound — `Item.chc` is a
   piece's most crit, the same for every hero); `keyOf` subtracts the kit's loss (`KitKey.crit`); the plan's hero line names it — «Лишний крит a → b» after the stats part, when it changes in tenths (decision 14), so stats + sets − crit add up to the gain. `bestKit` runs the plain search first: a
   plain best that loses nothing is the best (no kit beats its plain V); otherwise `critKit` — the same fronts (ties: Legendary,
   cost, holder loss, roster, age) under branch and bound. The trade hole hint may still name CHC (it has no crit after the
   trade).
7. **Elsewhere.** The T4 line's gain includes the loss; «Что искать» set gains are the set part only (no loss).
8. **Not modelled** (the player lowers N): gems (+3 % each), talisman (7.2…9 %), EE, Singularity of the main, active
   buffs (Valentine, Tamara, Skadi, Noa +50 % after the cap — the reason of outerpedia's «CHC up to 50%»; default N stays
   100, owner). Enhance: every main counts at +10.

## §13 EFF and SPD goals in the boss team trade («Эфф ≈ 184 → 222 · 93%», «Скорость 138 → 232 ✓»)

.x/0200-boss E3, owner decisions Q1–Q7 and Q3a (2026-10-13, PLAN §5). Only in the team trade on «Команда» with a boss: the
verdict, the pool, «Надето», the batch and the one-hero trade are unchanged (the hero card doesn't know whom the hero fights).

1. **Who and what.** Every member with builds who needs EFF (rule R, `Char.eff.d`) gets `EffGoal { t, star, bonus }`
   (`features/trade/model/goal`, `WorldOpts.goals`, composed in `screens/team`): the target **t = the boss's RES at the
   stage + 1** — the debuff always lands (Q1; no chance setting, no guide numbers); the spot's ★ and the battle bonus
   (`battleBonus`: the element quirk node, the strongest teammate's transcend team row). The EFF it is held in is the
   timeline's (Q2): the kit's EFF by the app's count × the typed ratio (`effShown`) + the bonus ‰ of the base (`inBattle`);
   nothing typed — the app's count, «≈» on the line.
2. **The term** (`GoalGauge.loss`, subtracted in `keyOf` like the crit loss; `KitKey.goal`). Below t each missing EFF%
   segment costs **λ = 1 point** (Q3): a debuffer takes EFF while it costs few stats, a far-off one pays little for a real
   gain in chance (Q5: no special case for an unreachable target). Above t EFF is worth **nothing** (Q3a): the EFF%
   segments (weight = place weight × credit on the piece) and the EFF set rows that carry points (a stat set, a row not
   covered by a half) are laid from the EFF that carries none (the hero, the main lines' flat EFF, covered rows) heaviest
   first, and what lies above t loses its points — a sharp step, no knee (100 % at RES + 1). So surplus EFF goes to whoever
   lacks it, and a hero far above t takes other stats over EFF.
3. **The goal's EFF is linear** (no floors): v = mult × (W × (1000 + rate)/1000 + own + flat), mult = (1000 + premium)/1000
   × typed/at + bonus/1000; one EFF% segment is always `seg` = mult × W × 2.5 %. The shortfall is a sum of whole thousandths —
   a (the empty kit) − Σ b (per piece: segments and flat EFF) − Σ r (per set: its rows) — so the search splits it by slot
   exactly. The line prints the game's number (`effOf` with its floors), at most 3 away.
4. **The kit search** (`kit:bestKit`). The plain best that loses nothing is the best. A target out of reach for every kit
   (a − Σ max b − rMax > 0) makes the term linear: the usual search on v + b per candidate and bonus + r per set
   (`linearKit`; the same order of kits). Otherwise `critKit`'s Pareto path with a stronger dominance (`goalDominates`:
   a's points without its CHC and EFF segments cover b's plus what b's extra segments could bring — a CHC segment its
   points, an EFF one its points and λ; where a has more segments they are at least as heavy; the same flat EFF from the
   main; no more CHC from the main) and two bounds: V' ≤ points + b − a + the most rows take off (a branch without EFF carries
   the whole penalty) and the sets a branch can still finish (`setUp`: the sets begun get some of the slots left, at most two
   new sets the rest — instead of the best set value anywhere). The oracle is the brute force (`test/trade/goal.test.ts`).
5. **What the plan shows** (Q6): the ▲/▼ gain and «Статы» stay plain stats (+ sets − crit: `HeroLine.before/after` put the
   goal's term back); a member with a goal whose EFF changes gets its own row «Эфф ≈ 184 → 222 · 93%» (`HeroLine.eff`: the
   game's battle EFF before and after, the chance after — `landChance`; ✓ above RES).
6. **The candidates are as before** (Q4): the goal pulls no piece that fails the member's bar (but the team trade's own rule,
   §7 item 2, lets a teammate's weapon or accessory below the bar into a slot off the member's list; owner, 2026-10-13,
   review 0203), and a recommended weapon or accessory still outranks points — EFF never beats a passive.
7. **New inputs — a new walk** (Q7): the walk's target in `ogc.trade` is `team:<ids>|<boss>@<stage>|<id>*<★>,…`; another
   boss, stage, ★ tried on a spot or team starts a new walk (ticks reset, silently). No boss — no goals, the plan and the
   target of today.
8. **Speed** (owner's roster, 14 guide teams, desktop): the worst team 0.6 s (0.7 s without goals), all together 1.6× the
   plain time — the calculation runs in chunks with «Отмена», as before.

**The SPD goal** (.x/0200-boss E4, owner decisions Q1–Q7, 2026-10-13) — the same plumbing, a second term:

9. **Who.** A member with builds whose turn-1 skill acts before the boss does (`Char.turn`, `update.py turn_reasons`): S1
   always, S2/S3 only with start cooldown 0 at the max level; on the boss — ATK, SPD or crit down, priority down, taunt,
   hard CC, cooldown up (a DEBUFF* row on an enemy, roll ≥ 50 %; cooldown up is any `BT_COOL*_CHARGE` with a negative
   value); for the team — shield, DEF up, damage cut, invincibility, immunity. Only what happens by itself counts: a row
   with a `conditionType` (a status on the caster or target, the target's element…), a trigger on another effect's end
   (Monad Iota's Golden Curse) and an ultimate that waits for its unique resource (Demiurge Stella, Monad Iota) are out —
   Ember's taunt, Sigma's stun, Snow's push. A row the boss is immune to at the stage goes (`reasonsAt`, the effect id
   against `factsAt().imm`). The app
   decides (Q1): no per-spot switch, no guide numbers, never a ceiling. The reason is shown on the timeline's expanded row,
   not in the plan (Q7); a member without one has no goal — SPD stays a plain chain stat, the row drops «нужно …».
10. **The target** is the SPD that surely moves first (Q2): `firstAt(boss)` — the first SPD above boss × 100/95 (`turnOf`,
    the team's top SPD cancels out); no luck level. The SPD it is held in is the turn order's (Q6): the kit's `spdOf` + the
    allies' transcend bonus (`spdBonus`: every member's team row `Char.spdUp` at its ★ adds up — Dianne + Mene = 15 — plus
    the hero's self-only row); EE, talisman and buffs stay invisible.
11. **The term** (`SpdGauge.loss`): below the target each missing SPD segment (3 SPD) costs **λ = 1 point** (Q3) — 333
    thousandths per SPD, whole numbers; **above it SPD keeps its chain points** (no surplus step: extra SPD is more turns
    later). The game's SPD is linear in the pieces — ⌊B × (1000 + rate)/1000⌋ + 3 × segments + SPD mains, the rate from one
    set (only the Speed Set has SPD rows) — so a − Σ b − Σ r = 333 × (t − SPD) exactly (`test/trade/spdgoal.test.ts`).
12. **No chance — no goal** (Q5): `spdReach` — the most SPD any kit could give (per slot the fastest piece; for a set with
    SPD rows each armor slot also tries its best piece of that set, T4 and not) over the trade's own candidates for that
    member (`reach:tradeSpdReach` = `candidates` of §7 item 2: the receiver's bar, others' spare never, code copies,
    parked pieces into an empty slot without the bar; class-wearable) + the bonus; at or below the boss's "surely after"
    bound (≈ × 0.95) the goal is off and the timeline says «Из твоих вещей не догнать: самое большее N». A member without
    builds has no gauge and no goal; his line counts every piece he could wear (worn by anyone, his pool, parked ones).
    With some chance the goal stays, λ caps the cost (an out-of-reach target turns linear, as EFF's).
13. **Both goals on one member** (Q4) — the sum of the two terms. The kit search takes goal terms as a list
    (`kit.ts termsOf`): the plain best that loses nothing to crit and every term; terms out of reach fold into v / the set
    value (`linearKit`); otherwise `critKit` with the dominance per stat (CHC, EFF, SPD segments each against the candidate's
    points; EFF flat equal; SPD flat below b's adds the penalty b's extra SPD could close) and a bound per set of goals
    (every mask: points + its b's at their best − its a's + its rows' most). bestKit = bruteKit on random worlds with both.
14. **What the plan shows** (Q7): «Скорость 138 → 232 ✓» / «Скорость 201 → 214 · 74%» under the EFF row, the Speed Set's
    icon (`HeroLine.spd`: SPD with the bonus before and after, the chance after — `turnOf`); only for goal members whose SPD
    changes; the gain stays plain stats. Speed (owner's roster, 11 guide teams + a singularity, desktop): the worst team
    0.62 s (E3 0.59 s), all together E4 3.0 s vs E3 2.8 s (`probe-E4/timing.txt`) — auto-run kept.
