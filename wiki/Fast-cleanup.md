**English** · [Русский](Быстрый-разбор)

# Fast inventory cleanup

1. **Everything below 6★ and below Epic** — dismantle right away, no need to enter it.
2. In the game, **sort the inventory by date received**: consecutive pieces usually come from one run, and the set
   stays from the previous piece.
3. **Epic armor:** pick the slot and set and look at the grid. If 0–1 bright stats are on the piece — dismantle
   without entering anything: "Keep" and "Stopgap" almost never happen then. For
   narrow sets like Attack and Critical Strike this filters out about half the pieces; for Speed, Immunity and
   Swiftness almost everything is bright — enter those.
4. After **two useless substats** on an Epic the verdict appears right away — no need to enter the third.
5. **"T4"** next to the set or item — only if the piece is already at Breakthrough T4; a fresh drop is T0, leave it off.
   **"Fodder"** — this piece is the material: the verdict says which piece of a hero below T4 to feed it to now, or
   keeps it in reserve for a future strong one.
6. **"Keep"** — lock it so you don't dismantle it by accident. **"Stopgap"** — wear it until you find better.
7. **Epic Breakthrough** takes only the same piece: an Epic of the same set and slot, substats don't matter. One piece — one
   step: "Fodder" says where to feed this one now, or keeps it in reserve — up to four per hero (exactly T0 → T4), at
   most eight of one kind for everyone.
8. **Epic weapon and accessory:** in "Endgame" — dismantle; in "Progression" the main stat first: if its button is
   grey, no one needs that main — dismantle. They are stopgaps: no Breakthrough, spare copies go to dismantle.
9. **Legendary:** the verdict shows which to upgrade; with weak substats — dismantle.

<img src="https://raw.githubusercontent.com/cotton-more/outerplane-gear-check/main/screenshots/en/5-early-junk.png" width="360" alt="Dismantle after just two substats">

Two useless substats — the verdict comes right away, no need to enter the third.

Evaluation settings (Progression / Endgame, level and Quirks) are in More → Settings → Evaluation.

## A whole filter at once: Batch

Many pieces from one filter in the game — one set, or weapons, or accessories? Rate them as a **batch**: the app sees
the whole group before deciding, then walks you through the inventory **step by step**, so the numbers in the game and
in the app never drift apart.

**In the game:** the filter is one armor set (any slot), or weapons, or accessories, and **one grade**; **show worn pieces**;
sort by date received. The batch keeps the same filter: after the first piece, other slots (armor ↔ weapon ↔
accessory) and other sets can't be picked on the form, and the grade is the first piece's — start a new batch for
anything else. Both grades? Legendary first, then Epic: the second batch then sees what the first one put on.

1. **"Batch"** — next to "Next item" on a computer, in More on a phone; it's there once you've marked your heroes
   (the plan is about them). A strip "Batch · 0 · List ▸ ✕" sits above the form; there is no verdict on the way.
2. Enter the pieces **in a row, as the game lists them**:
   - a usual piece — as always, "Add · #N" (not all substats — not added);
   - a **worn** one (E mark) — "E · worn" and pick the hero: the app knows its substats — the list shows it as a usual
     piece with the hero's round portrait and name under it;
   - a **locked** one (a lock means someone's reserve) — "🔒 · set aside" with the slot on the form.

   After "Add" the form gets ready for the next piece of the list: substats, main and item name clear, the grade
   and set stay the batch's, for armor the slot has to be picked again. Until then the slot buttons are highlighted,
   and "Add" says: "Pick the slot first — as on the piece in the game".

   Worn and locked entries hold the numbers: without them "No. 7" in the app and in the game would differ. "List ▸" —
   fix a piece (tap it, then "Save #N") or remove it (✕).
3. **"Plan it"** — a line per piece: "Equip on Caren", "Equip on Caren — instead of the helmet", "Set aside for Rin",
   "Feed to #4", "Feed to Kappa's helmet", "Dismantle". A piece the plan takes off a hero gets its own line right
   under it ("Caren's removed helmet …"). One target takes up to four pieces; a new piece fed four times reaches T4
   ("· T4 after feeding"). Four feeds take a worn piece to T4 too — "Record the plan" marks "T4" itself; fewer than
   four — once it's at T4, tap "T4" on its card. A piece that looks like one already set aside says so; if you have two of them, tap "It's
   a different one". **"Don't take"** on a line — plan it again without that hero. Decide **"Maybe"** right away:
   "Set aside" or "Dismantle" — the walk waits for it.
4. **"Walk ▸"** — steps by game screen, in an order where the numbers don't drift (equipping and taking off don't move
   a piece — it only gains or loses its E):
   1. **Equip — at the heroes:** "Caren → helmet → No. 7 in the helmet list · #24" — the number in the hero's list of
      that slot (in the game it holds only helmets, with the same filter), #24 — this piece in the batch; the class
      icon by the name and the name's colour (the element) help find the hero with the game's roster filters. Below, in
      a column, the substats as the game shows them after a tap: "LV 3 Crit Chance +9.0%" — check them.
   2. **Lock** what you keep: "Lock: row 3, no. 1" (10 pieces per row), below — what it is and for whom: "#21
      Patience gloves — for Gnosis Domine" (set aside to wear when the set comes together), "… (reserve)" —
      Breakthrough material, "… — Maybe, set aside", and the substats to check. A lock means "in someone's Pool":
      whose — on the hero's card, the Pool tab.
   3. **Breakthrough:** "Caren's helmet → Breakthrough: up to 4 from the list, any — dismantle what doesn't fit" (the app doesn't
      know the exact tier below T4, the game takes no more than it needs) — material is interchangeable, worn and
      locked pieces aren't in that list, so a set-aside piece can't be fed by mistake; "first unlock 2 set-aside" — when the plan feeds a reserve. Below —
      which piece it is and each piece of feed: "#9 Noblewoman's Guile · DEF% · HP% 3, …". A Legendary weapon
      or accessory takes only copies of the same item, so heroes get different amounts of feed.
   4. **Dismantle — in one selection, last:** after the Breakthrough, so nothing meant as feed is dismantled. Each piece on a line — its batch number, name and main (Epic blue, Legendary
      red) and substats: "#18 Sublime Melody · HP% · DMG UP% 3, EFF% 1, …". Pieces locked in step 2 can't be
      dismantled even by mistake; feed a Breakthrough didn't take — dismantle it too.

   Tick steps ✓ — the walk is saved, even if the phone unloads the page. Substats don't match — the batch and the game
   list differ: fix it in "List ▸".
5. At the end **"All done — Record the plan"** and "Record" in the question "All done in the game?": equips and
   set-asides are recorded at once ("Batch recorded: 3 equipped, 2 set aside."), "Undo" reverts all and brings the
   batch back. Recording happens only at the end of the walk — after you've done it all in the game.

The plan and the walk take the whole screen: there's nothing to enter meanwhile. Back to entering — "← To the list".
The add button shows the piece's slot ("Add · #7 · gloves") — easier to notice the slot left from the previous piece.

The batch is kept until "Record the plan" or ✕. Pieces worn by heroes don't move between them — that's
[Trading gear](Trading-gear).
