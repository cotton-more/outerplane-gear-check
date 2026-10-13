**English** · [Русский](Проверка-команды)

# Team check (alpha)

> Alpha: a new feature — it may be wrong and will still change.

Some skills only work while a status is on the hero or on the enemy: Veronica's S1 calls a Dual Attack only while her
Defense is increased, Philia's S2 hits harder on a Shocked target. The «Team» screen shows which of these conditions
nobody in your team covers, and who from your roster would. On top you can pick a boss: its RES and immunities at a
stage, outerpedia's guide teams and a team of your own per boss.

## How to open

The «Team» tab in the header; on a phone — «More» → «Team». Only heroes from your roster can be picked.

## Picking the team

- Four spots in a row. Tap «+» — a window with the roster list and a name search; tap a hero to put them there.
- On a hero's spot: the portrait — put another hero there; the **stars** at the bottom — a window with
  six stars like the game's transcend, tap the N-th to set ★N; ✕ in the corner — empty the spot. A hero comes in with the
  stars from their card. In the window you can try more: the stars below the card's are locked, the report
  counts the higher ones, but only in this spot — nothing is saved. To change a hero's stars, go to their
  [card](Characters-and-guild-code).
- Stars matter: some skills and passives open only at ★3–★6 (Burst 2 at ★3, Burst 3 at ★5, transcend passive levels at
  ★3–★6), both for what a hero needs and for what they give.

## Who to add

The hero window (tap «+» or a portrait) starts with suggestions:

- **Fit the team** — roster heroes recommended together with yours in outerpedia's guide teams (bosses, guild raid,
  adventure license): «in outerpedia teams: with Kanon ×3, with Aer ×5». A hero listed as an alternative for the same slot
  doesn't count as a partner. In green — a team skill that starts working with this hero: «Kanon: S1: Priority starts
  working»; such heroes rank higher.
- With an empty team — **Most often in outerpedia teams**: «in 49 outerpedia teams».
- Six are shown, «N more» opens the rest; below — everyone else by name. The search filters both.

## Boss

The row above the spots: «Boss: Meteos · 13 · RES 288 ▾». Tap it to open the boss window.

- **The list of fights:** Special Request, Dimensional Singularity, Joint Challenge, Guild Raid (the main boss and its
  subs under the raid's name). A fight running now is on top, with its end date. A name search. On the right — RES at
  the top stage.
- **Stage:** Special Request and Guild Raid — a number, Joint Challenge — the difficulty, Singularity — the rank in two
  rows: the letter and the pluses. A new boss opens at its top stage; the stage you pick is remembered per boss.
- **RES and SPD** of the boss at that stage. RES counts the Challenge tree in Quirks as open (the four «Reduced Boss
  Resilience» nodes, −20 %), like outerpedia's guides: if yours are closed, the boss has more RES in your game (Meteos 13:
  360 instead of 288).
- **Immune to:** «Crowd control» stands for taunt, freeze, stun, petrify, silence and golden curse together (nearly
  every boss has them; tap it for the list), then the rest: «Reduced Defense», «Buff Removal»…
- **outerpedia guide ↗** — the guide's page. **Other boss** — the list again, **No boss** — clear it.

## Team from the guide

If outerpedia's guide has teams for this stage, **Fill from the guide** appears under the spots. On each spot it puts your
first hero among the guide's alternatives, in the guide's order: no Luna — Veronica goes in. A hero already on another
spot isn't put twice. A spot with nobody from your roster stays empty. It fills the whole team; «Undo» in the message
brings the old one back.

Several teams in the guide (Guild Raid) — first a window «Which guide team?»: each shows whom it would put (faded — not in
your roster), «3 of 4 owned» and who is missing. A team with nobody you own can't be picked. Some teams are a core of two
heroes — they fill two spots only.

With a boss, a spot's window starts with **From the guide for this spot** — your heroes among the guide's alternatives
for that spot; below, one line names the guide's heroes you don't have. Singularity guides have no teams — the window
suggests as without a boss.

