**English** · [Русский](Ограничения-и-авторы)

# Limitations and credits

## Where the data comes from

Builds are outerpedia's curated recommendations ([outerpedia](https://github.com/Sevih/outerpedia)): 265 builds for
95 characters. Fresh outerpedia data is checked every day and reaches the site after the checks; the app shows an
"Update" banner when you open it. App improvements install by themselves on the next launch.

## Limitations

- outerpedia's recommendations are mostly PvE; sets without builds may have niche PvP uses.
- You enter the piece by hand: the app can't see the game's inventory.
- The number of substats on an Epic (usually 3, the fourth from the first Reforge; some drop with 4) and how many
  copies T4 takes come from guides and in-game checks — the game data doesn't have them.
- Yellow and orange segments (from Reforge) aren't told apart: you enter all that are lit, 1–6, and the piece is rated
  as it is. Future Reforges don't count in the verdict.
- The class versions of Briareos/Gorgon have the same name: the class shows in the icon and the passive's suffix.
- The effect of EFF% and RES% substats isn't fully clear from the game data, so they're judged by build priorities only.

## Licenses and rights

This content is an unofficial fan creation. All related IP rights belong to VA Games Co., Ltd. Builds are the work of
outerpedia's authors; the tool is not affiliated with VA Games or with outerpedia.

Build recommendations, game tables and the flat/% formula come from outerpedia under the MIT license; the page also
bundles React (MIT) and Tabler Icons (MIT) — the stat, slot, set, element and class icons. Copyright lines and the
full license texts are in the app footer ("Licenses") and in
[`src/licenses.ts`](https://github.com/cotton-more/outerplane-gear-check/blob/main/src/licenses.ts).

Found a bug or a strange verdict — [open an issue](https://github.com/cotton-more/outerplane-gear-check/issues),
ideally with the item code.
