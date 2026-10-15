# Feature history

Reference points for finished features: why each was built, what was built, the owner's decisions, what was hard, what
was left out and why, and the in-game checks. The working folders (`.x/NNNN-slug`, outside git) that held the research,
plans, mockups and reviews were deleted once this record was written (2026-10-14). The rules themselves live in
[MODEL.md](MODEL.md), [DEVELOPMENT.md](DEVELOPMENT.md), the Wiki and Help; where this file and the code disagree, the code
wins.

**Tags in code comments.** A comment like `(HISTORY.md 0200-boss E2b Q3)` points at a section here: the section heading starts
with the folder number (`0200-boss`), the rest is the tag inside it: a stage (A–D, E1–E4, E2b), an owner decision numbered
per stage (Q1…, O1…, D1…, decision 6) or a review finding (A1, C1, E4-5, IG-1, Z7…). Older features (before 2026-10-10)
have no section: their rules were written into MODEL.md and DEVELOPMENT.md when their folders were deleted (`d697479`),
and [GEARPOOL.md](GEARPOOL.md) keeps the history of the "builds assemble themselves" model.

Each section: **Why** · **What we built** · **Owner decisions** · **Hard parts** · **Not built / dropped** (and where the
idea lives now: a kept `.x` folder, or nowhere) · **Checks** (in-game checks done and pending).

| Section | What |
|---|---|
| 0135 | Crit soft cap «Крит: 45%» — CHC above the hero's need stops paying; one number N per hero |
| 0170 / 0171 | Team check «Команда» and suggestions — skill conditions the team leaves unmet, and who to add |
| 0180 | Hero card lines, and the walk→main merge review (0160) |
| 0190 / 0195 / 0197 | Hero stars — transcend ★ per hero, one star element |
| 0198 | Set icon on card rows — the set's icon before the name, as in the game |
| 0199 | Find a piece by code — «Ещё» → «Найти вещь» |
| 0200-boss | A–D — dressing in turn, boss data, boss on «Команда», hero EFF (reviews 0201, 0202) |
| 0200-boss | E1–E4 — turn timeline, team trade, the walk, EFF and SPD goals (review 0203) |
| 0204 | Parked pieces list — «Ещё» → «Припаркованные · N», «Убрать», «Вернуть» |
| 0205 | Hero level per hero — Lv 100 / 120 in the star sheet |
| 0206 | Boss slot and sheet — the boss as a fifth slot behind «VS» |
| 0208 | Singularity guide teams — named pools of hero groups |
| 0220 | Filler — a weak weapon or accessory with a suitable main goes into an empty slot |

## 0135 Crit soft cap «Крит: 45%» — CHC above the hero's need stops paying; one number N per hero
Folders: `.x/0135-stat-targets` (IDEA, RESEARCH, PLAN, DECISIONS 1–15, JOURNAL, START-PROMPT); review `0136` (already deleted by the owner 2026-10-11, probes kept in `.x/0175-tools/crit/`). Merged: `493198b` (2026-10-11, branch `crit`, not published then; commits `cb62832` stage 1, `9ee558d` stage 2, `0d5a922` stage 3, `93cc555`/`1472b15`/`1cbea71` card+sheet redesign, `615a2c5` stage 4 docs, `d9f75ce`..`800f0e9` review fixes F1–F11). Follow-up: hero stars add CHC from transcend (`.x/0190-hero-stars`, `46161c4`/`7f4c9e1`). Code: `src/game/stat/{curve,total}.ts`, `src/features/gear/layout.ts` (`critBinds`, `critBest`, `critLoss`, `pointsIn`), `src/features/gear/pool/info.ts`, `src/features/gear/verdict.ts`, `src/features/gear/store/gearStore.ts` (`crit`, `restoreCrit`), `src/features/trade/model/{kit,world,model}.ts` (`CritGauge`, `KitKey.crit`), `src/features/worn/{WornGear,WornBudget,CritSheet,wearing}.tsx`, `update.py` (`crit_profile`, `main_values`).
Rules live in: MODEL.md §12 (items 1–8), §3/§4/§5/§7 references; DEVELOPMENT.md «Storage» (`ogc.gear.crit`, OGC-GEAR5+), «Where things are» (`game/stat`); Wiki `Equipment`/`Экипировка` («Worn»), `How-verdicts-work`/`Как-считается-вердикт`, `Trading-gear`/`Обмен-вещами`; Help item «**Крит: 45%**» (`t.ui.help…`).

