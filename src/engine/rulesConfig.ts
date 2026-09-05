import { z } from 'zod';

/**
 * ============================================================================
 * RULES CONFIGURATION — versioned, validated, persisted.
 * ============================================================================
 * One authoritative schema drives:
 *   • the engine (legal moves, captures, extra turns),
 *   • the Additional Rules editor (metadata below),
 *   • the dynamic in-game rules reference (describeRules),
 *   • the saved-preset system (persistence.ts).
 *
 * "Classic" is the documented reconstruction of the Kids edition (see
 * RULES.md §3); every option that could not be verified against the official
 * instructions is configurable here instead of being hard-coded.
 */

export type RulesPresetId = 'classic' | 'custom' | 'quick' | 'family';
export type EntryRuleId = 'own-color' | 'any-color';
export type PassingRuleId = 'free' | 'strict-blocking';

export interface RulesConfig {
  /** Schema version — bump when options change. */
  version: 1;
  preset: RulesPresetId;
  /** A3 — required color to leave the base. */
  entryRule: EntryRuleId;
  /** A3 assist — while all own pawns are in the base, any color lets one out. */
  entryAssist: boolean;
  /** A4 — free passing (only landing matters) or strict blocking. */
  passingRule: PassingRuleId;
  /** V4 — landing on an opponent sends it home. */
  captureEnabled: boolean;
  /** A5 — a pawn on its own start field cannot be landed on / captured. */
  protectedStarts: boolean;
  /** A6 — own pawns may share one field ("pawn towers"). */
  friendlyStacking: boolean;
  /** A7 — extra roll after a capture. */
  extraTurnOnCapture: boolean;
  /** A7 — extra roll after rolling your own color. */
  extraTurnOnOwnColor: boolean;
  /** Voluntary skip of a legal move (Skip button in the HUD). */
  maySkipMove: boolean;
  /** V2 — 3 for the edition, 2 for shorter matches. */
  pawnsPerPlayer: 2 | 3;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

// (Schema is declared after CLASSIC_CONFIG below so the classic-preset
// refinement can compare against it.)

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** The documented Kids-edition reconstruction (RULES.md §3) — strict edition. */
export const CLASSIC_CONFIG: RulesConfig = {
  version: 1,
  preset: 'classic',
  entryRule: 'own-color',
  entryAssist: false,
  passingRule: 'strict-blocking',
  captureEnabled: true,
  protectedStarts: false,
  friendlyStacking: false,
  extraTurnOnCapture: false,
  extraTurnOnOwnColor: false,
  maySkipMove: false,
  pawnsPerPlayer: 3,
};

/** Shorter matches: any-color entry, extra roll after captures, 2 pawns. */
export const QUICK_CONFIG: RulesConfig = {
  ...CLASSIC_CONFIG,
  preset: 'quick',
  entryRule: 'any-color',
  extraTurnOnCapture: true,
  pawnsPerPlayer: 2,
};

/** Easier for younger players: hop over others, safe starts, skipping. */
export const FAMILY_CONFIG: RulesConfig = {
  ...CLASSIC_CONFIG,
  preset: 'family',
  passingRule: 'free',
  protectedStarts: true,
  maySkipMove: true,
};

export const PRESET_ORDER: RulesPresetId[] = ['classic', 'quick', 'family', 'custom'];

export const rulesConfigSchema = z
  .object({
    version: z.literal(1),
    preset: z.enum(['classic', 'custom', 'quick', 'family']),
    entryRule: z.enum(['own-color', 'any-color']),
    entryAssist: z.boolean(),
    passingRule: z.enum(['free', 'strict-blocking']),
    captureEnabled: z.boolean(),
    protectedStarts: z.boolean(),
    friendlyStacking: z.boolean(),
    extraTurnOnCapture: z.boolean(),
    extraTurnOnOwnColor: z.boolean(),
    maySkipMove: z.boolean(),
    pawnsPerPlayer: z.union([z.literal(2), z.literal(3)]),
  })
  .superRefine((cfg, ctx) => {
    // A classic preset must be identical to the documented reconstruction.
    if (cfg.preset === 'classic') {
      for (const [key, value] of Object.entries(CLASSIC_CONFIG)) {
        if (key === 'preset' || key === 'version') continue;
        if ((cfg as Record<string, unknown>)[key] !== value) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `Classic preset must keep the documented value for ${key}`,
          });
        }
      }
    }
  });

