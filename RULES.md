# Mensch ärgere Dich nicht® Kids — Rules Research & Specification

This document formalizes the rules implemented by the digital adaptation, separating
**verified edition facts**, **documented assumptions** and **optional rule variants**.
It is the reference for the in-game Classic preset and the Additional Rules menu.

Ruleset version: **kids-v3** (revised after the gameplay-correction review — the
changes are listed in §2.1).

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

| Mechanic | kids-v2 (old default) | kids-v3 (new default) |
| --- | --- | --- |
| Track colors | 6 colors incl. neutral purple/black | only the four player colors, woven (see §5) |
| Die | 6 faces, one per track color | 4 color faces + 2 golden STAR wilds |
| Entry | own color, but ANY color while all pawns in base (assist ON) | strictly the OWN color (star wilds included); assist is an opt-in variant |
| Passing | free (pawns may be jumped over) | **strict blocking** — no pawn may be passed; free passing is a variant |
| Home row | teleport to the first free slot | queue: enter at the mouth slot, walk one slot per roll |

## 3. Verified facts vs. documented assumptions

### Verified with high confidence (V1–V4)

- **V1** — 2–4 players, ages 4+, faster and simpler than the classic edition.
- **V2** — Each player has **3 figures** (the classic edition uses 4).
- **V3** — The edition uses a **colored die** (not a conventional numbered die).
- **V4** — Capturing opponents is part of the game (it is the namesake mechanic
  of the franchise — „Don't get annoyed!").

### Documented assumptions (A1–A9)

| ID | Mechanic | Reconstructed default | Configurable as |
| --- | --- | --- | --- |
| A1 | Die faces | 6 faces: the four player colors once each + **two golden STAR wilds** (a star lets the player pick any color) | — (edition-fixed) |
| A2 | Track coloring | The four player colors only, woven per arm from repeating 4-color templates; perfectly balanced (10 fields per color) and free of adjacent duplicates (see §5) | — (edition-fixed) |
| A3 | Entering the board | Roll **your own color** (or resolve a star to it) to move a pawn onto your start field | `entryRule`, `entryAssist` |
| A4 | Passing | **Strict blocking** — no pawn may ever be jumped over; every intermediate field must be free | `passingRule` |
| A5 | Start-field protection | No protected fields | `protectedStarts` |
| A6 | Same-field stacking | Not allowed; landing on your own pawn is blocked | `friendlyStacking` |
| A7 | Extra rolls | None | `extraTurnOnCapture`, `extraTurnOnOwnColor` |
| A8 | Home lane | When no matching color lies ahead, the pawn steps into its home row **at the mouth slot**; each further roll walks it one slot deeper; the last slot finishes it forever | — (edition-fixed) |
| A9 | Stuck turns | No legal move → up to 3 rolls per turn, then the turn passes | — (edition-fixed) |

> **Note on A1:** a physical d6 needs six faces, but only four colors exist on
> the track. The two extra faces are golden STAR wilds — the most balanced
> option (each color 1/6, star 1/3) and a common kids'-game pattern. A star is
> resolved to one of the four colors by the player (or AI) through the engine's
> `resolveStarFace`, which records the choice in the event log; while a star is
> unresolved **no move is legal** (`STAR_UNRESOLVED`).

## 4. The rules configuration system

Every assumption above is a runtime option. The full schema (versioned,
Zod-validated, persisted with each match and with saved presets):

```ts
interface RulesConfig {
  version: 1;
  preset: 'classic' | 'custom' | 'quick' | 'family';
  entryRule: 'own-color' | 'any-color';   // A3
  entryAssist: boolean;                    // A3 (assist while all pawns in base)
  passingRule: 'free' | 'strict-blocking'; // A4
  captureEnabled: boolean;                 // V4 / capture toggle
  protectedStarts: boolean;               // A5 (own start field is safe)
  friendlyStacking: boolean;              // A6 (own pawns may share fields)
  extraTurnOnCapture: boolean;            // A7
  extraTurnOnOwnColor: boolean;           // A7
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
