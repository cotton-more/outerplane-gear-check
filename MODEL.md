# The evaluation model

The spec of the "stats + sets" model: how a gear piece is valued for a hero, how a hero's loadout is chosen, and how
that becomes a verdict (keep / equip / feed to Breakthrough / dismantle). Players read the Wiki; this file is for
people changing the code. The code is the final word — where a comment disagrees with it, the code wins.

History: this spec was `FORMULA.md` of the stat-set-model working folder (lost); it was rebuilt from the code, the tests, the Wiki and
the commit bodies on 2026-10-10. The numbering below keeps the old section numbers, so a comment that says
«§3 п. 3» / "§3 item 3" now means **MODEL.md §3 item 3** (see §10 for the other tags that survive in comments).
Product background — [GEARPOOL.md](GEARPOOL.md) (obsolete, history) and the Wiki pages `Equipment`, `Upgrading`,
`Fast-cleanup`.

Conventions. **V** is the value of a hero's layout (piece points + set value). **Points** are decimals inside the model
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
   - `rec` (2): a Legendary whose item is in the list of any of the hero's builds and, if the list names mains, whose
     main is among them; class limits respected (`wearable`).
   - `stopgap` (1): any other piece (Epic, Legendary off the list or with another main) whose main some build of the
     hero asks for in that slot — only at `stage = 'grow'` — and whose substats pass `score:tempOk`: useful ≥ 3, or
     ≥ 2 (Epic) / ≥ 3 (Legendary) useful with ≥ 5 useful segments (`CFG.tempGood/tempGood2/tempYellow`).
   - `no` (0): the rest. Armor adds nothing to the layout's rank (`gearRank` for armor only says whether the set is in
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

`features/gear/layout`. **V** = Σ piece points of the filled slots + Σ `setValue` over the armor sets with n ≥ 2
(`layoutValue`; also `ptsSum`, `setSum`, `halves`, `effHalves`, `rank`, `filled`). Slots: weapon, accessory, helmet,
armor, gloves, shoes.

1. **V is one function of the whole layout** — the same for the Worn tab, the verdict, the pool and trade.
2. **Who can stand and in what order** (`bestLayout`): candidates are pool pieces the hero can wear (`wearable`) and that
   are `eligible` — in the app (`pool/info:eligibleIn`) a piece worn now or one that passes the §4 bar; a weak piece
   the hero does not wear never enters. **Weapon and accessory** are decided per slot: higher rank first (§1.6), then
   points, then the tie-breaks of item 4. **Armor**: exhaustive over "one piece or empty" per slot, maximum V.
   `armorOnly` skips the gear slots (used for pinned previews).
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
   the test oracle (`test/gear/layout.test.ts`).
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
   so it is never offered to wear) — "look for ATK and CHC" (`quietOf`, `lookFor`).
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
   every held piece of the slot (menu sets' pieces get +U/2, `offBar`).
5. **reserve** — a weak (not passing), non-T4, non-held piece: armor whose set is *started* (the pool holds a piece of
   that set) while the slot holds none of it (`coversSlot`: an Epic reserve is covered by any held piece of that set and
   slot, a Legendary one only by a Legendary), and the hero is not pinned to another set; weapon/accessory — `listedFor`
   with no held copy of the item. Per kind (`reserveKey`: armor `set:slot:grade`, gear `item:key`) at most
   `CFG.reservePerHero = 4` per hero, strongest first; the cap of 8 over all heroes is applied by the verdict (§4.3b).
6. **unneeded** — everything else: "no longer needed — dismantle in the game, then Remove" (`reasonOf` picks one reason by
   seniority: worn › best at T4 › best of set › by stats › reserve).

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
   (`comboProfile`); other sets count as random ones (rows only). Candidates: his pieces (worn cost 0, spare cost 1), other
   heroes' spare (2), free (2) and other heroes' worn (3). Not candidates: wrong class, **not passing the receiver's bar
   (§4; his own worn is always eligible)** — a swap between two team members never hands over a piece unfit for the
   receiver — "Don't take", a code (content without Breakthrough) he already has at an equal or higher BT.
3. **"Was → becomes"** per hero: points of each piece over the worn one; a part of the order that cannot be built —
   `missingOf`: no piece of the set in enough slots, or pieces exist but are below T4 and the part needs T4.
4. **Session locks**: a hero re-dressed in this window is `locked`: his worn gear is not taken by later steps (his
   pool is); team members whose step is ahead stay open.
5. **Threshold** (`gate:planFor`, `model:gains`) — the same as §3.3: a slot changes only if the kit is better than with the
   *worn* piece by rank, by ≥ 1 point (`THRESHOLD`), or by an effect-set half at not-lower V; `legendOverEpic` (Q7,
   candidate Legendary not worn by anyone else) softens the margin to 0. In a slot where the best kit changes the piece,
   the cheapest source (`cheaper`: cost, then points) among pieces inside the window "worse than best by 0…1 point, same
   halves and effect halves, not lower rank, and itself passing the threshold against the worn piece" is taken. The best kit
   (`kit:bestKit`) is the exact armor search with branch-and-bound over the same key as §3 (`cmpKit`: rank, V, filled,
   Legendary, lower cost, lower loss, holder rank, record age).
6. **Team trade objective** (`team:teamSteps`, `scoreOf`; owner, 2026-10-02: heroes are equal, no priorities): the
   exact search tries all 24 orders of the four members and keeps the order with the best result, compared in this
   sequence — (a) the **sum** of the members' kits (rank, V, filled slots; `use`), so sacrificing one hero for a bigger
   total gain is allowed; (b) the points of heroes outside the team (the swap must not take them from others needlessly);
   (c) the members' gains sorted ascending, compared lexicographically — at an equal sum the variant whose *smaller* gain
   is larger wins («Б → Caren 15, А → Rin 12» beats «А → Caren 20, Б → Rin 7»); (d) the first order. Pairs inside the
   four then swap worn pieces in several slots at once when nobody is worse and at least one is better by the threshold.
7. **Holes** (`holes:fillHoles`; owner, 2026-10-04): a slot whose worn piece went to a receiver is a hole of the hero it
   was taken from. **Holes are not filled**: a piece taken off a hero stays off until the hero is given a piece through
   the evaluation. The plan only hints what to look for (`breaks` — a set whose half, §2, switched off with the hole;
   `unfilled` — the receiver's slots left empty); the Wiki says so too («Trading gear»).

## §8 Batch plan ("Партия")

`features/batch/plan.ts:planBatch` — one plan for pieces entered as a batch. **No new rules**: every piece goes through
`verdictOf`; a one-piece batch equals the single verdict on the real roster (0 of 69,000 differ; in synthetic worlds
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
3. **Linear points vs balanced stats.** Points are linear per stat: `ATK% 6 + junk` = 6.0 beats `ATK% 2 + CHC 2 + CHD 2` =
   4.9, although the game rewards a balanced set (chain weights against a real final-stat model). This also shapes the
   «Что искать» lines ("the first chain stats by points"); stat combinations are to be checked in the experiment.