export const PRESET_META: Record<
  RulesPresetId,
  { title: string; tagline: string; locked: boolean }
> = {
  classic: {
    title: 'Classic Rules',
    tagline: 'Strict edition rules — your own color starts, nobody may be jumped over.',
    locked: true,
  },
  quick: {
    title: 'Quick Game',
    tagline: 'Shorter matches — leave the base with any color, extra roll after captures, 2 pawns.',
    locked: false,
  },
  family: {
    title: 'Family Mode',
    tagline: 'Friendlier for the youngest — hop over others, safe start fields, skipping moves.',
    locked: false,
  },
  custom: {
    title: 'Custom Rules',
    tagline: 'Pick and mix every mechanic yourself.',
    locked: false,
  },
};

// ---------------------------------------------------------------------------
// Normalization & diffing
// ---------------------------------------------------------------------------

/**
 * Parses unknown data into a valid config; drops nonsensical combinations so
 * the engine can trust the result. Falls back to Classic when unparseable.
 */
export function normalizeRulesConfig(input: unknown): RulesConfig {
  const base = CLASSIC_CONFIG;
  if (!input || typeof input !== 'object') return { ...base };
  const raw = input as Record<string, unknown>;
  const merged = { ...base, ...(raw as Partial<RulesConfig>) } as RulesConfig;
  merged.version = 1;
  // Drop nonsensical combinations:
  if (!merged.captureEnabled) {
    merged.extraTurnOnCapture = false; // no captures → no capture extra roll
    merged.protectedStarts = false; //    protection is meaningless without captures
  }
  if (merged.entryRule === 'any-color') {
    merged.entryAssist = true; // any-color already includes the assist idea
  }
  if (merged.preset === 'classic') return { ...CLASSIC_CONFIG };
  if (merged.preset === 'quick') return { ...QUICK_CONFIG };
  if (merged.preset === 'family') return { ...FAMILY_CONFIG };
  return merged;
}

/** Configs are structurally equal when every gameplay-relevant field matches. */
export function sameRules(a: RulesConfig, b: RulesConfig): boolean {
  for (const key of Object.keys(CLASSIC_CONFIG)) {
    if (key === 'preset' || key === 'version') continue;
    if (a[key as keyof RulesConfig] !== b[key as keyof RulesConfig]) return false;
  }
  return true;
}

export type DiffKey = Exclude<keyof RulesConfig, 'version' | 'preset'>;

