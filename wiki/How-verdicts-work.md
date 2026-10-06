**English** · [Русский](Как-считается-вердикт)

# How verdicts work

## Armor

A "useful" substat is one in places 1–3 of the build's priority chain (4th place counts for ½, SPD in any place).
A tie like `SPD=CHD` shares one place, and the next stat comes after all of its stats: in
`CHC › ATK › SPD=CHD › DMG UP%`, DMG UP% is in fifth place. The best build among characters who wear the set is used.
When a parameter is in the main and can no longer roll as a substat on this piece, it takes no place in the chain.
The game never lets a substat repeat a main line, but flat and % are different stats to it, even though they change
one parameter: a flat RES main on boots and a RES% substat do sit on one piece, like flat DEF and DEF% (checked in the
game). So:

- for an accessory with main SPD, the chain `SPD › HP › CHC › ATK` is `HP › CHC › ATK` for its substats, and ATK
  counts in full; a flat EFF or RES accessory main takes no place — EFF% and RES% still roll as substats;
- weapons always have a flat ATK line: with an ATK% main the ATK axis is taken entirely, with DEF% or HP% it isn't —
  ATK% can still roll;
- armor mains are fixed by slot: helmet — HP%, chest — flat DEF, gloves — flat EFF and flat DEF, boots — flat RES and
  HP%. Such a main doesn't take the chain place — the other stat of the same parameter still rolls — but HP% on
  helmets and boots and flat DEF on chest armor and gloves never roll as substats — in the grid those cells are marked
  main. The mains come from the data per set and grade: if the game changes a set's main, the page recalculates on its
  own, and the update report gets a line about it;
- the exception is when the remaining stat gives the character nothing. That's almost always flat HP: of 78 builds
  with HP in the first three chain places it counts for only three (flat ATK and DEF count at least ½ for everyone).
  So on helmets, boots and HP%-main pieces the HP place of such characters is taken by the main: for Delta
  (`HP › CHC › CHD › SPD`) a helmet's substats are `CHC › CHD › SPD`.

- **Keep:** 3+ useful, or 2 useful if one of them is SPD with 2+ segments, **or the piece is worth 6+ points** for a hero (see "Points" below).
- **Epic is stricter:** Transistones aren't spent on Epics (outerpedia guide), and an Epic can't be Breakthrough fodder
  for a Legendary, so the key stats — the first two places of the chain — and their roll decide:
  - "Keep" — three useful, if one of them is SPD or a key stat, or 5+ segments on useful ones; or two key stats
    with 5+ segments on them — then the third can be anything;
  - "Stopgap" — a key stat with 2+ segments plus another useful one, 5+ together: wear it until a piece with the
    missing key stat drops; 1–2 of those per set and slot are worth keeping;
  - otherwise — "Dismantle".
- **The "all about attack" trap:** DMG UP% gives +2% per segment against +4% for ATK% and CHD, flat ATK (+40) is weaker
  than ATK% for characters with a high base, CHD without CHC works at half strength — such pieces look offensive, but
  they have no key stats.
- **A Legendary that fell short — "Dismantle":** its substats miss every build, so it isn't worth upgrading.
- **A Legendary with one odd substat out of four:** the verdict names it — a Transistone (Individual) rerolls just that
  substat and locks the other three.
- **A flat ATK/DEF/HP is marked** that didn't count while the % version is needed — the verdict asks you to check the
  % sign: a common mix-up is HP% on the piece but HP marked. Where the % version is the main (HP% on helmets and
  boots), there is no hint: only flat rolls as a substat there.
- **Sets that aren't in any outerpedia build** (Critical Hit, Resilience, Fortification, Mitigation, Lifesteal,
  Bursting, Pulverization, Weakness) — "rather dismantle", with an explanation.

## Points

With a roster every hero is looked at separately, and the verdict depends not only on the bar above but on **points**:

- **A point** is the unit of value. A segment of the first stat in the hero's chain = 1, later places less: 0.8; 0.65;
  0.5; 0.4… **Every** place of the chain counts, not only the first four. A perfect line (6 segments of the first stat)
  = 6 points. The main gives no points.
- **A good piece** for a hero passes the old bar or is worth 6+ points. Example: a helmet with ATK% 5 and CHC 5 is
  11.2 points for Rin; it didn't pass the old bar, now it's "Equip".
- **Sets** are in points too: a half of a set from the hero's builds (2 pieces) is worth the hero's best stat bonus for
  2 pieces.
- Then comes the outcome per hero: "Equip", "Keep for…", material, "Maybe", "Dismantle" ([Equipment](Equipment#the-stamp)).

## Flat ATK/DEF/HP vs %

Flat and % are different stats of one parameter: both can sit on one piece, and both count. A % substat multiplies
the character's own base, flat adds a fixed number: an ATK% segment is +4% of the base, a flat ATK segment is +40.
% always counts in full. The value of flat is calculated per character, with the same formula as on outerpedia: flat
counts in full if it gives 0.9+ of the % version, for ½ at 0.6+, otherwise not at all. Flat is never rated above %,
even when its segment is bigger with a base under 1000: % grows with the base (level, Awakening, Monad Gate), flat
doesn't. On average flat ATK ≈ 0.9 of ATK%, flat DEF ≈ 1.0 of DEF%, flat HP ≈ 0.6 of HP%; for a fully built character
(lv 120 and Quirks) flat is weaker. Level (100/120) and
Quirks are in the settings (More → Settings → Evaluation).

## Weapons and accessories

- **A Legendary with a passive from the builds and the right main stat** — keep.
- **Same passive, wrong main stat** — fodder for Breakthrough (the main stat can't be rerolled).
- **Stopgap:** an item without the needed passive (any Epic, a Legendary not in the builds, or "not in the list") with
  a main stat characters want in that slot, **and a good roll**: for an Epic — 3 useful, or 2 useful with 5+ segments;
  for a Legendary — 3 useful. Otherwise — "Dismantle". Keep the best 1–2 per needed main stat.
- The **"Endgame"** stage in the settings turns stopgaps off: everything not recommended goes to dismantle. The
  exception is a brand-new Legendary "not in the list": until it's in the outerpedia data, it gets "Maybe".

## Segments — as they are

Segments are how many are lit on the substat in the game, 1–6: yellow and orange together. A fresh drop has up to 4;
after Reforge there can be more. The verdict and the comparison with your characters' pieces take the piece as it is:
Reforges still ahead don't count, and the verdict doesn't guess "what if it rolls". Did a Reforge? Fix the piece or
enter it again ([Upgrading](Upgrading#reforge)).
