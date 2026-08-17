# Mensch ärgere Dich nicht® Kids — Rules Research & Specification

This document formalizes the rules implemented by the digital adaptation, separating
**verified edition facts**, **documented assumptions** and **optional rule variants**.
It is the reference for the in-game Classic preset and the Additional Rules menu.

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
| A1 | Die faces | 6 faces, one per track color: red, blue, green, yellow + neutral purple + black | — (edition-fixed, see note) |
| A2 | Track coloring | Repeating 6-color cycle over 40 fields; each player's segment starts with their own color | — (edition-fixed) |
| A3 | Entering the board | Roll **your own color** to move a pawn onto your start field; *assist*: while all pawns are still in the base, any color lets the first pawn out (prevents frustrating openings for young children) | `entryRule`, `entryAssist` |
| A4 | Passing | **Free passing** — pawns may be jumped over; only the landing field matters (mirrors the classic parent game) | `passingRule` |
| A5 | Start-field protection | No protected fields (classic parent game has none) | `protectedStarts` |
| A6 | Same-field stacking | Not allowed; landing on your own pawn is blocked | `friendlyStacking` |
| A7 | Extra rolls | None — the reconstruction has no „roll again" rules | `extraTurnOnCapture`, `extraTurnOnOwnColor` |
| A8 | Home lane | When no matching color lies ahead on a pawn's remaining track, it enters its home row (home matches every color); each further roll advances within home | — (edition-fixed) |
| A9 | Stuck turns | No legal move → up to 3 rolls per turn, then the turn passes | — (edition-fixed) |

> **Note on A1/A2:** the 6-color die is internally equivalent to a 6-step move
> (the next field of any given color is always 1–6 fields ahead), which matches
> the product's „no counting needed" positioning for age 4+. If the official
> rulebook is ever obtained, only the constants in `gameConfig.ts` and the
> defaults in `rulesConfig.ts` need adjusting — the engine logic is unaffected.

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
  captureEnabled: boolean;                // V4 / capture toggle
  protectedStarts: boolean;                // A5 (own start field is safe)
  friendlyStacking: boolean;               // A6 (own pawns may share fields)
  extraTurnOnCapture: boolean;             // A7
  extraTurnOnOwnColor: boolean;            // A7
  maySkipMove: boolean;                    // voluntary skip of a legal move
  pawnsPerPlayer: 2 | 3;                   // V2 / shorter matches
}
```

Invalid combinations are normalized automatically (e.g. extra turns after
capture are dropped when capturing is disabled; start protection is dropped
when capturing is disabled).

### 4.1 Presets

| Preset | Purpose | Differences from Classic |
| --- | --- | --- |
| **Classic** | The documented reconstruction (§3 defaults). Locked — cannot be edited. | — |
| **Custom** | Full control over every option; changes are flagged against Classic. | user-defined |
| **Quick Game** | Shorter matches. | any-color entry · extra roll after captures · 2 pawns per player |
| **Family Mode** | Easier for younger players; no hidden advantages. | protected start fields · voluntary skip allowed |

### 4.2 Semantics (authoritative)

- **Entry** — a base pawn may enter on `own-color` (or any color when
  `entryRule: 'any-color'`, or while all own pawns are in base when
  `entryAssist`). Entering lands on the player's own start field and may
  capture opponents standing there.
- **Movement** — the rolled color moves one pawn *forward to the next track
  field of that color* (1–6 fields). Only the first matching field counts.
- **Strict blocking** — with `passingRule: 'strict-blocking'`, every
  intermediate field between the pawn and its destination must be empty; a
  pawn may never jump over another pawn. Free passing ignores intermediates.
- **Capture** — landing on an opponent sends it (or, when stacking is on, *all*
  pawns of that color on the field) back to its base. With capturing disabled,
  landing on an opponent is simply illegal.
- **Protected starts** — with `protectedStarts`, only the owner of a start
  field may land on it; opponents can neither land on nor capture pawns there.
- **Home** — a pawn whose rolled color has no matching field ahead on its
  remaining track enters the home row (the home row matches every color);
  further rolls advance within the row; the last slot completes the pawn.
  Finished pawns never move again.
- **Extra rolls** — optionally granted after a capture and/or after rolling the
  player's own color, capped at 5 rolls per turn.
- **Victory** — the first player whose pawns are all home wins; the match ends
  immediately.

## 5. Board topology (engine-true)

- 40-field shared loop on the classic 11×11 cross layout, clockwise.
- Player segments of 10 fields; each segment begins with the player's colored
  start field.
- Each player: 3 base slots (corner), 3 home slots (arm center column), a
  decorative home mouth, one start field.
- Turn order: blue → yellow → red → green (clockwise, matching the segment order).

## 6. Engine guarantees

- The engine is pure TypeScript, fully separated from the 3D layer; it can run
  head-less (a simulation script drives complete matches without any rendering).
- Dice results are computed by a seeded, deterministic RNG **before** any
  animation starts; animations are presentation only.
- All pawn animations follow the exact field-by-field path produced by the engine.
- Every move passes a single authoritative validation
  (`getLegalMoves` / `validateMove`) used identically by humans and AI.
- The full event log (rolls, moves, captures, passes, turns, rule config, seed)
  is recorded per match and persisted with the match record, enabling
  deterministic reproduction of a completed match.

## 7. AI opponents

Three levels (easy / medium / hard) use exactly the same legal-move API as human
players — they can never bypass the rules engine. Hard additionally weighs
capture risk, victim progress and denial value.
