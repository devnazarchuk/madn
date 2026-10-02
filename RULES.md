# Mensch ärgere Dich nicht® Kids — Rules Research & Specification

This document formalizes the rules implemented by the digital adaptation, separating
**verified edition facts**, **documented assumptions** and **optional rule variants**.
It is the reference for the in-game Classic preset and the Additional Rules menu.

Ruleset version: **kids-v6** (revised after the gateway & finish-zone
review — the changes are listed in §2.4).

---

## 1. Edition identification

| Item | Value |
| --- | --- |
| Title | MENSCH ÄRGERE DICH NICHT® KIDS (children's edition of the German classic) |
| Publisher | Schmidt Spiele family of editions |
| Players | 2–4 |
| Age rating | 4+ |
| Play time | ~10–15 minutes (shorter than the classic edition) |
| Components | Cross-shaped board, 3 figures per player, one color die |

## 2. Research method & outcome

An attempt was made during development to retrieve the official printed
instructions of the Kids edition (web search engines, publisher download centre,
rules archives). **The official instructions could not be retrieved** — search
services were unreachable from the development sandbox and no verified rulebook
text was obtainable.

Following the project's own research policy („never silently invent official
rules"), every mechanic that could not be verified is:

1. explicitly flagged as an assumption below,
2. implemented as a **first-class configurable rule option** (see §4),
3. defaulted to the most defensible reconstruction, and
4. clearly labelled in the in-game About screen.

### 2.1 Revision notes (kids-v3)

The first reconstruction (kids-v2) used a six-color die/track with free passing,
an entry „assist" and teleport-style home entry. The gameplay review rejected
those choices as too permissive, and they are now **variants**, not defaults:
strict own-color entry, strict blocking, the four-color woven track and the
queue-style home row became the documented reconstruction.

### 2.2 Revision notes (kids-v4)

The board and finish mechanics were reworked for clarity and a cleaner
presentation (each change requested by the product review):

| Mechanic | kids-v3 (old) | kids-v4 (new) |
| --- | --- | --- |
| Start fields | center-corner cells of each arm (blue 0, yellow 10, red 20, green 30) | **beside each base corner** (blue 35, yellow 5, red 15, green 25) |
| Home stretch entry | turn from the center corner through a decorative mouth cell | **fed straight from the arm tip** — the closest straight-line cell directly opposite the color row |
| Home row direction | mouth first (inner → outer), one slot per roll | **outer cell first** (beside the tip), walking inward; the last cell (beside the goal mouth) is the golden **winning cell** |
| Home row movement | one slot per roll, any color | **the row is painted in the player's own color** — rolling the own color strides the pawn in and walks the row slot by slot; a foreign color never matches inside it |
| Finishing | last slot reached by any roll | `finishRule`: **exact** (must land on the winning cell exactly; rolls carrying past cannot move the pawn) or **flexible** (any roll carrying onto/past the cell completes it) |
| Bases | three slots in a straight line | **triangle formation** (apex toward the board center) — cleaner, takes less space |
| Stuck turns | up to 3 re-rolls, then pass | **skipped immediately** — the die is never re-rolled |
| Color-match turns | — | new toggle `ownColorToMove`: only the player's own color (or a star) moves them; any other color skips the turn |

### 2.3 Revision notes (kids-v5)

The die and the track pattern were reworked into the platform-die model, and
the star mechanic became an optional rule (each change requested by the
product review):

| Mechanic | kids-v4 (old) | kids-v5 (new) |
| --- | --- | --- |
| Die faces (default) | four player colors + **two golden STAR wilds** | four player colors + **a WHITE face and a BLACK face** — they correspond to the white & black platforms on the track |
| Track coloring | the four player colors only, 10 fields each | the four player colors (7 fields each) **plus 6 white + 6 black platforms**, perfectly interleaved (see §5) |
| Rolling white/black | — | walk ONE pawn to the **next white/black platform** — the same "next field of the rolled face" rule as a color roll (a long stride, 1–8 fields) |
| Star mechanic | always on (2 wild faces) | **optional Star Mode toggle** (default OFF): the white/black faces are replaced by two golden STAR wilds; a star counts as ANY of the six track colors (four colors, white or black) |
| Home stretch visuals | full-size track-style cells | the 3 player-colored cells stay, styled as **slightly smaller, semi-transparent finish platforms** — instantly distinguishable from regular track cells |
| Next-field pacing | every color 1–5 fields ahead | every face 1–8 fields ahead (the platforms are rarer) |

### 2.4 Revision notes (kids-v6)

The home stretch entry and the finishing zone were reworked into the strict
gateway model (each change requested by the product review):

| Mechanic | kids-v5 (old) | kids-v6 (new) |
| --- | --- | --- |
| Entering the home stretch | the own color **strides through the arm tip straight into the row** (the tip could be skipped over, even from the cell right before it) | the arm tip is the **golden ARROW GATEWAY — a mandatory stop**: a pawn may never skip over it into the row. **Step 1** — standing before the arrow, only the arrow cell's exact platform color (white/black) moves the pawn ONTO it. **Step 2** — standing on the arrow, only the OWN color (or a resolved star) steps onto the first home cell |
| Looping | a pawn on the tip could still match foreign fields on the virtual lap (exact: no move; flexible: completion) | **no looping** — from its own gateway a pawn can ONLY enter the row; foreign faces yield no move at all (`NO_MATCH_AHEAD`) |
| Finish cells | the golden winning cell was a **finish shelf** — finished pawns piled up on it | **strictly ONE pawn per finish cell** (always — even with `friendlyStacking` enabled for the main track): the golden cell keeps its FIRST finisher forever, later pawns park behind it — the row fills sequentially: golden → middle → outer |
| Victory | all pawns stand ON the golden winning cell | all pawns stand INSIDE the home stretch, one per cell, **packed against the golden winning cell** (`homeRowPacked`) |
| Finish rule | rolls carrying past the goal rejected/completed, measured from anywhere | applies **inside the row** only (the gateway stop voids every track-side stride past the arrow; `NO_MATCH_AHEAD`) |
| Own-color-only variant | worked with any die (the own color could stride into the row) | **requires Star Mode** — the standard die has no wild to roll the arrow's platform color, so the variant is dropped by normalization (otherwise pawns would strand forever before their gateway) |
| Home stretch visuals | slightly smaller platforms | **clearly smaller** finish platforms (socket 0.38 / inlay 0.30) — one private parking slot per pawn |

## 3. Verified facts vs. documented assumptions

### Verified with high confidence (V1–V4)

- **V1** — 2–4 players, ages 4+, faster and simpler than the classic edition.
- **V2** — Each player has **3 figures** (the classic edition uses 4).
- **V3** — The edition uses a **colored die** (not a conventional numbered die).
- **V4** — Capturing opponents is part of the game (it is the namesake mechanic
  of the franchise — „Don't get annoyed!").

### Documented assumptions (A1–A10)

| ID | Mechanic | Reconstructed default | Configurable as |
| --- | --- | --- | --- |
| A1 | Die faces | 6 faces: the four player colors once each + **a WHITE face and a BLACK face** (they correspond to the white & black platforms on the track). Variant (Star Mode, OFF by default): the two platform faces become golden STAR wilds | `starMode` |
| A2 | Track coloring | The four player colors (7 fields each) **plus 6 white and 6 black platforms**, woven per 10-field window from each start; perfectly interleaved, free of adjacent duplicates (see §5) | — (edition-fixed) |
| A3 | Entering the board | Roll **your own color** (or resolve a star to it) to move a pawn onto your start field. White and black are platform faces, not player colors — they never authorize an entry under the own-color rule (any-color entry and the first-pawn assist accept them) | `entryRule`, `entryAssist` |
| A4 | Passing | **Strict blocking** — no pawn may ever be jumped over; every intermediate field must be free | `passingRule` |
| A5 | Start-field protection | No protected fields | `protectedStarts` |
| A6 | Same-field stacking | Not allowed on the track; landing on your own pawn is blocked. **Inside the home stretch strictly ONE pawn per finish cell — always**, even when stacking is enabled for the main track | `friendlyStacking` (track only) |
| A7 | Extra rolls | None | `extraTurnOnCapture`, `extraTurnOnOwnColor` |
| A8 | Home stretch | The row is fed from the **golden arrow gateway** (the arm tip — a white/black platform): a **mandatory stop**. Step 1 — roll the arrow cell's exact platform color to move ONTO it; Step 2 — roll the OWN color (or a star) to step onto the first cell; no pawn may skip over the arrow or loop past it. The row is painted in the **player's own color** (3 matching cells leading to the star) and walked with own-color rolls; the golden winning cell keeps its first finisher forever, later pawns park behind it — one per cell. Victory when all pawns stand in the row, packed onto the golden cell | `finishRule` (exact / flexible — inside the row) |
| A9 | Stuck turns | No legal move → the turn is **skipped immediately** (never re-rolled) | — |
| A10 | Color-match turns | Any color moves (to the next field of that color). Variant: **only the own color (or a star) moves** — any other color skips the turn. Requires Star Mode (kids-v6): without a wild nobody could ever roll the arrow gateway's platform color, and the variant is dropped by normalization with the standard die | `ownColorToMove` (+ `starMode`) |

> **Note on A1:** a physical d6 needs six faces, but only four player colors
> exist. The standard game fills the two remaining faces with **WHITE and
> BLACK**, which correspond to the twelve platform cells on the track — every
> face of the die then has a board meaning, and each of the six faces shows up
> with probability 1/6. The optional **Star Mode** replaces those two faces
> with golden STAR wilds (the previous default): a star is resolved to any of
> the six track colors by the player (or AI) through the engine's
> `resolveStarFace`, which records the choice in the event log; while a star is
> unresolved **no move is legal** (`STAR_UNRESOLVED`). A star keeps its wild
> nature even under `ownColorToMove` — it may become ANY color, white and
> black included.

## 4. The rules configuration system

Every assumption above is a runtime option. The full schema (versioned,
Zod-validated, persisted with each match and with saved presets):

```ts
interface RulesConfig {
  version: 3;
  preset: 'classic' | 'custom' | 'quick' | 'family';
  entryRule: 'own-color' | 'any-color';   // A3
  entryAssist: boolean;                    // A3 (assist while all pawns in base)
  passingRule: 'free' | 'strict-blocking'; // A4
  captureEnabled: boolean;                 // V4 / capture toggle
  protectedStarts: boolean;               // A5 (own start field is safe)
  friendlyStacking: boolean;              // A6 (own pawns may share fields)
  extraTurnOnCapture: boolean;            // A7
  extraTurnOnOwnColor: boolean;           // A7
  finishRule: 'exact' | 'flexible';       // A8 (the golden winning cell)
  starMode: boolean;                       // A1 (Star Mode — optional wild die)
  ownColorToMove: boolean;                // A10 (color-match turns)
  maySkipMove: boolean;                   // voluntary skip of a legal move
  pawnsPerPlayer: 2 | 3;                   // V2 / shorter matches
}
```

Invalid combinations are normalized automatically (e.g. extra turns after
capture are dropped when capturing is disabled; start protection is dropped
when capturing is disabled).

### 4.1 Presets

| Preset | Purpose | Differences from Classic |
| --- | --- | --- |
| **Classic** | The documented strict reconstruction (§3 defaults). Locked — cannot be edited. | — |
| **Custom** | Full control over every option; changes are flagged against Classic. | user-defined |
| **Quick Game** | Shorter matches. | any-color entry · extra roll after captures · 2 pawns per player |
| **Family Mode** | Easier for younger players. | free passing · protected start fields · voluntary skip |

### 4.2 Semantics (authoritative)

- **Entry** — a base pawn may enter on `own-color` (or any color when
  `entryRule: 'any-color'`, or while all own pawns are in base when
  `entryAssist`). A rolled color that does not authorize the entry is rejected
  with `WRONG_DICE_COLOR` — the engine, not the UI, enforces this. Entering
  lands on the player's own start field and may capture opponents standing
  there.
- **Movement** — the rolled color moves one pawn *forward to the next track
  field of that color* (1–5 fields on the woven track). Only the first matching
  field counts.
- **Strict blocking** — with `passingRule: 'strict-blocking'` (the Classic
  default), EVERY intermediate field between the pawn and its destination must
  be empty of pawns (own or opponent); a pawn may never jump over another
  pawn. Free passing ignores intermediates. Blocking is never confused with
  capturing: an opponent on an intermediate field blocks the move but is never
  captured.
- **Capture** — landing on an opponent (destination only!) sends it (or, when
  stacking is on, *all* pawns of that color on the field) back to its base.
  With capturing disabled, landing on an opponent is simply illegal.
- **Protected starts** — with `protectedStarts`, only pawns standing on THEIR
  OWN start field are safe; a pawn squatting on a foreign start field enjoys
  no protection.
- **Home** — a pawn whose rolled color has no matching field ahead on its
  remaining track steps into its home row **at the mouth slot (slot 0)**;
  further rolls walk it one slot deeper (home matches every color); the last
  slot completes the pawn and it never moves again. The mouth must be free —
  walking home pawns deeper is what makes room for the queue behind them.
- **Star** — a star face resolves to one of the four colors, chosen freely
  from the *productive* colors (those that yield at least one legal move).
  One productive color auto-resolves; several offer the in-game picker. The AI
  enumerates every legal color × move pair, exactly like a human could.
- **Extra rolls** — optionally granted after a capture and/or after rolling the
  player's own color, capped at 5 rolls per turn.
- **Victory** — the first player whose pawns are ALL home wins; the match ends
  immediately.

## 5. Board topology & track pattern (engine-true)

- 40-field shared loop on the classic 11×11 cross layout, clockwise.
- Player segments of 10 fields; each segment begins with the player's colored
  start field (blue 0, yellow 10, red 20, green 30).
- The track pattern is **designed, deterministic data** (`engine/boardTrackConfig.ts`,
  `SEGMENT_TEMPLATES`): every arm repeats its own 4-color template
  `[owner, c1, c2, c3]` so the owner color stands at slots 0, 4 and 8:

  | Arm (loop) | Template | Resulting slots |
  | --- | --- | --- |
  | blue (0–9) | blue, red, green, yellow | blue, red, green, yellow, blue, red, green, yellow, blue, red |
  | yellow (10–19) | yellow, green, red, blue | yellow, green, red, blue, yellow, green, red, blue, yellow, green |
  | red (20–29) | red, blue, green, yellow | red, blue, green, yellow, red, blue, green, yellow, red, blue |
  | green (30–39) | green, yellow, red, blue | green, yellow, red, blue, green, yellow, red, blue, green, yellow |

  Guarantees (exhaustively searched — this exact assignment minimizes the
  longest possible move): each color exactly **10 fields**; **no two adjacent
  fields share a color**; the position-1 colors of the four arms form a
  permutation of all four colors; every next-field-of-color is **1–5 fields**
  ahead. Only the four player colors appear — no black or unrelated colors.
- Each player: 3 base slots (corner), 3 home slots (arm center column, mouth
  slot first), a decorative home mouth, one start field.
- Turn order: blue → yellow → red → green (clockwise, matching the segment order).
- The engine and the 3D layer share one board configuration
  (`boardTrackConfig.ts`: ids, loop indices, grid cells, world coordinates,
  colors, start/finish metadata). The visual color of a field never changes
  the color of a pawn standing on it.

## 6. Engine guarantees

- The engine is pure TypeScript, fully separated from the 3D layer; it can run
  head-less (a simulation script drives complete matches without any rendering
  — see `tests/ai.test.ts`).
- Dice results are computed by a seeded, deterministic RNG **before** any
  animation starts; animations are presentation only and never decide results.
- All pawn animations follow the exact field-by-field path produced by the engine
  (`calculateMovementPath`); illegal moves never animate.
- Every action passes the single authoritative validation pipeline
  (`engine/rules/`): ownership → dice result → star resolution → entry color →
  intermediate path → destination → home-lane boundary. It returns structured
  rejection codes (`WRONG_DICE_COLOR`, `PATH_BLOCKED`, `DESTINATION_OCCUPIED`,
  `CAPTURE_DISABLED`, `PROTECTED_FIELD`, `FINISH_LANE_BLOCKED`,
  `MOVE_EXCEEDS_FINISH`, `PAWN_NOT_OWNED_BY_ACTIVE_PLAYER`, `NO_DICE_RESULT`,
  `STAR_UNRESOLVED`, `PAWN_FINISHED`) which the UI translates into
  child-friendly messages. A rejected action mutates nothing.
- The full event log (rolls, star resolutions, moves, captures, passes, turns,
  rule config, seed) is recorded per match and persisted with the match record,
  enabling deterministic reproduction of a completed match.
- The full automated suite (`bun test tests/`) covers the entry color table,
  every blocking scenario, home-lane queue semantics, turn logic, star
  resolution and a complete head-less AI match.

## 7. AI opponents

Three levels (easy / medium / hard) use exactly the same legal-move API as human
players — they can never bypass the rules engine, including star resolution
(their choice is always one of the engine's productive colors). Hard additionally
weighs capture risk, victim progress and denial value.