**Why.** Points are linear per stat, so the app kept rewarding CHC after the hero had 100 % (the game clamps CHC at 100 % after gear + passive buffs, before active buffs: `CStatValue_SetFinalValue.cs`). Verdict, batch and trade picked crit-heavy pieces where a plainer piece would serve better. Owner idea (2026-10-11) was «stat targets: EFF first, then CHC and SPD»; the owner then started with CHC (decision 1) because it has flat units, a fixed cap and no content choice.
**What we built.** Stage 1 (effort high): data (`Char.chc {base 5 %, cls, quirk}` read from data — Striker class passive is `BT_STAT_PREMIUM` → buff value 50, not hard-coded; `Dataset.mainValues[slot][grade][label] = [T0..T4]` at +10 for ALL stats so EFF/SPD reuse it), `statTotal`, store `GearStore.crit` (0…100, absent = 100, not a version bump) + backup OGC-GEAR5, card line + `CritSheet`, tip `wornCrit`. Stage 2 (xhigh): `layoutValue` gets `V = points + sets − critLoss`; `bestLayout` exact search with Pareto fronts; «Отложить» in the current layout; quiet-line rule (no CHC suggestion once crit ≥ N − 15); budget row «Лишний крит −x». Stage 3 (xhigh): trade `CritGauge`, `keyOf` subtracts the kit's loss, `critKit` Pareto search under branch and bound. Stage 4 (high): MODEL §12, DEVELOPMENT, Help, Wiki EN/RU. Review F1–F11: trade plan names the extra crit, quick-bound for two crit sets, `holderLoss` clamped, `fillOf` armor with current weapon/accessory, compact sheet in ≤ 430 px windows, dead code dropped, property tests (layout search = enumeration, «Оставь» → held, bestKit = bruteKit on real gauges).
**Owner decisions** (DECISIONS.md was «the source of truth»; tags cited in code: decisions 3, 4, 5, 6, 9, 10, 14, 15 and «owner Q-A»).
- 1 CHC first, EFF later on the same machinery (over-100 % crit wastes other stats).
- 2 One number per hero «crit needed», default 100; hidden sources (gems, talisman, transcend, EE, team buffs) only add, so the app's count is never above the game's and 100 is safe without setup; the player lowers N. Principle: the app simplifies, it is not a second game; the player checks the game and keeps numbers current.
- 3 «Отложить» (keep ≥ held + 1) counts CHC only up to the room left, the piece judged as if it replaced the worn one in its slot (refined by 15). Going over 100 is allowed when the piece is good otherwise.
- 4 Soft border: full weight to N − 15, linear to 0 at N, 0 above (owner: «even 100 is too much — a soft border at 85–90»). Check value 0.80/0.79/0.67/0.51/0.35/0.19 = 3.3 vs 4.8 → CHC 2 + CHD 4 (4.2) beats CHC 6.
- 5 Card line under the chain, percent only (no «из 100 %»), tap → sheet with N and «Сбросить»; amber from N − 15.
- 6 Sheet texts and tip `wornCrit` approved as drafted; shown in «Что нового».
- 7 In-game check passed (one hero app 26 % vs game 30 %: talisman with three gems). Transcend stars (+3/+3/+6 %, Regina +65 % at 5★) → separate ticket `0190`. Enhance: every main stays at +10.
- Q-A (B) The Critical Hit set's CHC rows that carry points go on the curve too (Caren 68 % + Critical Hit ×4 T4: 8.0 linear, 6.5 at N 100, ≈ 0 at N 70); rows covered by a half or of an effect set stay in C₀.
- 9 Budget row «Лишний крит −7,1» (from 0.05; Stats + Sets − crit = heading).
- 10 The number is the hero's crit, not «from gear»: «Крит: 45%», sheet «Герой 20% · вещи 25%»; default N stays 100 for everyone (outerpedia's «CHC up to 50%» notes of Noa/Skadi/Tamara/Valentine not used — owner: leave).
- 11 Tip text `wornCrit`, rev 1. 12 Line only for heroes with CHC in the chain (74 heroes; none has CHD without CHC). 13 Help/Wiki texts.
- 14 Trade plan hero line names the crit when it changes by ≥ 0.05: «Статы станут слабее на 1,4 очк. · Лишний крит −6,3 → −2,3» (stats + sets − crit add up to the gain).
- 15 «Отложить» uses the crit of the **current layout** (best of worn + good pieces), not the worn one, so a piece set aside is always held.
**Hard parts.**
- The plan's formula assumed one CHC weight per layout; real weights differ per piece (a main closing an earlier stat moves CHC up a place). Fixed by laying segments on the curve **heaviest first** (equals the plan's formula with equal weights; one function of the layout; an added segment adds between 0 and its linear points).
- The plan's Pareto dominance (points, nonChc ≥, CHC main ≤) is wrong with different CHC weights (counterexample: 6 segments × 0.2 vs 1 × 1) → dominance also needs the same CHC weight. The trade property test then found two helmets equal in V once crit saturates: the dominating piece must also not lose the ties after V (Legendary, cost, holder loss, roster, age). A CHC main raises C₀ and can lower V, so V is not monotone in pieces (§12.2).
- Speed: `critBinds` (upper bound of crit ≤ knee) keeps the old search byte-for-byte; otherwise Pareto + branch and bound. Worst case (168 pieces, Caren) 1.7 s linear, 0.6 s crit-binding; a «plain first» shortcut was tried and dropped (2.3 s). Typical pool view 2.3 → 4.3 ms (later 2.0 after F11).
- `task dev` showed no crit: it served `docs/` data without `chc`/`mainValues` → `dev:data` builds fresh data; the crit term is off on data without the fields (`critOn`).
- UI went through three rounds (owner: «колхоз» for the loud line → quiet line with icon + mini bar; sheet with the hero's face on the bar); the line's wording moved from «Крит от вещей» (gear) to the hero's crit (10).
**Not built / dropped.**
- EFF and SPD targets: scope of 0135 was CHC only. EFF/SPD later arrived only inside the boss team trade (MODEL §13, `.x/0200-boss` E3/E4); the per-hero card target and «floor rule» for verdict/pool were withdrawn by the owner 2026-10-13 (no target on the hero card — we don't know whom the hero fights). The 0135 research on EFF/SPD mechanics is superseded by 0200-boss (its «17 DoT DPS need EFF» was wrong: Francesca, Vlada, Eris, Eliza, Drakhan have ignore-resist DoTs — rule R). Still open, nowhere else recorded:
  - **EFF cap outside the boss team trade** — the owner's first ask, «stop valuing EFF once it is enough, even when EFF is first in the chain», is not in the verdict, pool, batch, «Надето» or the one-hero trade; it needs a target without a boss. The cheap exact form was the withdrawn floor rule (0200-boss old stage E, Q5); the full form is the «exact EFF cap» (generic capped stat, ≈ 2–2.5 weeks).
  - **SPD as damage scaling** (Snow, Cindy, Stella ×1.5, Pesketh, Tamara dual, Dianne, Ryu Lion, Delta ×2.5, some EEs): SPD gets a goal only for a turn-1 reason (MODEL §13.9); there is no «more SPD pays more» term.
  - **Team buffs lower the CHC need** (Noa, Skadi, Tamara, Valentine +50 %): N is typed by hand; a «Команда»-driven N is not planned.
  - **EFF as a damage stat** (Gnosis Beth's DoT = EFF × rate, Tamamo-no-Mae EE, Nella transcend): rare, not modelled.
- Default N 50 for the four heroes with an active +50 % crit buff — owner: leave at 100. Gems/talisman/EE are not modelled (player lowers N). Trade hole hint «Search: … · CHC» may still name CHC for a capped hero (no crit after the trade at hand).
- Per-piece rules (bar «Порог», reserves, Breakthrough targets) stay linear points on purpose: «is the piece good» is a property of the piece; the cap only decides what is worn.
**Checks.** Done: in-game check stage 1.6 (app ≤ game, gap = talisman/gems); check-data on fresh data 0 of 800 verdicts changed; real roster (59 heroes, 866 cases): N 100 → 0 changes (no hero above 85 %; top Demiurge Stella 80 %), N 70 → 18, N 60 → 41; fuzz 500 layouts / 400 trade worlds 0 bad; `task tour:check` green; screenshots 280/360/420/812×375/420×390, both themes, RU+EN. Pending: none recorded for CHC (owner's screenshots showed Regina capped at 100 % with +85 from 5★ transcend — handled by 0190, until then her N ≈ 35).

## 0170 / 0171 Team check «Команда» and suggestions — skill conditions the team leaves unmet, and who to add
Folders: `.x/0170-team-synergy`, `.x/0171-team-suggest` (`0172-team-review` and `0173-team-boss` stay). Merged: `3b583b0` (data, logic, screen v1; branch `team`), `124f34f` (`team-2`: ✕ and ★ on the spot, sheets), `16d09f8` (`team-fx`: suggestions from outerpedia teams, effect-first report, «α»), all 2026-10-11. Later changes on the same screen are other folders: `0190` stars from the card (`aa6b017`, `a5c944c`), `0200`/`0206` boss, team trade, `0208` singularity teams (`59e98e1`). Code: `update.py` (`build_synergy`, `SYN_*`, `syn_fx`, `build_teams`, `load_guides`), `src/game/synergy/check.ts` (`checkTeam`), `src/game/synergy/suggest.ts` (`suggest`), `src/game/data/types.ts` (`Synergy`, `SynNeed.fx`, `GuideTeams`), `src/screens/team/TeamScreen.tsx`, `src/features/team/ui/*` (`TeamSlots`, `TeamReport`, `TeamPicker`), `src/features/roster/HeroPicker.tsx`, `src/styles/team.css`, `scripts/check-data.mjs` (synergy and teams blocks). Fixtures: `test/fixtures/synergy.json`, `teams.json` (outerpedia `93a5234`), `test/game/synergy.golden.json`.
Rules live in: update.py comments over `build_synergy` / `SYN_*`, check.ts header, DEVELOPMENT.md («Команда» rows, `synergy/check`), Wiki `Team-check` / `Проверка-команды`, Help `t.ui.helpTeam…`.

**Why.** Veronica's S1 Dual Attack works only while her Defense is increased, and her own DEF Up comes from S3 with cooldown 4 — alone she cannot use S1 at battle start. Owner wanted the app to say which skill conditions a team leaves unmet and who from the roster fixes it; later (0171) «add a hero and the app recommends whom».
**What we built.**
- Stage 1 data: `build_synergy` reads outerpedia raw tables (`skills`, `transcend`, `damage/buffs`, `damage/characters`; +~16 MB per nightly run, nothing shipped) into `Dataset.synergy` (~12 KB): per hero `need` (status on self / on enemy, slots, ★, `cd` = startCool of the earliest S1–S3 slot, `fx` = what the condition switches on) and `give` (to self/team/ally/enemy, slot, ★, cd). Result: 23 heroes with a need, 27 needs, 13 statuses.
- Stage 2 logic `checkTeam`: needs active only at the hero's ★; verdict `ok` (an ally gives it, or her own steady source with `cd ≤ need.cd`) / `self` (only her own, later than needed, or only a burst — ⚠ with the cooldown number) / `none`; `fix` = team heroes with too-low ★ first, then roster heroes (any ★ first, earliest source), «с ★N».
- Stage 3 mockup (owner approved 2026-10-11), `MOCKUP.md`: one row of four slots (not the trade diamond — split screen is short), report only heroes with something to say, quiet ✓ line from an ally, none for her own source in time, ⚠ block with «Дадут:» heroes (6 shown, «ещё N»), the «what is not checked» note in Help not on screen, transcend stars like the game's (six gold stars, tap the N-th; owner «сделай покрасивее»). Phone: «Команда» in «Ещё»; wide window: third header tab, landscape slots left / report right. Pictures were made by injecting the markup into the real preview build (`mockup/shoot.mjs`).
- Stage 4–5 screen, tour tip `team` (news), Help, Wiki; then `team-2` (owner: ✕ on the spot removes, ★ at its foot opens a stars sheet, portrait opens the hero sheet, another hero keeps the spot's ★).
- 0171 `suggest`: score = shared outerpedia teams with the team heroes (different slots; the same slot is an alternative) + `FIX_NONE` 3 / `FIX_SELF` 1.5 per team skill the candidate starts; empty team — number of outerpedia teams the hero is in; hero sheet «Подойдут команде» above the plain list; report lines start with the effect («S1: двойная атака — Повышение защиты даёт Kappa»); «α» mark (header, «Ещё», line on screen, Help, Wiki); tip `teamPick`.
**Owner decisions** (DECISIONS.md; code cites «HISTORY.md 0170 decision 6», «Q2»).
- 1: a separate «Команда» screen, 4 heroes picked by hand; focus-team integration later. 2: self-only coverage → ⚠ «only from herself» plus heroes that would give it.
- 3 (superseded by 0190, 2026-10-12): ★ was picked on the screen, default ★6, not remembered; now a spot starts at the card's ★, may try higher, never lower, saves nothing. 4: fixes only from the existing roster, never «if you had Stella». 5 (superseded by 0200: the team is now kept in `ogc.boss`): nothing saved in the MVP.
- 6 (owner's in-game check 2026-10-09): at battle start Veronica (Defender) has NO Increased Defense status → class passives are not a status; only real status applications (rows with a tooltip id) are providers.
- PM decisions, owner may override: Q1 transcend-passive «+N% ally DEF» (`BT_STAT_PREMIUM`, no tooltip) not a provider (follows 6; UNVERIFIED, see Checks). Q2 chain/dual finisher gives are not providers (owner: «A норм»). Q3 own cd-0 source (S1) → quiet ok; ⚠ only when her own source has a cooldown. Q4 enemy-debuff needs (Bleeding, Shocked…) in v1 as «the team applies it»; enemy buffs (Fenrir: Barrier) → v2. Q5 single-target ally gives (Tio, Skadi, Ritri) count. Q6 Russian status names drafted by the PM (13 in `team.status`, markers `statuses:begin/end` for `check-data`), owner reviews.
- 2026-10-11 (0171): outerpedia's recommended teams first, skill statuses an extra reason (owner: «лучше взять Outerpedia»); effect-first report lines (names approved); feature marked alpha. Owner on the result: «я ожидал большего… хотелось бы видеть, что именно начнёт работать у персонажа» — the motive for `fx` and the review 0172.
**Data sources** (the map the extractor rests on): outerpedia `data/generated/damage/buffs.json` (buff rows: `type`, `stat`, `buffDebuffType`, `conditionType` / `conditionValue`, `tooltipId`, `createRate`; `conditionValue` 9996–9999 = any buff / any debuff), `damage/characters.json` (`skills[id].levels[].buffIds`), `skills.json` (type, startCool, outerpedia's `label`), `transcend.json`, `glossaries.json` (`effects`, `effectByTooltip`, `effectByKey`). OWNER = the holder, CASTER = the skill user, TARGET = the one hit — by name only: the decompiled client has no condition evaluator. outerpedia's own team planner lists gives only and checks no conditions.
**Hard parts.**
- SOURCES/PLAN numbers were wrong: 22 Defense Up providers (really 14: 9 are transcend-passive `BT_STAT_PREMIUM` without a status) and 34 heroes / 58 needs / 21 statuses (really 23 / 27 / 13). Stage 1 therefore stopped for a hand check of every need against the skill text (22 heroes, all ✓, plus a false-negative scan: 20 hits, all excluded on purpose).
- Extraction rules found on the data (each is a code comment now): `buffDebuffType` also `DEBUFF_IGNORE_RESIST/_IMMUNE` (the plan's BUFF/DEBUFF filter lost Francesca's and Eliza's Bleeding); rows without a tooltip count only when outerpedia's `skills.json` labels them (`SYS_BUFF_*`) — unlabelled `BT_STAT` rows are in-skill tweaks («+30% PEN while attacking») and made 30 fake Penetration gives; events (on death, when hit, chain) are not gives; a passive that fires on skill use maps to the skills it names (`callerSkillType`, Epsilon CF `SKT_ALL`), a per-turn one stays «passive»; `CASTER_ENEMY_TEAM_HAS_BUFF` is enemy side; a has/has-not twin is a branch only with the same effect type (the plan's «drop on any twin» lost Luna's Additional Attack); a need nobody else can give is dropped (hero mechanics: Beth's Dominion, Ame's Mandala, Luna's Polar Night… 17 ids ≥ 2000000 plus Notia 51, Astei 53, Ame 55/56, Vlada 62, Kuro 64, Viella 103, Iota 104); burst_1..3 merge into one slot at the lowest ★; chance (`createRate < 1000`) is ignored.
- ★ gating: `unique_passive` level L → first transcend step with `skillLevel ≥ L` → `showStar` (L1 ★3, L2 ★4, L3 ★5, L4 ★6 for all byStar tables and the 11 overrides); `burst_2` ★3, `burst_3` ★5; fusion passives ★1. `effectByTooltip` aliases (66→64) hit only Kuro, dropped anyway.
- Condition semantics are inferred from names (OWNER = holder, CASTER = user, TARGET = hit); the client code has no evaluator, so every one rests on skill text or in-game checks. 9996–9999 are «any buff / any debuff» sentinels (443 rows), not statuses.
- 0171 prototypes (`proto.mts` → `proto2.mts`, both call the real `checkTeam` on the owner's roster): `proto` ranked by what a candidate fixes (+2 none→ok, +1 self→ok, ±0.5 for her own needs) with a reason line — reasons were too technical and status-only; the owner chose outerpedia teams, so `proto2` counts teams where candidate and team hero are in different slots, plus fixes ×3 / ×1.5 (the shipped weights). Results, ★6 roster: empty team — 69 fit, Monad Eva in 49 teams, Viella 27; Veronica — 44 fit, Laplace / Poolside Trickster Regina / Tamara ×8 each; Kanon+Fatal+Aer — 53, Liselotte, Bryn and Kappa also make Kanon's S1 Priority work; Sigma — 27, Roxie makes Sigma's S1 stun work (score 2.5). Guide data: 85 distinct teams of 2–4 slots (from 68 `teams.json`, de-duplicated across guild-raid seasons).
**Not built / dropped.**
- Ally-side needs (`OWNER_HAS_BUFF` on `MY_TEAM`/`TURN_OWNER`: Nadja, Veronica CF), enemy buffs (Fenrir/Epsilon «target has a Barrier»), gives under their own condition (element-gated ATK/PEN: Delta, Saeran, Valentine, Fortuna, Iota; boss-only: Francesca, Notia CF; Bell Cranel's branches), exclusive-equipment effects, chances, combat events, chain/dual-backup gives, turn order — v2 candidates, nowhere.
- Saved teams / «which builds play well together» — owner's later idea; the team is kept today by 0200 (not as builds-together).
- Role balance in suggestions (a team of four DPS with no healer): open question in `0171/IDEA.md`; boss-driven hints (remove buffs, no debuffs, counterattack: `BT_REMOVE_BUFF` 21 heroes, `BT_STEAL_BUFF` 6, `BT_REMOVE_DEBUFF` 18, `BT_IMMUNE` 9, counter 12) — `.x/0173-team-boss`. Review of the screen — `.x/0172-team-review` (prompt only, never run).
- Focus-team integration (decision 1) — `.x/0150-focus` (deferred).
**Checks.**
- Done: owner's in-game check 2026-10-09 (class passive gives no Increased Defense at start, decision 6); 22 heroes' needs read against English skill text (Veronica + CF, Epsilon CF, Lisha + CF, Bleu, Bryn, Luna, Kanon, Aer, Fatal, Beth, Francesca, Eliza + CF, Fortuna, Iris, Parti, Philia, Sigma, Dahlia, Snow CF, Viella): all match; Stella ★6 Barrier, Ame ★5 ATK, Iris ★5 burst, Eliza CF ★5 gating confirmed on data.
- PENDING 1 (owner, 2026-10-11) — Anarky is not in the owner's roster. When she appears: Anarky casts S2 (label-only DEF Up row, rule 2) — does Veronica's S1 Dual Attack then trigger? If not, label-only rows (Anarky DEF, Ame ATK ★5, Rin / Rin CF ATK and CRIT DMG) stop being providers. Until then they count (skill text).
- PENDING 2 — Q1: does a transcend passive «+N% ally DEF» (`BT_STAT_PREMIUM`; Rhona, Stella, Epsilon + CF, Kanon, Caren, Ais, Delta, Viella, Skadi) satisfy `OWNER_HAS_BUFF 6`? Check with ★5/6 Stella + Veronica. Not counted today.
- PENDING 3 — Russian status names and slot labels (S1/S2/S3/Burst) against the Russian client: not recorded as reviewed.

## 0180 Hero card lines, and the walk→main merge review (0160)
Folders: `.x/0180-card` (+ `.x/0160-merge-review`, source of its findings). Merged: straight on `main` (owner: «можно сразу в main»), pushed 2026-10-10: `dc9fd9f` set header lines, `928bb0f` set value on «Что искать», `d4f1491` T4 line, `2e3e07c` budget, `3fdc1bc` tips + DEVELOPMENT. The review's own fixes landed on `walk` (e.g. `bed2e7f`, `810e181`, `cabe478`, `b9fafa5` MODEL.md, `9cf1038` DEVELOPMENT) and `walk` merged as `699d1eb` (2026-10-10). Code: `src/features/worn/wearing.ts` (`seekOf`/`seekGain`, `t4Of`, `WornView.passive`), `WornSets.tsx` (+ `setBlocksOf` in `features/gear/ui/pieceText.tsx`), `WornBudget.tsx`, `WornGear.tour.ts`; tests `test/worn/wearing.test.ts`, `wornSets.test.ts`, `wornTab.dom.test.ts`.
Rules live in: DEVELOPMENT.md «Where things are» (`features/worn` row), Wiki `Equipment` / `Экипировка` (Worn: points, budget, set lines, T4 line, «What to look for»), Help (`t.ui.help` Worn + «Pool and "Re-dress"»), tips `wornTab` rev 3 and `wornBudget` (both `news: true`); the review's rules in MODEL.md (§8, §10 tags Q1–Q7).

**Why.** The merge review of `walk` (75 commits, 246 files, no blocker; 41,200 piece/chain pairs re-computed independently) also asked what the hero card still does not tell: which set to chase, what a set is worth, what T4 would add. Owner picked the cheap lines; on the owner roster the Pool tab repeated Worn for 56 of 59 heroes and «Что искать» showed for 16 heroes, sets only, no value.
**What we built.** All on the Worn tab, no new math (`layoutValue` / `setValue` / `gearRank` reused), numbers in the Worn heading's points («Points stay», no percent):
- **Set header lines** (idea 4, `dc9fd9f`): «Life ×4 · +23,3» with rows under it («Health +30% · Health +20%»); before, the points sat on the last row and read as if the 4P row alone were worth them. A one-row set stays on one line (Q5 b: 40 of 46 set blocks on the roster have one row). «T4» in the head when every row is T4; a set worth 0 prints no number.
- **Set value on «Что искать»** (idea 1): each row ends with the set's net gain = set part of V with the needed slots carrying the row's sets (worn pieces cloned into the set, an empty slot gets a bare stub) minus today's. Rows with gain < 0.05 vanish (6 of 27 were ≤ 0: Heatwave Cop Delta −7.0, Primine −9.3, Gnosis Viella −11.7 — they would lose a set already worn; block and title vanish with no rows). Order: closest first, then bigger gain.
- **T4 line** (idea 3): faint, two lines, not tappable: «Speed ×2 на T4 · Speed +13%  +6,7» / «нужен T4 у шлема и брони». Per set, the smallest group of worn pieces not yet T4 that reaches the set's full-T4 value; only when the gain ≥ 1 point (THRESHOLD); `bt = null` counts as not T4; not on the shared view-only card or for a hero without builds. Later the gain was made crit-aware (`P.critOn` → V difference, MODEL §12).
- **Budget** (idea 5): the Worn heading is a button (▾, collapsed on every visit, `aria-expanded`, 40 px `.hit`) opening into Stats (heading − Sets, in tenths, so the panel adds up; a chip per worn slot) · Sets · Passive (weapon/accessory as a rank word, no points). Plain heading on the shared card, an empty tab, a hero without builds. Anchor `wbudget`.
**Owner decisions.** 2026-10-10 after `TEXTS.md` §8 (all recommendations taken):
- Scope: features 4, 1, 2, 5. Q2 (b) Stats = heading − Sets (rounded parts differ by 0.1: Primine 11,95 + 18,67 → 12 + 18,7 vs heading 30,6). Q3 existing words «рекомендовано / временно / нет в билдах» (no new rank vocabulary). Q4 T4 line in two lines. Q5 (b) one-row set on one line. Q7 both tips in «Что нового». Q8 a pinned hero's row stays at gain ≤ 0, without a number (pin = intent).
- Standing rules: points, never percent; never print «+N» for a weak piece; stats in chain order, never sorted by value; collapsed by default, silent when unclear; new texts shown to the owner (RU+EN) before commit.
**Merge review (0160) — owner decisions on its findings** (each is in MODEL.md §10 / Help / Wiki; fixes done on `walk` before the merge):
- Q1 (A4): Epic armor stopgaps keep getting Breakthrough feed (T4 counts toward the set bonus); only the «не вкладывай» text goes, for armor; weapons/accessories keep «no Breakthrough» (`001c5c2`).
- Q2: leave the batch re-plan as is — bounded (one round per entry); the rare «Надень» → «Разобрать» (0 on the roster) is a known limitation (MODEL §8).
- Q3: `ui.modelNoteMarks` sentence in the upgrade notice only when the old v2 store had marks / «Не отдавать надетое» / pins.
- Q4: batch rows drop constants (grade chip, set, «T0–T3»; «T» only for T4), kind once in the title («Партия · 20 · Epic Speed»), armor by slot word, weapon/accessory caption «Steel Sword · ATK%» (`EPIC_NAME`), grade colour on every piece name.
- Q5: ideas 1, 2, 3 of the card (idea 2 later dropped). Q6: batch plan row shows «−4,9 очк., пассивка лучше» when a recommended Legendary wins by rank but loses points. Q7 (b): a Legendary not worse in points than the worn Epic of its slot gets «Надень» (bigger main breaks the tie).
- Also fixed from the review: A1 set-aside BT target named right, A2 unlock before dismantle, A3 Help = walk, A5 cheap fixes (whole-word `withHero`, RU plural, `≥ 6` via `milli()`, stale «SPD вытягивает»), A6 `MODEL.md` rebuilt from code (62 dangling refs to the lost FORMULA.md), A7 DEVELOPMENT.md, B1–B14 UX (40 px targets, wrapping names, walk titles, nbsp, light-theme element colours in `base.css`).
**Hard parts.** The review's weakest-slot test (48 heroes with 2+ worn pieces): the named slot is stable under six definition changes with a ≥ 1 pt lead for only 17 of 48 (19 flip, 4 tie), and the size of the gain swings 2–7× (Aer's weapon +4.0 vs an ideal piece, +0.6 vs best of 10 drops) — hence no «+N» ever. Set value dominates: completing a set is 7.7–16.7 pts vs 0.1–5.8 for a best-of-10 slot swap. The anchor `bgear` was taken by the tip `gear` → own anchor `wbudget`. Roster-level facts: only 19 of 263 worn pieces reach the 6-pt bar; 21 of 59 heroes gain from T4 on worn armor (3 gain ≥ 5: Valentine, Kuro, Monad Iota — Speed 2P exists only at T4), median 1.3; smallest real seek gain +1.3.
**Not built / dropped.**
- **Idea 3 of the plan — weakest worn piece / empty-slot «Искать:» line** (owner's own idea): dropped by the owner 2026-10-10 as «expensive and unstable»; plan steps 0 (move search key `keyOfHole`/`keyText` from `features/trade` to `features/gear`, layer order), 5, 6 and Q1/Q6 went with it. Design if revived — **rule G**: slot wins at 2, 3 and 4 target segments, leads the runner-up by ≥ 1 pt at 3, gains ≥ 1 pt at 2, its piece holds ≤ half of the 3-segment target; fires for 17 of 48 heroes (42 of 59 get a line with the 30 heroes who have 91 empty slots). Details were: ask the first chain stats by points (Maxwell «Ботинки 3,0 очк. → ATK% › CHC › CHD»), name items for a weak weapon/accessory, open Q1 = which set to name on an empty armor slot (rec.: the set of the best «Что искать» row needing that slot). Lives nowhere after deletion (prototype `card/weak.test.ts`, `weakest.md`).
- Review idea list not chosen: piece sheet «how points add up» (`pointsBreakdown`, unused by UI), points under each of two chains (5 heroes), recommended item for non-rec weapon (duplicates Builds), fold Pool into Worn (56 of 59 identical), «SPD can't roll here» note. Discarded by rule: Reforge candidate (pool-is-truth), «done» badge, distance to CHC 100 % (needs stat model; later `0135`), «take X's piece from Y» (Trade).
- Deferred to the stat-model experiment (`.x/0130-stat-model`): linear points vs balanced stats (ATK% 6 + junk = 6.0 beats ATK% 2 + CHC 2 + CHD 2 = 4.9), passive vs substats, main-stat value.
- Review findings left as known limitations (D list): MI-1 two chains judged by the first (documented, 0 of 3,000 affected), I-2 re-plan, v2→v3 upgrade drops marks/pins silently except for the notice, item-code typo detection weaker than claimed (1 in 44 second-form typos accepted), «Вернуть» re-adds at the pool's end, plan speed 60 Legendary ≈ 0.5–1.4 s on a phone, `seal`/`unseal` quadratic.
**Checks.** Done: implementation checked against prototypes on the owner roster (27 seek rows, 21 shown with identical gains, 6 hidden; T4 lines same gains and pieces; oracle `impl/oracle.test.ts`); `task tour:check` sizes/themes. Pending / never done (review «Not checked»): the game's Dismantle-list order and whether it equals the inventory list (B10, why walk `#n` is dropped after a Breakthrough), the Breakthrough material list, the hero slot list, the «P» mark and how a locked piece looks, a non-English client, real Android WebView/fonts, the real 800–900-piece backlog (all batches synthetic).

## 0190 / 0195 / 0197 Hero stars — transcend ★ per hero, one star element
Folders: `.x/0190-hero-stars`, `.x/0195-hero-stars-review`, `.x/0197-stars-roster`. Merged: `8c146f9` (2026-10-12, branch `stars`), then `12aaf75` + `eddcdfe` (0197, merged `7e61c08`, 2026-10-12). Code: `src/game/hero/{Stars.tsx,star.ts}`, `src/game/stat/total.ts` (`ownStat`, `trans`), `src/game/context.ts` (`Ctx.stars`), `src/features/gear/model/{gear,fusion}.ts` (`stars`, `setStars`, `starsTo`), `src/features/gear/store/gearStore.ts` (`restoreStars`), `src/features/roster/{backup,useRosterUi,CharTile}`, `src/screens/chars/{CharDetail,CharHead}.tsx`, `src/screens/team/TeamScreen.tsx`, `update.py` (`trans_steps`, `trans_level`, `unique_passive`, `crit_profile`).
Rules live in: MODEL.md §12 items 1–3, 8; DEVELOPMENT.md Storage («`stars` (hero → transcend ★ 1…6…»), `heroCode` note, `game/hero` rows; Wiki `Characters-and-guild-code`, `Equipment`, `Team-check` (EN/RU); Help `t.ui.helpChars` («★★★★★☆ by the name»), `t.ui.helpTeamItems`; tour tip `heroStars` (rev 1, `news`).

**Why.** The app assumed every hero was ★3, the owner's are ★4…6. Transcend gives some heroes crit (Poolside Trickster Regina +65 % from ★5: the card said 50 %, the game 100 %); the owner lowered N by hand. Ticket «right after the 0135 crit stages».
**What we built.** (stages 1–5 in one branch; the one star element came after)
- Data: `Char.chc.trans` = CHC ‰ by in-game ★1…6 from `progression.json skill8` (rows `critical_rate`/`add`, ME and MY_TEAM both land on the bearer's sheet; passive, so before the 100 % clamp). Level at a star = `skillLevel` of the plain step (`starPlus 0`) of `overrides[id] ?? byStar[rarity]`: ★3→L1, ★4→L2, ★5→L3, ★6→L4. Exactly 15 heroes have it: `[0,0,0,30,30,60]` Lisha, CF Lisha, Philia, Bleu, Maxwell, Laplace, Ame, Regina (mage), Bryn, Roxie, Lambda, Titia; `[0,0,0,60,60,60]` Demiurge Astei, Demiurge Luna; `[0,0,0,0,650,650]` Poolside Regina 2000085. `check-data`: 6 ints 0…1000 non-decreasing, ≥ 10 heroes, one ≥ 500 at ★5.
- Store `ogc.gear.stars` hero → ★1…6 (like `crit`: drop/undo, restore drops bad values, read «not whole»); backup `OGC-GEAR6` (flag + 3 bits after the N field; GEAR5 literal pinned in tests).
- Evaluation: `Ctx.stars` (a fact about the hero → ctx; N is a wish → profile). `ownStat` adds `trans` to C0 → the one funnel `ownChc` serves verdict, pool, batch, trade, «Крит: N%», crit sheet. Proved equal to lowering N by 65: shift-property test (400 random worlds), real-roster probe identical for ★4/5/6 (59 heroes, 866 stamps, 266 stored lists).
- UI: six stars (gold up to ★N) next to the name → star sheet (tap = saved, closes); crit sheet split «Герой · звёзды · вещи»; Team spot takes the card's ★.
- 0197: one star element. Tile: grey ☆ = button (adds at the minimum ★), gold ★ = badge only, a tap is a tap on the tile, no count. Card: the stars replace the old roster ★ at the name (not in roster: one grey ☆). Star sheet: pick (not below minimum) + «Убрать из ростера» (existing remove flow: hero with data → `RosterRemoveAsk` with the unlock reminder, without → at once; read-only card shows only the remove button). Leaving the roster is possible only here (rare, dangerous: 2–3 taps on purpose). Anchor `hstars` moved to the name; tip text got removal (no rev bump, unpublished).
**Owner decisions.** (Z-tags cited in code: Z7, Z8, Z5)
- Z1: store ★1…6 only; 4+/5+/5++ change only HP/ATK/DEF rates, which the app does not use. Z2: card header, not tiles / portrait strip. Z3→dropped: star sheet shows only the pick, never what stars give (the game offers different upgrades per star; crit is just the first we count).
- Z4→replaced (`576a16e`): a hero starts at base rarity ★1–★3, never fewer; not set = the minimum (card, Team, crit); the «not set» state is gone.
- Z5 (revised twice): first Team wrote stars; owner then: stars change only on the card; a Team spot starts at the card's ★, locks below it, a higher ★ is a «what if» for that spot, never saved (also kills the pruning problem of departed heroes, review B3).
- Z6: stars' CHC joins C0 everywhere; N keeps its meaning. Z7: Core Fusion moves stars X → CF with the pieces (owner: «CF переносит звёзды обычного героя»); final rule (review B4, `924a997`): moves everything (stars, N, eff, lv), lifts the pin, X keeps nothing; both holding values (old data only): CF's own wins.
- Z8: the shared hero card (OGH) carries no stars and no N: `ShareCard` uses `NO_STARS`, a friend sees Regina «Крит: 50 %» (accepted, DEVELOPMENT note, no wiki line). Z9: tip `heroStars` rev 1 in «Что нового». Z10: no EFF/SPD from stars here (came later in 0200), no talisman/gems crit.
- Review 0195: B2 a hero out of the roster has no data (pin, N, ★ cleared with the star, «Вернуть» restores; `normalizeStored` drops them, unknown id keeps all, X replaced by CF keeps pin/N). B5 no «unset» control (set the real number). B7 «Подойдут команде» = with the stars you have, the report's «Дадут:» still says «с ★6». Dark-theme faint unset pill: left.
- 0197: roster removal only through the card's star sheet; no star count on tiles.
**Hard parts.**
- Research draft said «+3 % more at 5★» — wrong: 3 % stays at 5★, 6 % at ★6; only Poolside Regina jumps (65 at ★5). Owner screenshots (Regina 5★ 100 %, Dahlia 47.3 %) and Ame 6★ 46 % = 15+25+6 verified the model.
- Review found 2 real bugs (fixed `de9fda5`): «Вернуть» after a batch roster edit did not give X its stars when X had no pieces; evaluating a piece «для Core Fusion X» counted CF without X's moved stars (`viewOf`). Hook-level test needed — a DOM label check cannot see it.
- `starsTo` plus `FusionFix.stars`/`Switch.stars`: undo moves stars back only if CF still holds that value and X has none.
- Pill at 280 px: a « · » after the stars dangled when the meta line wrapped → dropped (`f72dbab`); 0197 put stars in the h2's line (h2 inline, the star outside the heading so a screen reader hears only the name).
- Test churn: every «newer code» literal moved GEAR6 → GEAR7 etc.; 38 test files call `makeCtx`, hence default `NO_STARS`.
**Not built / dropped.** Stars on tiles / portrait strip (owner: not needed «пока»; nowhere). Star row inside crit sheet (second edit place; nowhere). «Not set» control (B5; nowhere). Crit line in star sheet (T3, dropped). Talisman+gems crit (owner: «later», 30 % in game vs 26 % in app; nowhere). MY_TEAM crit for allies (team-context topic of 0200). 4+/5+/5++ (nowhere). EFF/SPD from stars: done later in 0200 (`Char.eff.t`, `spdUp`).
**Checks.** Done: `task test` (2353 at merge), `task tour:check`, `check-data` fresh data 0 of 800 verdicts changed, shots 280/360/420/812×375 light+dark, RU+EN (Team at 812×375 not shot); real roster: Regina card 50 → 115, worn V 28.05 → 22.05; ★4 changes nothing. Pending: whether Core Fusion X really keeps the original's stars in the game — not in the data, owner's statement only. Probe `.x/0175-tools/crit/stars-realcmp.test.ts` (other folder).

## 0198 Set icon on card rows — the set's icon before the name, as in the game
Folders: `.x/0198-set-icon` (only shots + `shots.mjs`, no md). Merged: straight on main, `c5fd640` (2026-10-12; `527d30e` before the rebase). Later: `c17743c` (names in the grade's colour, the «L»/«E» chip dropped; the icon now carries `gname legend|epic`). Code: `src/features/gear/ui/pieceText.tsx` (`PieceName`), `src/styles/chars.css` (`.pset`), `SetIcon` in `src/game/icons/Img`.
Rules live in: code comment in `PieceName` (icon not in batch rows, owner 2026-10-12); Wiki `Equipment` / `Экипировка` «Worn» (one line "Armor shows the set icon before its name, as in the game"). Not in MODEL.md (display only), not in Help, not in DEVELOPMENT.md «Shared elements».

**Why.** Owner 2026-10-12: to match a piece on the card with the game's list it is easier by the set icon next to the name (the game shows it there).
**What we built.**
- One change in the shared `PieceName`: `SetIcon` (game art or own Tabler icon, the own/game toggle applies) before the name, only when `p.setId` and the set is in the index — so armor only; weapon/accessory show their item name instead.
- Every place that prints a piece through `PieceName` got it at once: Worn, Pool, Redress rows, trade plan, the piece sheet (and later «Найти вещь», which reuses `PieceName` in `.piece-n`).
- CSS: `.bgear-row .bgear-n .pset, .piece-n .pset` — 18x18, `box-sizing: border-box`, `flex: none` (the game icon is a dark disc, the own one an outline in a frame; reads in both themes). Same 18 px as the old grade chip it sat next to.
- Shots at 280x640, 360x780, 420x390, 812x375, both themes, EN (Poolside Trickster Regina, owner's roster).
**Owner decisions.** No tags cited in code. Only: icon by the name, not in batch rows (batch names the set in its title; `batch` flag of `PieceName`).
**Hard parts.** Nothing notable: the icon is scoped by CSS to the two containers, so a `PieceName` used inside another container (`.bgear-row` / `.piece-n` only) would show the icon unsized.
**Not built / dropped.** Icon in batch rows (set already named in the title); icon for weapon/accessory (no set — item name is the cue). Nowhere else recorded.
**Checks.** Shots at four sizes x two themes exist; no result notes were kept. No in-game checks needed. Commit says Tour: not needed (visual mark).

## 0199 Find a piece by code — «Ещё» → «Найти вещь»
Folders: `.x/0199-find-piece` (only `probe.test.ts`, `rhona.test.ts`, `vitest.config.ts`, `shots.mjs`, shots). Merged: straight on main, `3dafe41` (2026-10-12, pushed; site build `6a425ea`). Code: `src/features/gear/find.ts` (`holdersOf`), `src/screens/find/FindPiece.tsx`, `CodeInput` props `action`/`hint` in `src/features/eval/code/ItemCode.tsx`, `onFind` in `src/app/shell/More.tsx` + `findOpen` sheet in `src/app/App.tsx`.
Rules live in: code header comments of `find.ts` / `FindPiece.tsx`; Wiki `Characters-and-guild-code` («Whose piece is it?») / RU pair, `Getting-started` «Ещё» list; Help `helpCodeText` (last sentence) + `t.ui.findHint`; DEVELOPMENT.md «screens/» row (`find/`). Tour: `src/tour/coverage.ts` 'helper'. Not in MODEL.md.

**Why.** Owner 2026-10-12: a player with a piece code (chat, card) wants to know which hero wears it or has it set aside, without scrolling pools.
**What we built.**
- Sheet: the same code field as «Ввести код» (reused `CodeInput`, own button «Найти» and hint), result = the piece in full (`PieceName` + `subsText`), «Надета:» / «Отложена для:» with hero names that open the hero's card (the sheet closes), or «Никто не… надета или отложена».
- `holdersOf(store, input)`: every pool is searched; "same piece" = `samePiece` of the verdict's look-alike check (slot, grade, set or item, main, substats at the same levels **in the same order**; Breakthrough not compared because a chat code has none). A record shared by two heroes lists both; worn vs set-aside decided per hero (`st.worn[hero]`).
- `More`: item hidden during a tutorial (`tour.run`). `verdict.ts`: only `samePiece` exported (1-line change).
- Tests: `test/gear/find.test.ts` (worn / shared / another grade or order / nobody), `test/app/more.dom.test.ts` (menu item, sheet).
**Owner decisions.** "Only a search — the verdict and the batch don't change" (owner choice): the verdict still does not say "you already have this piece worn by X" except through the existing «Выглядит как…» set-aside check; the new sheet is the separate place to ask. No tags cited in code beyond the date.
**Hard parts.** `rhona.test.ts` (probably the trigger) was a one-off run of the owner's code `OGC BGFT CPQ` against the real roster (`.x/0175-tools/real`) to explain a verdict for Rhona (kind, per-hero points, Rhona's pool/worn) (outcome not recorded). The verdict stays untouched by the owner's choice; the search is a separate tool. Same-order matching means a piece re-entered with substats in another order is "another piece" (same as the verdict's check; deliberate).
**Not built / dropped.** Changing the verdict to mention holders (owner: no); a search by stats instead of code (not asked); matching ignoring order (kept consistent with `samePiece`). Nowhere else recorded.
**Checks.** Shots (found, none, More menu) at four sizes, both themes. `probe.test.ts`: a throw-away that `decodeItem`'d `OGC GWWS DSWS` and `encodeItem`'d a gloves/unique/set 13 piece (SPD2, DMG UP%3, CHD2, CHC2) to get a test code for the shots. Verdict: redundant, no need to promote — `test/eval/itemCode.test.ts` already covers encode/decode of every item from the data, prefix/case/spaces, typo detection, fixed vectors (`PEDJ XTA`, `WMZY APH`) and Breakthrough-not-in-code; `test/gear/find.test.ts` covers the lookup. `rhona.test.ts` depends on `.x/0175-tools/real` and the owner's data, so it must not be promoted either. No in-game checks pending.

## 0200-boss A–D — dressing in turn, boss data, boss on «Команда», hero EFF (reviews 0201, 0202)
Folders: `.x/0200-boss` (IDEA, RESEARCH, PLAN, START-PROMPT-A..D, `data/`, `mock/`, `shots-A/C/D`), reviews `.x/0201-boss-review-ab`,
`.x/0202-boss-review-cd`. Merged (all 2026-10-12, not published then): A `9bdb75f` · B `18e9a51` · review A+B
`8e46cba` · C `8c2e366` · D + review C+D `49687e9`. Code: `features/trade/model/{turn,chunks}.ts`, `update.py` (`build_bosses`,
`eff_profile`, `needs_eff`, `main_values`), `game/data/types.ts` (`Bosses`, `Char.eff`), `features/boss/`, `game/stat/eff.ts`,
`features/worn/{EffSheet.tsx,wearing.ts}`, `GearStore.eff`, `scripts/check-data.mjs`.
Rules live in: MODEL.md §7 items 2 and 8 (dressing in turn, others' spare), DEVELOPMENT.md «Where things are» (`features/boss`,
`features/worn`) and «Storage» (`ogc.boss`, `GearStore.eff`, OGC-GEAR7+), header comments of `game/stat/eff.ts` and
`features/boss/model/boss.ts`, `update.py` docstrings (rule R, main values); Wiki `Trading-gear`, `Team-check`, `Equipment`
(+ RU pairs); Help `t.ui.help` items «Эфф», boss / team items.
Later stages E1–E4, E2b, review 0203, 0206 boss slot, 0208 singularity teams — see the next section(s).

**Why.** Owner 2026-10-11: (1) debuffers should beat the boss's RES with EFF; (2) a boss section: boss → outerpedia's team →
gear from the whole inventory; (3) after «Сделал» in «Обмен вещами» it was unclear whom to re-dress next ("balancing").

**What we built.**
- Research (2026-10-12, 7 Sonnet agents, outerpedia dc83b4a = 93a5234 for boss data): RESEARCH §1 game facts from the
  decompiled client 1.4.18 — §1.1 resist roll (`CheckResist`): EFF > RES (strict) never resisted, else P(resist) ≈ d/(d+100),
  d = RES − EFF, never 100 %; §1.2 EFF = ⌊(⌊W·(1000+itemRate)/1000⌋ + itemVal + buffVal)·(1000+buffRate)/1000⌋, no cap
  (`CalcFinalStat`): W = white by subclass + level, item rate (EFF% 2.5 %/segment, Effectiveness set) multiplies **W only**,
  flats = every glove's EFF main + accessory EFF main, Ranger class node +50 flat, premium = EE / transcend skill 8 / CF Notia
  passive; §1.3 boss RES = min + ⌊(max−min)(L−1)/99⌋, then the Challenge quirk −20 % (boss monsters only); §1.4 boss
  mechanics (immunities, EFF cuts) — for the boss-hints idea; §1.5 **rule R** = who needs EFF: a resist-checked status
  debuff on S1/S2 (roll ≥ 50 % at max skill level) or a DoT/stat-down on S3, hard CC excluded (bosses are immune) — 49 of 129
  heroes then. §2 data for the app, §3 code maps, §4 the owner's roster (Lv100 without EE: none of 19 geared debuffers reaches
  268). PLAN §0 decisions, §1 ground rules, §2 stages, §3 later tickets, §4 risks, §5 journal.
- **Stage A — dressing in turn** (`turn`, c1b035d…ca1404d): «Кого переодеть?» shows each hero's gain now (= the plan line's
  gain, `heroGain` via `planOf`+`advance`+`lineGain`), computed in chunks (`runChunks` moved to `model/chunks.ts`), recomputed
  after every «Сделал» / «Вернуть»; re-dressed heroes last with ✓, not pickable; «Закончить» in the session line; «Вернуть»
  reaches the open sheet (`onApplied` `after`). Plus Q1b (af30bbc): trade never takes other heroes' spare.
- **Stage B — data, no UI** (`bossdata`, a073f1c…34e033c): `update.py build_bosses` → `Dataset.bosses` (55 fights: special
  request 10, guild raid 15, world boss 6, joint challenge 5, irregular 4, singularity 15; rows `[level, RES, SPD, label]`,
  `q` = −200 ‰ quirk, immunities, `live` dates, guide teams per stage bucket, guild-raid requirements); `Char.eff`
  `{w:[Lv100,Lv120], r (Ranger 50), t:{r,f} per ★, p (CF Notia)}`; `main_values` by the value most items carry (was the
  minimum: gloves EFF 45→50, armor DEF 450→500 …; CHC rows unchanged, 0 of 800 verdicts moved); check-data anchors
  (Meteos st13 360, Frost Legion st10 335, W per subclass, glove EFF 50). Dataset +37.5 KB min / +6.3 KB gzip.
- **Stage C — a boss on «Команда»** (`boss`, 8de650f, 07a3057, 590e78d): `features/boss` — list (running now → special request
  → singularity → joint challenge → guild raid), stage chips, RES `floor(RES·(1000+q)/1000)`, SPD, immunities by stage with one
  «Контроль» chip for the six hard-CC ids, «Гайд на outerpedia ↗», «Собрать из гайда» (first owned alternative per spot, guide
  order; several teams → `GuideChoice`; «Вернуть» toast), the spot sheet «Из гайда на это место», `ogc.boss`. Mockups
  `mock/MOCKUP-C.html` first. Later redesigned as the fifth slot behind «VS» (0206).
- **Stage D — hero EFF, read-only** (`eff`, 3431073…64d079b): `Char.eff.ee` (EE premium ‰, 17 heroes) and `Char.eff.d`
  (rule R) in data; `game/stat/eff` `effOf` (one EFF total for card, sheet, «Команда»), `effShown`, `landChance`;
  `game/hero/level` `lv120Of` (so 0205's per-hero level plugged into one function); `GearStore.eff[hero] = {typed, at}`, backup
  **OGC-GEAR7**; card line «Эфф: ≈ 233» under the crit line, sheet «Эфф для X» («Герой 120 · вещи 113 · ×2», field «В игре»,
  «Сбросить»), on «Команда» EFF vs the boss's RES with the landing chance (`BossEff`, replaced by `BossTurn` in E1); tip
  `wornEff` (news). Mockups `mock/MOCKUP-D.html` first.

**Owner decisions** (2026-10-12 unless noted).
- **Q1 (a)+(c)**: picker marks + «Закончить»; (b) «Дальше: X ▸» not built. **Q1a**: the mark is the plan-line gain; order **by
  name** (the player knows whom to re-dress), done last with ✓, not pickable; no "free" pieces exist.
- **Q1b**: trade never takes another hero's spare (in game it is locked, held for Breakthrough / a better piece); only spare
  held when the calculation started (`World.held`) — a piece a team step took off stays a candidate.
- **Q2 (a)**: the boss lives at the top of «Команда», not its own tab (the boss is the team's context). Superseded in form by
  0206 (fifth slot behind «VS»).
- **Q3**: the hero's EFF = the app's count calibrated by **one typed stat-screen EFF**, stored as `{typed, at}` → shown = count ×
  typed / at (stays right after the app moves gear; covers EE, talisman, gems, CF level). Details: (1) asked only on «Команда»
  with a boss, for a member whose EE gives EFF and no typed value — never required; (2) «≈» returns when the count ≠ `at`, no
  prompts. Enhance not tracked (mains at +10). Untouched «Готово» never re-anchors; empty field + «Готово» = «Сбросить»; Core
  Fusion moves the typed value like crit/stars (shown with «≈»).
- **D1 changed**: the UI lists special request, singularity, joint challenge, guild raid (45 fights); world boss and irregular
  hidden (data stays). **D2 changed**: no Challenge-quirk setting — RES always with the full −20 % like outerpedia, Help says
  so. **D3**: no guild-raid geas (order quirk × geas unresolved). **D4**: guide texts (notes, tips) not shipped — no Russian on
  outerpedia; boss names English, immunity names our own RU/EN. **D5**: team per boss kept in `ogc.boss` (+ a "no boss" team),
  device only, not in the backup (0206 later: one team for every boss). **D6**: the EFF line only for rule-R heroes (ignore-
  resist DoT heroes — Francesca, Vlada, Eris, Eliza, Drakhan — get none). **D7**: W by the `lv120` setting (now per hero, 0205),
  Ranger +50 by `quirks`. **D8**: pieces given to a boss team = plain moves. **D9**: boss hints → `.x/0173`.
- Stage C extras: «Собрать из гайда» replaces the whole team; a new boss opens at its top stage, last stage remembered per
  boss; guide **slot alternatives** count (first owned per slot).
- Review A+B: **A1** — a piece taken off in the window is free for the next hero; «Свободные вещи» on close (later replaced by
  parking in E2b); **C1 (a)** — immunities per stage as runs in the data (`imm: [[firstRow, ids]…]`), `immAll` dropped.
- Review C+D: **C1** Core Fusion X stands in for X in a guide spot; **C2** a spot's guide heroes narrowed to the stage's
  team(s) matching the rest of the current team, union as fallback; **C3** nobody owned → «Подойдут команде» back, the
  «нет в ростере» line ≤ 4 names + «и ещё N»; **C8** all teams disabled → `noneOwned` toast; **D2** leave: EFF line only when
  something is worn (like «Крит»); **F1** «Команда»'s EFF vs RES counts the element quirk node in battle (Light/Dark +5 % always,
  Earth/Water/Fire +7 % on element advantage; with `quirks`), the card stays stat-screen; **F4** plus the strongest teammate's
  transcend team row (`Char.eff.tm`), talisman out; **F5** rule R also counts cooldown-up (Demiurge Vlada S1), AP-charge-down
  (Epsilon S2), buff-cut (Maxwell S2) → `d` 49 → 52. `battleBonus` / `inBattle` in `game/stat/eff` carry F1 + F4.
- Reviews: three checkpoints (A+B, C+D, E+F), each from a start prompt naming model + effort; simple findings fixed by Sonnet
  agents on `review-xx`, the rest asked first (PLAN §1 «Reviews»).

**Hard parts.**
- Gains: every hero "gains" (+4…+61) because a plan takes others' worn pieces; net of givers' losses all were negative —
  hence Q1a (mark = plan line, sort by name). Timing: 105 ms warm on PC, 1.7–2.2 s for all marks on a 4–6× slower phone
  (A5, left: the list is usable, order doesn't depend on marks). StrictMode broke «Вернуть» in dev (A2, fixed).
- Research errors caught: old `boss-compact.json` column 4 was the boss's EFF, not RES −20 %; world-boss leagues 3–4 S–SSS
  use the wave-2 monster (RES drops once inside league 4 — real; check-data allows one drop per league). RESEARCH §1.1 said
  the element node is conditional only and "accuracy has no consumer" — wrong (F1: the node is `ST_BUFF_CHANCE`). The worked
  examples used T0 gloves with a 4P T4 set (impossible under the Breakthrough rule).
- `main_values` took the minimum item → one weak Ether item per slot (Etheric Gloves EFF 45) set every Legendary main;
  `craftable` couldn't spot outliers, so the most common value wins. Ether gloves still over-counted by 5–6 (F7, typed covers).
- Core Fusion W: outerpedia has no evolutions for CF ids (raw W 10); the app borrows the original's — confirmed in game (F3).
- Two capped stats in one layout (CHC + EFF; Pareto dominance proven for one) — the reason the "exact cap" stayed out.
- The calibration from «Команда» first stored `at` at the ★ tried on the spot (D1 bug, fixed: the sheet uses the card's ★).
- `update.py` crashed the nightly build on any boss-format change (B1) → `build_bosses_safe` warns and ships without `bosses`.
- Shipped check-data guards: sr/gr stage labels exactly 1…N (C5, `teamsAt` matches by row), `live` ISO with `Z` (C6), RU/EN
  `team.status` key parity (C7).

**Not built / dropped.**
- Original **stage E** (EFF target in the model: `GearStore.effT`, GEAR9, «Шанс дебаффа 100/95/90 %» Q4a, «Цель для
  команды», floor rule Q5 zeroing EFF in verdict/pool when floor ≥ target, card «Эфф: 188 / 283» + «Что искать» gap line Q6)
  and **stage F** («Подобрать вещи» → team trade with targets): **withdrawn by the owner 2026-10-13** after the E mockups —
  we don't know whom a hero will fight, so no target on the card; the task is each debuffer's absolute EFF and landing
  chance on «Команда». Replaced by E1–E4 (turn timeline, team trade on «Команда», EFF/SPD goals only inside the boss team
  trade, MODEL §13).
- Exact EFF cap (generic capped stat, two caps per layout, ≈ 2–2.5 weeks) — not built; E3's goal is the trade-only form.
- Picker «Дальше: X +6,3 ▸» (Q1 b) — not needed. Challenge-quirk setting (D2) and geas (D3) — no. World boss / irregular in
  the UI (D1). Guide notes/tips (D4). Singularity weekly rotation; towers, adventure license, monad gate (hidden guides).
- Boss hints / skills the boss needs (Barrier → Buff Removal) → `.x/0173-team-boss`. Heroes' RES vs boss debuffs →
  `.x/0210-hero-res`. Loadouts per boss team → memory (loadouts idea). Spare that lies forever → partly `.x/0204` (parked).

**Checks.**
- Done (owner, 2026-10-12, PLAN §0 check 1): stat-screen EFF vs app — Gnosis Domine ★4 364 and CF Eternal ★6 224 exact; Iota
  +3, Sigma +6 (talisman/gems); Tamara, Ember −36 = Epic gloves at +0 → after enhancing to +10, 233 and 141 exact. **Formula
  confirmed**; Ranger node is flat +50 (check 2, from Sigma's numbers and the client); CF W = the original's.
- Pending: guild-raid geas order — (335 + 250)·0.8 = 468 per code vs 268 + 250 = 518 per guides (check 3); Light/Dark element
  node +5 % vs +10 % (two nodes share one buff id; F1); seven skills turn ignore-resist only at skill Lv5 (rule R assumes
  maxed skills, F6, no change).

## 0200-boss E1–E4 — turn timeline, team trade, the walk, EFF and SPD goals (review 0203)
Folders: `.x/0200-boss` (stages E1–E4, PLAN §5 from 2026-10-13), `.x/0203-boss-review-ef`.
Merged (all no-ff, not published at merge): E1 `9c75382`, E2 `f9174c5`, E2b `4bcbbeb`, E3 `4c2f265`, E4 `a7dec4c`
(2026-10-13); review 0203 + IG-1 `5c7bfc8` (2026-10-14). Code: `src/game/stat/turn.ts` (`turnOf`, `firstAt`, `anyChance`,
`luckPct`), `src/game/stat/spd.ts` (`spdOf`, `spdBonus`, `spdReach`), `src/features/boss/model/turn.ts` (`timeline`,
`reasonsAt`), `src/features/boss/ui/BossTurn.tsx`, `src/features/trade/model/{goal,kit,team,cands,ends,walk,apply,stored,
reach,hint}.ts`, `src/features/trade/ui/{TeamTradeSheet,TradeWalk,EntrySheet,useWalk,OrderSheet}.tsx`,
`src/screens/team/TeamScreen.tsx`, `src/features/gear/model/gear.ts` (`park`, `activePieces`), `src/features/roster/backup.ts`
(GEAR9), `update.py` (`turn_reasons`, `spd_up`, `flat_profile`), `scripts/check-data.mjs`.
Rules live in: MODEL.md §5 «Parked», §7 items 2, 4, 6–9, §13; DEVELOPMENT.md «Where things are» (`features/boss`,
`features/trade`, `game/stat`), «Storage and URLs» (`ogc.trade`, `ogc.boss` `orders`, `GearStore.park`); header comment of
`game/stat/turn.ts` (the turn rule); Wiki `Team-check` / `Проверка-команды`, `Trading-gear` / `Обмен-вещами`, `Equipment` /
`Экипировка`, `Characters-and-guild-code` (GEAR9); Help `t.ui.helpTeamItems`, `t.ui.helpTradeItems`.

**Why.** The planned stage E (an EFF target stored on the hero + a floor rule in the verdict) was withdrawn by the owner
after its mockups (2026-10-13): "we don't know whom the hero will fight". The owner's picture instead: «Команда» is where a team is
built; with a boss it shows each debuffer's EFF + chance and **who moves first**, then offers the gear trade right there —
with a boss the trade lifts EFF and secures the first turn. Stages E (old) and F were replaced by E1 → E2 → E2b → E3 → E4.

**What we built.**
- **E1 — «Ход против босса»** (replaced stage D's «Эфф против RES» block, `BossEff` deleted): a vertical timeline under
  the team (stopwatch on top, line on the left), members and the boss (red row) in first-turn order; blue node = surely
  before, dashed amber + «⏱ раньше 74%» = luck, grey = after; the EFF badge with the debuff chance; a row expands in place
  (EFF short of RES + 1, SPD that surely moves first, «Эфф из игры ▸»). New `game/stat/spd` `spdOf`. Wide window: timeline
  + report in a right column (`.tm-side`). Tip `teamTurn` (news).
- **E2 — team trade on «Команда»**: «Подобрать вещи» under the team opens `TeamTradeSheet` for 2–4 members with builds
  (was exactly four); the build per spot is a pill under the spot (`OrderPill`), kept with the team in `ogc.boss` `orders`;
  the old «Герой | Команда» switch, diamond and «Ещё → Обмен для команды» removed; roster «Обмен» = one-hero trade at
  «Кого переодеть?». «6★» dropped from «Искать:» (9a94ae3). Tip `teamTrade` (news).
- **E2b — the trade as a record** (both trades): the plan is a walk with ticks; «Оставить как было» per recommended piece;
  replacements at the end («no orphans»); parking (`GearStore.park`, «припаркована» in the Pool); «Ввести» an inventory
  piece into an empty slot right in the plan (`EntrySheet`, form extracted to `features/eval/form/ItemForm`); one record,
  one «Вернуть»; walk state in `ogc.trade`; backup OGC-GEAR9. Removed: «Не брать», «Свободные вещи» (`FreeSheet`,
  `model/free`), `TradePlan`. Tips `trade` rev 4, `teamTrade` rev 2 (news).
- **E3 — EFF goal**: with a boss, every rule-R member gets a soft term inside V (`GoalGauge`, `WorldOpts.goals`), target
  RES + 1; exact kit search (`linearKit`, `goalDominates`, `setUp` bound); walk row «Эфф ≈ 184 → 222 · 93%». Tip
  `teamTrade` rev 3.
- **E4 — SPD goal**: members whose turn-1 skill matters (`Char.turn` from `update.py turn_reasons`) get a second term
  (`SpdGauge`, 333 milli per SPD); allies' transcend SPD (`Char.spdUp`, `spdBonus`); the why line on the timeline; walk row
  «Скорость 138 → 232 ✓»; turn math moved down to `game/stat/turn` (trade may not import boss). Boss row got SPD/RES icons
  (00d3234). Tip `teamTrade` rev 4.
- **Review 0203** (Opus xhigh, Sonnet fixers, branch `review-ef`): 0 blockers, 2 should, 14 could; all fixed or decided;
  plus IG-1 from the owner's in-game check (below).

**Owner decisions** (tags as cited in code; all 2026-10-13 unless marked).
- *Withdrawn stage E*: old Q4 (target from the boss stored on the hero), Q4a («Шанс дебаффа 100/95/90 %» switch), Q5
  (floor rule in verdict/pool), Q6 («Эфф: 188 / 283» + «Что искать» on the card) — no `GearStore.effT`, no floor rule.
  GEAR9 went to parking instead.
- *E1*: one turn-order chain of team + boss; SPD source (a) — the app's count only (base by level/quirks, SPD substats,
  SPD accessory main, Speed set), no typed SPD unless in-game checks show misses; luck gets its own mark (not «≈», which
  means "estimate"); owner merged turn chance and debuff chance into one vertical timeline; icons = Speed set (SPD), EFF stat
  icon, RES stat icon; **only the first turn** (a second boss row would rest on an unconfirmed gauge-reset rule).
- *E2 Q1*: the team trade lives only on «Команда»; one-hero trade is always "dressing in turn". *Q2*: the build per spot is
  remembered with the team; **worn gear is never stored with the team** — the trade reads the store as it is now. *Q3*: a
  button under the team, the plan in a sheet («Сделал» → toast with «Вернуть», timeline recounts). *Q4*: 2–4 heroes with
  builds; one hero → the one-hero trade; a hero without builds stays out with a line.
- *E2b* (owner's rework after E2 shots; reverses MODEL §7.7 «holes are not filled», 2026-10-04):
  - Q1 (a): «Оставить как было» freezes **receiver A's slot** only; B's piece stays in play for other members.
  - Q2 (a): a displaced piece → the giver if they can wear it → else a team member whose slot emptied → else **parked** on the
    hero it came off; parked is marked apart from reserves so it is never fed by mistake.
  - Q3 (a): parked waits in its hero's «Пул»; any later trade offers it first for an empty slot of anyone (its own hero
    included); never feed/dismantle; mark goes when someone wears it.
  - Q4 (owner's variant): the inventory piece is entered right in the plan (slot fixed), recorded only on «Сделал»; the
    line then shows its score and advice. Q5: the entry window takes everything (main, substats with segments, «T4»).
  - Q6 (a): closing block «В конце — замены», each with «Оставить как было» (declined → giver's slot empty, piece parked).
    Its "lock first" addition was later replaced by O3.
  - Q7: the plan is a walk with ticks; «Сделал» only when every line is ticked/declined; one record, one «Вернуть»; ticks
    kept on the device until «Сделал» / «Отмена».
  - O1 (a): ✕ keeps ticks, declines and entered pieces (restored when the same trade opens); «Отмена» discards after
    «Сбросить отметки?»; one stored walk at a time.
  - O2 (a): a parked piece is never a Breakthrough target nor feed — verdict, reserves, material, batch see pools without
    it; only the trade sees it. Follow-up (parked piece whose hero now wears better) → `.x/0204-parked-list` (done).
  - O3 (a): «Замок» only for a piece that stays parked; a moving piece gets no lock — it is named in full (item/set, main,
    substats) because once moved the game no longer knows whose it was.
  - O4: givers' empty slots are not walk lines; «Ввести» only for receivers. O5: the lock line names the parked piece in
    full; no separate parking line at the end.
- *E3*: Q1 target = **RES + 1** for every rule-R member, no control, no guide numbers (guide `r.eff` in 7 teams only and
  inconsistent). Q2 (a) measured in the timeline's number (app count × typed ratio + battle bonus at the spot's ★; «≈» if not
  typed). Q3 **λ = 1** point per missing EFF% segment. Q3a EFF above the target is worth **nothing** (sharp step, no knee).
  Q4 **the bar stays**; a recommended weapon/accessory still outranks points. Q5 (a) unreachable = no special case (λ caps
  cost; Laplace 49 → 56 %). Q6 (a) ▲/▼ gain and «Статы» stay plain stats; the EFF part is its own row, chance after the
  trade, ✓ above RES. Q7 (b) new inputs = new walk: `ogc.trade` target includes boss@stage and every member's ★ (default
  confirmed: a ★ tried on a spot is an input too; silent reset).
- *E4*: Q1 (a) **the app decides from skills** — goal only for members whose turn-1 skill acts on the boss's first move or
  shields the team; never a ceiling (the app never slows anyone). Q2 (a) target = surely first (`firstAt`), no luck level.
  Q3 (a) λ = 1 per missing SPD segment (3 SPD); **above the target SPD keeps its chain points** (more turns later). Q4 (a)
  both goals on one member = sum of the two terms, two plan rows. Q5 (a) goal **off when no chance is possible** (the
  member's fastest kit ≤ "surely after"); unlike EFF because the SPD chance is a step (0 → 100 % within ~10 %), not a slope.
  Q6 (a) count gear SPD + the team's transcend SPD by the givers' ★; EE/talisman/buffs invisible; no typed SPD. Q7 (a)
  the plan shows numbers only; the reason lives on the timeline's expanded row; members without a goal lose «нужно …».
- *Review 0203*: E4-5 fix — `turn_reasons` drops conditional rows, resource-gated ultimates, Golden Curse end-effects; any
  `BT_COOL*_CHARGE` < 0 = cooldown up (Demiurge Vlada in; Ember, Sigma, Snow, Sterope, Demiurge Stella, Monad Iota out).
  E4-1 fix — SPD reach from the trade's own candidates (`tradeSpdReach`). Open Q1 → **variant E**: in the team trade only,
  a teammate's weapon/accessory may go below the receiver's bar into a slot whose own piece is empty or off their list
  («not an exception — an extra rule-condition»; Maxwell, Frost Legion 10: 55 % → ✓). E4-6 (a) single-ally shield is its
  own kind `shield1`. E4-4 «(+10 трансценд)» (the bonus includes the hero's own row). E4-7 assume max skill level but say it
  («с 3-го уровня навыка»; Akari 3, Dolly 5, Omega Nadja 5). E4-8 → `.x/0207-battle-start-spd`. E4-10 → `.x/0206-boss-sheet`.
  Cosmetic nits of pass 5 stay (owner 2026-10-14).

**Hard parts.**
- The turn rule has no client code: taken from outerpedia's Stats guide (community-tested): start gauge = SPD × 100 / top
  SPD + hidden 0–5; surely first above boss × 100/95 (≈ × 1.053), surely after at ≤ × 0.95. Edge bug: exactly 0.95 × boss
  was «luck 0 %» (E1-1, `>=`); walk and timeline rounded the chance differently (E4-2, one `luckPct`).
- E2b probe (owner's roster, 12 guide teams): a team trade takes from everyone outside the team by design —
  walks ≈ 50 lines (≈ 20 moves, 13 replacements); Heatwave Cop Delta got 4 replacements in one trade. E2b cut givers' empty
  slots from 222 to 72 on 12 guide teams.
- Kit search speed: E3's first version took 8 s on the worst team; bounds (points + b, set-aware `setUp`) → 0.59 s; E4
  0.62 s, 11 teams 3.0 s — auto-run kept. Fuzz in the review: 41 600 random worlds, `bestKit` = brute force, 0 mismatches;
  E3-1 fixed `setUp` assuming sets never lose value on more pieces (true today, not guaranteed).
- The λ probe first ranked kits by V only, ignoring the weapon/accessory rank (MODEL §3.3) — re-run with rank first; λ 1
  still right.
- Akari's EFF 261 vs 230 on Grand Calamari looked like waste — surplus is free (pieces taken for SPD); real misses were
  bar-blocked teammate swaps → variant E.
- E4 data: 8 of 22 turn-1 reasons were false (conditions, resources, end-effects) — skill rows need `conditionType` /
  `createType` checks. Edelweiss S1 «seal» is Unbuffable (`BT_SEALED`), not CC.
- **IG-1** (found by the owner's Mene in-game check, 2026-10-14): since outerpedia e01cc14 (2026-10-09) `flat_profile` lost
  evolution rewards (122 of 128 heroes, published site too); the fixture was right so tests stayed green. Fixed 4a6c0a7
  (read `damage/characters.json` `evolution`), 62bfa4c (Core Fusion takes the original's evolutions; 0 verdicts changed),
  52c7ef3 (check-data reachability uses the % kind); check-data anchors Mene SPD 107 / DEF 754, CF Eternal SPD 129.
- Layout: the luck word hidden ≤ 340 px (cut names to «Ve…»); boss row ≤ 340 px hanging «·» (08045a6); long order names
  at 280 px broke the plan grid (25d4e7a); tips shortened to the 160-char limit (E2b).

**Not built / dropped.**
- Old stage E (target on the hero, floor rule, «Шанс дебаффа» switch, card «Что искать») — withdrawn; nowhere.
- Exact EFF cap (two capped stats per layout) — not needed after the redesign; nowhere.
- Typed SPD — not unless in-game checks show misses (E1, E4 Q6); nowhere.
- A second boss turn / turn simulation — unconfirmed reset rule; nowhere.
- Order inside the team («Dianne before the strongest ally») — E4 Q1 "a later step"; nowhere.
- Battle-start +30 % self SPD (5 heroes) and Monad Iota's +15 to Dark allies — `.x/0207-battle-start-spd` (deferred).
- Guide SPD numbers (run-order slots, ceilings «≤180») and guild-raid geas (boss SPD ±30/50 %) — not modelled; nowhere.
- Applying variant E to the rating or batch — owner: team trade only.
- Heroes' RES vs boss debuffs — `.x/0210-hero-res` (idea). Boss hints / skills the boss needs — `.x/0173-team-boss`.
- Moving the plan inline on «Команда» — owner "maybe later" (E2 Q3); nowhere.

**Checks.**
- Done 2026-10-14 (Meteos 13, 30 readings): allies' transcend SPD (+10 Mene ★6) confirmed; the bearer's own row is
  already on her profile SPD; turn formula and 0–5 jitter fit all readings; CF Eternal base confirmed (original's
  evolutions); Mene's row +5 at ★4, +5 more at ★6.
- Pending: PWA Regina 238 / Ember 236 acting before a 276 boss (moved to `.x/0207`, when PWA returns); geas SPD effect;
  Snow and Lisha (3★ fusions of 2★ heroes) taking the original's evolutions — not checked in game.

## 0204 Parked pieces list — «Ещё» → «Припаркованные · N», «Убрать», «Вернуть»
Folders: `.x/0204-parked-list` (`IDEA.md`, `TEXTS.md`, shots). Merged: `ebde923` (2026-10-14, merge of branch `parked`; commit `7b8cafe`; not published). Follow-up of `.x/0200-boss` E2b O2 (parking). Code: `src/screens/parked/ParkedList.tsx`, `parkedGroups` / `parkedCount` in `src/features/gear/model/gear.ts`, `undoRemove(…, parkAt)` / `removeUndo` in `src/features/gear/pool/ops.ts`, `parkedOpen` sheet + auto-close in `src/app/App.tsx`, `parkedN` in `src/app/shell/More.tsx`, note `t.fit.parkedNote` in `src/screens/chars/CharDetail.tsx`, `src/styles/more.css`.
Rules live in: MODEL.md §5 (Parked — "The way out"), DEVELOPMENT.md «screens/» row (`parked/`), Wiki `Trading-gear` / `Обмен-вещами` (parking paragraph) + `Getting-started` «Ещё» list, Help (trade item: "All parked pieces — More → «Parked»…"), `t.ui.parked*` + `t.fit.parkedNote` texts. Tour: `coverage.ts` 'helper'.

**Why.** Owner 2026-10-13: a trade parks pieces (taken off, nobody could take them: the giver's class, or «Оставить как было» on a replacement). They are protected (never feed, never BT, never dismantled — E2b O2). The player's way out: unlock the piece in the game and remove it from the app's pool; in the game it becomes ownerless and returns to evaluation during dismantling. Removal existed per hero («Убрать у X» on the piece card) but there was no list across heroes and the card note did not name the way out. On the owner's roster 12 guide-team trades parked 2 of 152 pieces (class-locked accessories).
**What we built.**
- «Ещё» → «Припаркованные · N» (hidden at 0, like «Доодеть · N»; hidden in a tutorial or without `canEquip`); sheet «Припаркованные вещи»: top line (unlock in the game, then «Убрать»), heroes in roster order (face + name), each row = the piece in full as the walk's lock line (`PieceRow` + `pieceText`) with «Убрать».
- `parkedGroups(st, order)`: roster-order heroes first, then other pool owners; a hero's pieces in slot order; a record two heroes share is under both (count N counts each appearance).
- «Убрать» = the card's removal (`removeFrom`) — one store path so drop / undo / Core Fusion / `syncWorn` stay one; message `removedFrom` with «Вернуть». The last removal closes the sheet (effect in App; «Вернуть» does not reopen it).
- Piece card note `parkedNote` now ends with the way out ("…Не нужна — сними замок в игре и «Убрать у Rin»").
- Docs: Help, Wiki EN/RU (Trading gear, Getting started), MODEL §5, DEVELOPMENT row. Tests: `test/gear/park.test.ts` («Припаркованные»), `test/app/more.dom.test.ts` (+49 lines for the menu item and sheet), `test/trade/trade.dom.test.ts` (card note).
**Owner decisions.**
- Q1 (a) CONFIRMED: «Ещё» → «Припаркованные · N», a sheet grouped by hero, each row the piece in full with «Убрать», «Вернуть» in the message, a top line. Not chosen: (b) «P» badge on roster tiles; (c) only per hero (existing Pool mark).
- Texts confirmed as in `TEXTS.md`; tour: no tip, a `coverage.ts` entry ('helper', as «Найти вещь»); not in «Что нового» (parking is rare).
- Timing: after the E review (`.x/0203-boss-review-ef`), own session.
**Hard parts.**
- «Вернуть» after «Убрать» used to restore the pool but lose the park mark (the piece came back unprotected): `undoRemove` got `parkAt` — the piece's index in `st.park`, re-inserted there unless someone wears it by now (`syncWorn` drops park then). The closure is built before the write (`removeUndo` reads `st.park.indexOf`).
- Closing on the last removal must not fight «Вернуть»: effect `if (parkedOpen && !parkedN) close`, state `parkedOpen` reset; undo just refills the count and the sheet stays closed.
- Layer: composes gear + hero + trade's `PieceRow`, so it lives in `screens/parked` (`test/layers.test.ts` guards the layers), not in a feature.
**Not built / dropped.** «P» badge on roster tiles (b) and per-hero-only (c) — rejected by Q1. Auto-removal of a parked piece whose own hero now wears a better one — open question, "later" (owner, 2026-10-12, after 0200-boss Q1b: spare held for a hero should not lie forever, yet pieces must not wander between heroes and the player must not do the same thing twice; MODEL.md §5). Nowhere else recorded.
**Checks.** Shots exist (folder `shots/`), both themes; no result notes were kept. No in-game checks pending; the premise (unlocked in the game → ownerless → comes back in dismantling) is the owner's stated game behaviour, not re-verified by us.

## 0205 Hero level per hero — Lv 100 / 120 in the star sheet
Folders: `.x/0205-hero-level`. Merged: `35b92d8` (2026-10-12, branch `hero-level` from 49687e9; commits `e8ae24d`, `928b06c`, `ec038a8`, `dc33276`). Code: `src/game/hero/level.ts` (`lv120Of`), `src/game/context.ts` (`Ctx.lv`), `src/features/gear/model/gear.ts` (`lv`), `store/gearStore.ts`, `src/features/roster/backup.ts` (OGC-GEAR8), `src/game/hero/Stars.tsx` (level pill), `src/screens/chars/{CharDetail,BuildView}.tsx`.
Rules live in: DEVELOPMENT.md Storage («`lv` (hero → …100 or 120…»), Wiki `Characters-and-guild-code`, `Equipment`, Help `helpChars` + settings note `levelNote` (`t.ui.help…`), tip `heroStars` rev 2 (`news`). MODEL.md §0 and §1.3 (the marked level wins over `lv120`).

**Why.** Lv 100 is easy, Lv 120 slow and expensive — one global «Lv 120» switch is wrong for most rosters.
**What we built.**
- `GearStore.lv[hero]` = 100 | 120, no entry = the settings default (`lv120`, renamed «Уровень по умолчанию»). One reader `lv120Of(ctx, hero)`: flat vs % (`score:flatFactor`), SPD set rows (`setBonus`), white EFF (`effOf`); profiles memo per ctx, so verdict/pool/batch/trade follow. Golden unchanged (no marks = old behaviour).
- Star sheet «Звёзды и уровень: X»: three-way pill «по умолчанию | Lv 100 | Lv 120» (stays open; Team's sheet has no level row — Team reads the card's); «· Lv 120» after the stars for a hero at 120; BuildView «For lv …» line per hero. Lifecycle like `stars`: drop/undo, Core Fusion carries it, cleared out of the roster, bad values dropped. Backup `OGC-GEAR8` (flag + 1 bit after the EFF; 0 = 100, 1 = 120; a hero with only a level is in the list; GEAR7 literal read in tests).
**Owner decisions.** Q1 (a): the settings switch stays as the default; a marked hero keeps their level when it flips (stored explicit, not «follow default»). Q2: level lives in the star sheet; header shows «Lv 120» only at 120 (marked or default); Team takes it from the card. Texts OK; `heroStars` rev 2 shown in «Что нового». Look: chips → one gold pill, text centered, lower pill; «по умолчанию» first segment without tick: default chosen = the level it gives lit pale, a level chosen = bright gold.
**Hard parts.** Backup version order: stage D of 0200 shipped GEAR7 (EFF), this took GEAR8 (parked later GEAR9). At 280 px «по умолчанию» wraps to its own line. 36 shots, no overflow.
**Not built / dropped.** Level row in Team's sheet (card is the one place). Nothing else.
**Checks.** Done: `task test` 2467, `task tour:check`, golden unchanged. Pending: none.

## 0206 Boss slot and sheet — the boss as a fifth slot behind «VS»
Folders: `.x/0206-boss-sheet`. Merged: `59e98e1` (2026-10-14, with 0208; commits 76249f6 data,
ae43736 UI). Code: `src/features/boss/ui/{BossSlot,BossFace,BossSheet,stageText}.tsx`, `src/features/boss/model/stored.ts`
(`ogc.boss` v2), `src/features/team/ui/TeamSlots.tsx`, `src/shared/ui/Sheet.tsx` (`foot`), `src/styles/team.css`, `update.py`
(`build_bosses` icon, `fetch_images`).
Rules live in: DEVELOPMENT.md «Where things are» (`features/boss`, `screens/team`), «Storage and URLs» (`ogc.boss`); Wiki
`Team-check` / `Проверка-команды`; Help `t.ui.helpTeamItems`; tips `teamBoss`, `teamTurn` rev 2.

**Why.** Review 0203 E4-10: long boss names clipped at 341–380 px; owner: drop the element icon and «Босс» from the row, and
the boss sheet «выглядит НЕ секси» — words for RES/SPD, and ✕ read as "cancel my choice", not confirm.
**What we built.** Boss portraits (`Boss.icon` → `boss:<icon>`, 33 boss images + 2 hero-face fallbacks, ≈ 280 KB); the
boss as a fifth slot behind «VS» beside a 2×2 team (the boss row is gone; ✕ on the slot removes the boss); the sheet a
draft with a gold «Выбрать» in the `Sheet` foot; per-kind cards (element wash, gold stage picker: number grid, singularity
letters + «— | + | ++», joint challenge three-way switch; SPD/RES medallions); the turn plan always shown — without a boss
«Порядок хода» by SPD.
**Owner decisions** (2026-10-14).
- Q1: portraits **everywhere** — the slot, the list, the card, the plan's boss row (replaces the element icon).
- Q2 (b): a **draft** — browse freely, «Команда» changes only on «Выбрать»; ✕ / tap outside / Back = cancel; nothing changed
  → the button just closes.
- Q3 (first version: ✕ on the row + toast) — superseded by the owner's fifth-slot idea before an answer.
- Q3 (new) (a): **one team for every boss** — the boss is a lens; picking, changing or removing it never changes the heroes;
  builds belong to that one team; ✕ instant, no dialog, no toast; the turn plan always shown. Reverses 0200 D5 ("team per
  boss"); `ogc.boss` v1 migrates the last boss's team, else the «no boss» one.
- Q4: **2×2** («смотрится лучше»), not the game's diamond.
- Q5: texts OK («Босс / выбрать», «Убрать босса», «Порядок хода», «Другой», «Выбрать», «Иммунитет»; removed «Босс:», «не
  выбран», «Без босса»); both tips in «Что нового».
**Hard parts.** Two guild-raid subs are hero monsters — 404 in `ui/boss`, fall back to `faceicon`; `fetch_images` raced on
duplicate paths (same `.tmp`) — images keyed by icon, fetched once. The approved `teamBoss` text was 213/233 chars vs the
160 limit — shortened.
**Not built.** World boss and irregular fights stay hidden (0200 D1); no ✕ on a row (the row is gone).
**Checks.** Shots 10 scenes × 6 sizes × 2 themes + EN; `task tour:check` green. No in-game check needed.

## 0208 Singularity guide teams — named pools of hero groups
Folders: `.x/0208-ds-teams`. Merged: `59e98e1` (2026-10-14; commit 1a649d2). Code:
`src/features/boss/model/boss.ts` (`fillFrom`, pool teams), `src/features/boss/ui/GuideChoice.tsx`, `src/game/data/types.ts`
(`BossTeam.p`, `l`), `update.py` (ds teams from `content.json`), `scripts/check-data.mjs`.
Rules live in: DEVELOPMENT.md «Where things are» (`features/boss` «Собрать из гайда»; `game/data` `Dataset.bosses`); Wiki
`Team-check` / `Проверка-команды` «Team from the guide»; Help `t.ui.helpTeamItems`.

**Why.** Owner (2026-10-14): singularity guide pages have teams («Burned team», «Fire team») — offer them in the hero choice
like the other bosses (0200 stage C had "no guide teams" for singularity).
**What we built.** `update.py` reads `<slug>/content.json` `teams` for singularity only: a team = a name (`l`: element /
effect glossary id / hero / none) and 3–8 **groups** of heroes in guide order (`p: 1` — a pool, not four spots). «Собрать
из гайда» takes the first owned hero of each group in order until four; the choice sheet names each team («Свет»,
«Горение», «Mero») and shows the four it puts, then the first heroes of groups nobody owns (faded); any spot's sheet lists
every hero of the matching teams under «Из гайда».
**Owner decisions.** (a) (2026-10-14) — the fill rule above; texts OK («Из гайда» / «From the guide», element names «Огонь /
Вода / Земля / Свет / Тьма»).
**Hard parts.** A pool is not four spots (Meteos water team: 6 groups; Urd (Dark) Mero team: 8, one empty) — the spot model
of `BossTeam.s` didn't fit, hence `p`. Data was there at a31f580 too, so the fixture got ds teams only.
**Not built.** Singularity weekly rotation (0200 §3, later). Tour: no change (the tip already names «Собрать из гайда»).
**Checks.** Shots `shots/11-ds-choice-*`. No in-game check needed.

## 0220 Filler — a weak weapon or accessory with a suitable main goes into an empty slot
Folders: `.x/0220-empty-slot-filler` (`PLAN.md`, `REVIEW-PROMPT.md`, `REVIEW.md`, probes in `probe/`). Branch `filler`:
`57cf102` + review fixes (not merged yet). Code: `fillerOf` and `better()` step 0 (`gearFilled`) in
`src/features/gear/layout.ts`, `eligibleIn` in `src/features/gear/pool/info.ts`, `heroOutcome` `filler`, the `wear` order,
D4 and `fillerWaits` in `src/features/gear/verdict.ts`, the early junk in `src/screens/eval/useVerdictModel.ts`, the Worn
tab's «временно» in `src/features/worn/wearing.ts`, the trade's own filler in `src/features/trade/model/cands.ts`.
Rules live in: MODEL.md §1.6 (filler), §3 (`better` step 0), §4 (bar, outcome order), §6, §7 item 2; Help (Stopgap item,
"two useless substats" item); Wiki `How-verdicts-work` / `Как-считается-вердикт`, `Fast-cleanup` / `Быстрый-разбор`.
Tour: not needed (no new UI; the «Временно» tip still holds).

**Why.** Owner 2026-10-14: rating accessories, every one came out «Разобрать» while heroes had no accessory at all. On a
weapon or accessory the main stat at +10 is most of the value (accessory ATK% main: Legendary 65 %, Epic 58.5 %; typical
substats ≈ +15–25 % in total), so an empty slot loses far more than weak substats do. What decides is the empty slot, not
the grade ("Epic soft, Legendary strict" did not follow from the numbers).
**What we built.**
- A **filler**: a weapon or accessory whose main a build of the hero asks for in that slot (`fit` `stopgap`), below the
  stopgap bar (weak substats); its rank stays `no`. It passes for a hero only while that slot is empty — nothing worn,
  nothing passing in his pool (`eligibleIn`, `heroOutcome`). Stamp «Временно — надень на X»; once worn it is the hero's
  worn piece; the next weak piece for that slot is junk; when a better piece replaces it, it is «больше не нужна».
- `better()` step 0: more filled weapon/accessory slots wins — an empty slot loses to any piece, even at 0 points.
- Wear order: fillers after every other wear, so the hero who wants the piece is named, stamped and dressed by the batch
  first (review M1).
- While substats are only partly entered, the threshold verdict's early «Разобрать» waits («отметь остальные») when a
  roster hero's slot is empty (`fillerWaits`, review B1): a filler's outcome doesn't depend on substats.
- Trade: the receiver's own filler goes into his empty slot without the bar, as Redress puts it there (review m4).
- The Worn tab reads a worn filler as «временно» (22 worn pieces on the owner's roster).
**Owner decisions.** D1 an empty slot in the app is empty in the game. D2 the whole roster now, not waiting for a focus
team (`.x/0150-focus`). D3 a recommended weapon/accessory still outranks points. D4 feed beats a filler: when every wear is
a filler and a Breakthrough target exists now, the piece is «Фоддер». D5 only at stage «Развитие». D6 no new strings, no
«Что нового». D7 armor untouched. D8 (review Q1) heroes with no gear entered count as empty — they really are naked in
the game (56 empty weapon/accessory slots on the owner's roster). D9 (review Q2) parked pieces don't fill a slot here;
the trade offers them. D10 (review m1) «Только для X» in the D4 case keeps «Фоддер — но у X слот пуст: надень, пока нет
лучше»: the stamp gives the answer, the mode says what the piece does for X. D11 (2026-10-15, after the merge) a Legendary
whose item the hero's builds list but with a main they don't take is a filler too — its passive works with any main (owner's
Saint's Ring with CDMG RED% got «запас» for Primine, whose builds take it with DMG RED%, while her slot was empty).
**Hard parts.**
- "Empty" has to agree everywhere: `eligibleIn` (the pool), `heroOutcome` (`!info.layout[slot]`) and `better()`. A worn
  piece the class can't wear counts as empty in all of them (review m6).
- Gain alone put fillers first: a filler's dV is the whole piece, a recommended piece over a better stopgap can have
  dV ≤ 0 and win by rank (51 of 970 Legendary verdicts on the owner's roster named a filler hero first, M1).
- The early junk is decided before the roster verdict exists (`verdictOf` returns null on partial input), so the wait
  lives in the screen, not in the threshold verdict (`features/eval` can't import `features/gear`).
**Not built / dropped.** Armor (D7). A filler for the focus team only — waits for `.x/0150-focus`. Counting parked pieces
(D9).
**Checks.** Owner's roster probes (`probe/`): the M1 order 51 → 0 of 970; the B1 case (Epic HP% weapon, DEF 1 + HP 1)
waits instead of «Разбирай»; D4 material over a filler 15 of 970. Bench (`scripts/bench-pool.mjs`): no measurable change
(one verdict 5.7 → 5.8 ms). No in-game check pending.