/** Which options differ from the Classic reconstruction. */
export function diffFromClassic(config: RulesConfig): DiffKey[] {
  const diffs: DiffKey[] = [];
  for (const key of Object.keys(CLASSIC_CONFIG) as DiffKey[]) {
    if (key === ('preset' as DiffKey) || key === ('version' as DiffKey)) continue;
    if (config[key] !== CLASSIC_CONFIG[key]) diffs.push(key);
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Editor metadata (drives the Additional Rules UI)
// ---------------------------------------------------------------------------

export type RuleGroup = 'start' | 'movement' | 'capture' | 'turn' | 'finish';

export interface RuleOptionChoice {
  value: string;
  label: string;
  description: string;
}

export interface RuleOptionMeta {
  key: DiffKey;
  group: RuleGroup;
  kind: 'select' | 'toggle';
  title: string;
  /** Child-friendly explanation shown under the title. */
  explanation: string;
  choices?: RuleOptionChoice[];
  /** Set when the option only makes sense with another option active. */
  requires?: { key: DiffKey; value: unknown; why: string };
}

export const GROUP_META: Record<RuleGroup, { title: string; icon: string }> = {
  start: { title: 'Starting the game', icon: 'door' },
  movement: { title: 'Moving around', icon: 'footprints' },
  capture: { title: 'Bumping others', icon: 'swords' },
  turn: { title: 'Taking turns', icon: 'hourglass' },
  finish: { title: 'Winning', icon: 'flag' },
};

export const RULE_OPTIONS: RuleOptionMeta[] = [
  {
    key: 'entryRule',
    group: 'start',
    kind: 'select',
    title: 'Leaving the base',
    explanation: 'Which roll lets a pawn step out of its base onto the start field.',
    choices: [
      {
        value: 'own-color',
        label: 'Your own color',
        description: 'Roll YOUR color to come out — like the documented edition rule.',
      },
      {
        value: 'any-color',
        label: 'Any color',
        description: 'Every roll lets a pawn come out — games start much faster.',
      },
    ],
  },
  {
    key: 'entryAssist',
    group: 'start',
    kind: 'toggle',
    title: 'First-pawn help',
    explanation:
      'While ALL of your pawns are still waiting in the base, any color lets your first pawn out — nobody waits forever.',
    requires: {
      key: 'entryRule',
      value: 'own-color',
      why: 'Any-color entry already lets every pawn out.',
    },
  },
  {
    key: 'passingRule',
    group: 'movement',
    kind: 'select',
    title: 'Passing other pawns',
    explanation: 'What happens when another pawn stands between you and your next field.',
    choices: [
      {
        value: 'free',
        label: 'Hop over freely',
        description: 'You may jump over pawns — only the field you LAND on matters.',
      },
      {
        value: 'strict-blocking',
        label: 'Blocked paths',
        description: 'Nobody may jump over a pawn — you must wait until the way is clear.',
      },
    ],
  },
  {
    key: 'captureEnabled',
    group: 'capture',
    kind: 'toggle',
    title: 'Bumping opponents',
    explanation: 'Land on an opponent to send it all the way back to its base.',
  },
  {
    key: 'protectedStarts',
    group: 'capture',
    kind: 'toggle',
    title: 'Safe start fields',
    explanation:
      'A pawn standing on its OWN start field is safe — nobody may land there or bump it.',
    requires: {
      key: 'captureEnabled',
      value: true,
      why: 'Without bumping there is nothing to be safe from.',
    },
  },
  {
    key: 'friendlyStacking',
    group: 'capture',
    kind: 'toggle',
    title: 'Pawn towers',
    explanation:
      'Your own pawns may stand together on one field. Careful: an opponent who lands on your tower bumps ALL of them!',
  },
  {
    key: 'extraTurnOnCapture',
    group: 'turn',
    kind: 'toggle',
    title: 'Extra roll after a bump',
    explanation: 'Bump an opponent and you immediately roll again.',
    requires: { key: 'captureEnabled', value: true, why: 'There are no bumps to reward.' },
  },
  {
    key: 'extraTurnOnOwnColor',
    group: 'turn',
    kind: 'toggle',
    title: 'Extra roll on your color',
    explanation: 'Roll your own color and you get another roll right away.',
  },
  {
    key: 'maySkipMove',
    group: 'turn',
    kind: 'toggle',
    title: 'Skipping moves',
    explanation: 'A Skip button lets you pass on a move you do not like. Off means: if you can move, you must.',
  },
  {
    key: 'pawnsPerPlayer',
    group: 'finish',
    kind: 'select',
    title: 'Pawns per player',
    explanation: 'How many pawns each player races home.',
    choices: [
      { value: '3', label: '3 pawns', description: 'The documented edition amount.' },
      { value: '2', label: '2 pawns', description: 'Shorter races for quick games.' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Dynamic rules reference — always reflects the ACTIVE configuration
// ---------------------------------------------------------------------------

export interface RulesSection {
  title: string;
  points: string[];
}

/** Human-readable summary of a config, used before starting and in-game. */
export function describeRules(config: RulesConfig): RulesSection[] {
  const sections: RulesSection[] = [];

  sections.push({
    title: 'The race',
    points: [
      `Each player races ${config.pawnsPerPlayer === 3 ? 'three' : 'two'} pawns around the board and into their home row.`,
      'The first player whose pawns are ALL home wins — the game ends immediately.',
    ],
  });

  sections.push({
    title: 'Rolling & moving',
    points: [
      'Tap the die. Four faces show a color and two show a golden STAR.',
      'Roll a color → move ONE of your pawns forward to the NEXT field showing that color — no counting needed.',
      'Roll a STAR → it counts as ANY color you like. Pick your favorite!',
      config.passingRule === 'free'
        ? 'You may hop right over pawns standing in your way — only your landing field matters.'
        : 'Pawns may NOT jump over anybody: if a pawn stands between you and your next matching field, you must wait.',
    ],
  });

  const entry: string[] = [];
  if (config.entryRule === 'any-color') {
    entry.push('ANY color lets a pawn step out of the base onto your start field.');
  } else {
    entry.push('Roll YOUR OWN color to move a pawn out of the base — any other color is rejected.');
    if (config.entryAssist) {
      entry.push('Little help: while all your pawns still wait in the base, any color lets the first one out.');
    }
  }
  entry.push('A golden STAR also lets a pawn out — choose your own color for it.');
  sections.push({ title: 'Leaving the base', points: entry });

  const capture: string[] = [];
  if (config.captureEnabled) {
    capture.push('Land exactly on an opponent pawn and it goes all the way back to its base.');
    if (config.protectedStarts) {
      capture.push('Pawns on their OWN start field are safe — nobody can land there.');
    }
    if (config.friendlyStacking) {
      capture.push('Your own pawns may share one field ("pawn towers"). If an opponent lands on your tower, ALL of them go home!');
    } else {
      capture.push('You cannot land on your own pawn — find another move.');
    }
  } else {
    capture.push('Bumping is switched OFF: you can never land where an opponent stands.');
    capture.push('Everyone races peacefully side by side.');
  }
  sections.push({ title: 'Bumping & landing', points: capture });

  const turns: string[] = ['No legal move? The die rolls again automatically — up to three tries, then the turn passes.'];
  if (config.captureEnabled && config.extraTurnOnCapture) {
    turns.push('Bump an opponent → roll again right away!');
  }
  if (config.extraTurnOnOwnColor) {
    turns.push('Roll your own color → roll again right away!');
  }
  if (!config.extraTurnOnCapture && !config.extraTurnOnOwnColor) {
    turns.push('No extra rolls — one move per turn.');
  }
  if (config.maySkipMove) {
    turns.push('You may skip a move you do not like (Skip button).');
  } else {
    turns.push('If you can move, you must move.');
  }
  sections.push({ title: 'Turns', points: turns });

  sections.push({
    title: 'Going home',
    points: [
      'Near the end of the track, when the rolled color has no matching field left ahead, that pawn steps into its home row — right into the mouth slot.',
      'Every later roll walks a home pawn one slot deeper — make room for the pawns behind you!',
      'A pawn at the very last slot is finished: it never moves again and cannot be bumped.',
    ],
  });

  return sections;
}

/** Short one-liner for HUD chips / preset cards. */
export function rulesHeadline(config: RulesConfig): string {
  const parts: string[] = [];
  parts.push(config.entryRule === 'any-color' ? 'any color starts' : 'own color starts');
  parts.push(config.passingRule === 'strict-blocking' ? 'no jumping over' : 'free passing');
  parts.push(config.captureEnabled ? (config.protectedStarts ? 'safe starts' : 'bumping on') : 'no bumping');
  if (config.friendlyStacking) parts.push('pawn towers');
  if (config.captureEnabled && config.extraTurnOnCapture) parts.push('extra roll on bump');
  if (config.extraTurnOnOwnColor) parts.push('extra roll on own color');
  if (config.pawnsPerPlayer === 2) parts.push('2 pawns');
  return parts.join(' · ');
}

/** Was this color-seat pair verified? (For the About screen.) */
export const EDITION_FACTS = {
  verified: [
    '2–4 players, ages 4+',
    'Three pawns per player',
    'A colored die instead of a numbered one',
    'Capturing opponents is part of the game',
  ],
  assumed: [
    'The die faces: the four colors plus two golden star wilds',
    'Own color required to leave the base',
    'Strict blocking — pawns may not be jumped over',
    'The home row queue: enter at the mouth, walk one slot per roll',
    'No extra-roll rules',
    'Up to three rolls when stuck, then the turn passes',
  ],
} as const;