The guides' notes, tips and requirements (speed, effectiveness) are not copied into the app: they are in English only.

## Turn vs the boss

With a boss, under the team — the block **"Turn vs the boss"**: a line on the left with a stopwatch, and the team and the
boss in the order of the first turn, top to bottom. The boss is the red row in its place, with its SPD and RES.

- **Who moves first.** At battle start each fighter's turn gauge stands at SPD × 100 / the fastest SPD in the fight, plus
  a hidden random head start of up to 5 % (outerpedia's Stats guide). So a hero above the boss surely moves before it,
  a hero below it — after it. A dashed row with ⏱ "first 74%" — luck decides: a hero at 0.95 to 1.053 of the boss's SPD
  may move before or after it (boss 276: from 263 to 290 is luck, 291 and more — surely first). Only the first turn is
  shown: after it, skills, buffs and pushes decide.
- **SPD** is what the app knows: the hero's base (level, Quirks), SPD substats, an SPD accessory, the Speed set and the
  SPD bonus from allies' transcend — Dianne, Mene, Liselotte, Viella… give the whole team +5 at ★4–5 and +10 at ★6, and
  several of them add up (the turn order counts it, the hero's stat screen doesn't show it; the row says "SPD 148 (+10
  allies' transcend)"). The EE, talisman and battle buffs are invisible — in the game the hero may be faster.
- **Who should move first.** Not everyone: only a hero whose first move does something before the boss acts — on turn 1
  only S1 is ready (S2 and S3 start on cooldown), so the app looks at S1 (and at S2/S3 that are ready at once): it lowers
  the boss's ATK, SPD or crit, pushes it back on the turn gauge, taunts it, stuns it, or shields the team, raises its DEF,
  cuts the damage it takes. An effect the boss is immune to at this stage doesn't count (Meteos ignores taunt). For the
  others SPD is just a stat of their chain — a damage dealer doesn't need to beat the boss to its first move.
- **EFF.** Heroes who need EFF (as on the hero card) also show it, with the chance the boss doesn't resist the debuff:
  "✓ 100%" — EFF above RES, the debuff always lands. Below it the boss resists about d / (d + 100), where d is the gap:
  −10 — 9 %, −50 — 33 %, −100 — half. The skill's own chance ("50 % to inflict") is separate; EFF doesn't change it.
  The row shows EFF in battle: the card's number plus the element node in Quirks (Light and Dark +5 %, Earth, Water and
  Fire +7 % when the hero's element beats the boss's; with the "Quirks" setting) and a teammate's transcend that gives EFF
  to the whole team (Iota, Dahlia, Alice… +3/+6 %; one, the strongest). EFF counts the stars tried on the spot.
- **Tap a row** — it opens in place: the SPD, and for a hero who should move first — why ("Moving before the boss
  matters: S1 lowers the boss's ATK.") and how much SPD surely moves them first ("SPD 280 — to surely move before the
  boss: 291 (+11)"); if even the fastest gear they could get gives no chance — "Out of reach with your gear: 223 at most."
  The others get the state alone ("SPD 141 — moves after the boss."). Then how much EFF is short of RES + 1 and "EFF from
  the game ▸" — the same "EFF for …" sheet
  as on the card ([Equipment](Equipment)); the number is kept on the hero. Heroes whose EE gives EFF get "EE gives EFF ×2
  — type EFF from the game ▸" there until the game's number is typed.

Not counted: EFF and SPD buffs and RES-down in battle (Akari S2), guild raid geas (they can change the boss's SPD too).

## Pick gear

The **team trade** lives here: the heroes on the spots swap gear among themselves and take from others — what other heroes
wear and their own spare (other heroes' spare is never taken; see [Trading gear](Trading-gear)).

- **The build** under each hero's stars — what to gear them for: "stats" (the default, all stats and sets of their builds)
  or one of their builds' sets (the set icon and how many pieces: Speed ×4). Tap it to change. A hero with a
  [pinned set](Equipment#pin-a-set) has a gold outline and a pin: the pin is their build, changed on their card. The builds
  are kept with the team on this device (one team per boss and one without a boss).
- **"Pick gear"** — for two to four heroes with builds. With one, it opens the usual trade for that hero. A hero without
  builds on outerpedia stays out — one line under the button says so.
- **The plan** opens in a window — the same walk with ticks as the one-hero trade (see [Trading gear](Trading-gear#the-plan-is-a-walk)):
  per hero what to wear, from whom, how much stronger, "Keep as it was", empty slots with "Enter" / "Leave", the order
  under each hero; then "At the end — replacements": the old pieces go to whoever gave theirs, or are parked. **Done** —
  once every line is ticked: the pieces move in the app as you moved them in the game; "Undo" in the message.
- **With a boss the trade also raises EFF** for the heroes who need it — up to the boss's RES + 1, where the debuff
  always lands; the EFF is the one the turn timeline shows (the card's EFF + what battle adds). Not at any price: a little
  stats are given for EFF, EFF above RES + 1 is worth nothing and goes to whoever lacks it; a piece the hero can't use won't
  come for EFF, and a recommended accessory stays. A hero whose EFF changes gets a row under the stats:
  "EFF ≈ 184 → 222 · 93%" — EFF before and after and the chance the debuff lands after the trade (✓ — above RES; «≈» — the
  game's EFF isn't typed). The gain in points stays the stats' own. A hero who can't reach the target gets as close as a few
  points allow — the chance on the row says how far it is.
- **With a boss the trade also raises SPD** for the heroes who should move first (see above) — up to the SPD where they
  surely move before the boss (boss 211 → 223). Each missing SPD substat roll (3 SPD) costs about as much as one roll of
  the hero's first stat, so the trade reaches for SPD while it's cheap; SPD above the target keeps its usual value (more
  turns later in the fight). If even the fastest gear gives no chance, the trade doesn't try. The hero gets a row:
  "SPD 138 → 232 ✓" or "SPD 201 → 214 · 74%" — SPD before and after (with the allies' transcend) and the chance to move
  first. A hero with both goals (Iota: EFF and SPD) gets both rows; the trade balances them.
- **Another boss, stage, team or stars on a spot** is a new calculation: the walk starts over with its ticks reset.
- **Worn gear is never kept with the team:** the trade and the turn timeline always read what the app records as worn now.

## The report

Only heroes with something to say are listed.

- Each line starts with what the status switches on: «S1: Dual Attack», «S1 and S3: more damage», «S2: hits all
  enemies».
- **⚠ S1: Dual Attack — X: nobody in the team gives it.** A skill needs the status and nobody gives it.
- **⚠ S1: Dual Attack — X only from own S3, on cooldown (4) at battle start.** The hero gives the status
  herself, but later than the skill that needs it. The number is the cooldown the game shows on the skill icon at the
  start of battle. If the only own source is a Burst, the line says so.
- **Would give it:** roster heroes who give the status (class icon in the element's colour and the name, so you can find
  them with the game's filters). «from ★6» — only from those stars. A team hero whose stars are too low comes first.
  Six are shown, «N more» opens the rest.
- **✓ S1: Dual Attack — X from Kappa, Liselotte** — a quiet line when an ally covers the need. A hero who covers herself in time (her
  S1 gives what her S2 needs) gets no line.

## What is not counted

- Chances: a 50% buff counts as a source.
- Turn order and speed.
- Class passives and transcend "+N% ally DEF" passives: in the game they don't give the status (checked in game on
  Veronica). Chain and Dual Attack procs and effects that fire on an event («when hit», «on death») don't count either.
- Enemy buffs (Fenrir's «target has a Barrier») and boss immunities.
- Statuses only the hero herself can give (her own mechanic, like Beth's Retribution's Dominion): nothing for the team
  to change, so no line.

The team is kept on this device — one per boss and one without a boss; the last boss and its stage too. It is not in
the backup. Stars tried on a spot are not saved.

The skill data comes from outerpedia's game tables and updates with the rest of the data.
