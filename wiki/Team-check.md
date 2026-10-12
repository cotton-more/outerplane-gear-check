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

## EFF vs RES

With a boss, under the team — the block **"EFF vs RES 288"**: a row for everyone who needs EFF (as on the hero card) —
their EFF (with "≈" until the game's number is typed), how much is missing to RES + 1 and the chance the boss doesn't
resist the debuff: "Tamara ≈ 233 −56 64 %". EFF above RES — ✓ and 100 %: the debuff always lands. Below it the boss
resists about d / (d + 100), where d is the gap: −10 — 9 %, −50 — 33 %, −100 — half. The skill's own chance ("50 % to
inflict") is separate; EFF doesn't change it. Heroes whose EE gives EFF get a hint until the game's number is typed:
"EE gives EFF ×2 — type EFF from the game ▸". Tap a row — the same "EFF for …" sheet as on the card
([Equipment](Equipment)); the number is kept on the hero. The row shows EFF in battle: the card's number plus the element node in Quirks (Light and Dark +5 %, Earth,
Water and Fire +7 % when the hero's element beats the boss's; with the "Quirks" setting) and a teammate's transcend that
gives EFF to the whole team (Iota, Dahlia, Alice… +3/+6 %; one, the strongest). EFF counts the stars tried on the spot. Not counted: EFF buffs
and RES-down in battle (Akari S2), guild raid geas.

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
