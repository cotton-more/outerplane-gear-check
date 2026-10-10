# Outerplane Gear Check

"Keep or salvage" helper for Outerplane gear: a React + TypeScript PWA, data from outerpedia.
Architecture, build and tests — [DEVELOPMENT.md](DEVELOPMENT.md). For players — `wiki/` (GitHub Wiki, EN/RU pairs) and README.

## Language

- Reply in English, even when the owner writes in Russian. Rephrase in Russian only when asked, then continue in English.
- English for everything developer-facing: docs, plans, code comments, commit messages.
- The product is bilingual: player-facing text (`src/i18n/ru.ts` + `en.ts`, wiki pairs, in-app Help) is always written in
  both languages. Existing Russian comments and docs may stay; write new ones in English.

## Commands

- `task test` — types and all tests; run before every commit.
- `task preview` — the site as it would be on Pages, from current code (`build/preview`); does not touch `docs/`.
- `task golden:update` — only when verdicts changed on purpose; then review the `test/golden.json` diff.
- `task tour:check` — after layout changes to the form or verdict: runs the tour in Chrome at five sizes and both themes.

## Rules

- Main use case: a phone in split screen next to the game, 280–420px wide; also landscape 812×375 and 420×390.
  Check layout at these sizes and in the dark theme.
- Code is organized by feature: `src/features/<feature>`, dependencies only point down — `shared` → `game` → `features` →
  `screens` → `app`; `screens/` composes layouts from different features. Which folder owns what — the "Where things are"
  table in DEVELOPMENT.md.
- Hero portrait, substat chip, checkmark, toggle, ✕, confirm dialog and item captions already exist — see "Shared
  elements" in DEVELOPMENT.md. When a piece of layout repeats a second time, move it there.
- UI strings only in `src/i18n/ru.ts` and `en.ts` (one `Texts` type). No Russian text elsewhere in `src` except comments
  (`test/i18n.test.ts`).
- Animations only in `src/styles/motion.css`: entrance only, plus a short pulse that marks an automatic choice
  (`m-pick`); ≤200 ms, `transform` and `opacity`; never animate inputs (grid, rows, slot, grade).
- `docs/` is built by the bot after push — never commit the build together with code.
- If something the player sees changed — update the Wiki in both languages and Help (`t.ui.help…`).

## Working folders (`.x/`)

Research, plans, reviews and handoffs go in `.x/NNNN-slug` (outside git; numbers step 10, a follow-up takes a number
in between). `.x/README.md` is the index:
- New folder — add a row right away: folder, one line on what it is about, status.
- Work moved — update the status: **active**, **deferred** (owner postponed it), **done** (shipped or answered). For
  done, say where it landed (merged commit or branch) and whether the folder can be deleted ("can delete" /
  "delete after merge").
- Don't delete folders yourself — the owner does, or asks you to.

## Tour (`src/tour/`)

- New player-visible feature — a tip in `Component.tour.ts` next to the component and an entry in `TIP_ORDER`
  (`src/tour/registry.ts`, display order), texts in `ru.ts` and `en.ts`.
  A utility component, or one the main tour already explains — an entry in `src/tour/coverage.ts` with the reason.
  `test/tour/tour.test.ts` fails on a component with neither and says what to do.
- Behavior a tip explains changed — `rev + 1`; a tour step changed (`core.ts`, `gear.ts`) — fix its text. If long-time
  players should hear about it — a tip with `news: true` and an entry in `tour.news`. No release date needed: "new" means
  what the player didn't have at first launch (`ogc.tour.known`).
- Moved or renamed an element with `data-tour` — move the anchor (`anchors.ts`).
- Propose tip text to the owner first, in both languages, and ask whether to show it as "What's new".
- End every reply that changes `src/app`, `src/screens`, `src/features`, `src/game` or `src/shared` with the line
  "Tour: added / updated (rev) / not needed — why". Put the same line in the commit body.
