import { z } from 'zod';

/**
 * ============================================================================
 * RULES CONFIGURATION — versioned, validated, persisted.
 * ============================================================================
 * One authoritative schema drives:
 *   • the engine (legal moves, captures, extra turns, the finish boundary),
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
/** A6 — how the golden winning cell may be reached. */
export type FinishRuleId = 'exact' | 'flexible';
/** Board paint — the official weave or a fully randomized map. */
export type BoardLayoutId = 'classic' | 'random';

export interface RulesConfig {
  /** Schema version — bump when options change. */
  version: 4;
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
  /**
   * A6 finish — 'exact' (Classic default): a pawn must LAND on the golden
   * winning cell with an exact die roll; a roll that would carry it past the
   * winning cell cannot move it. 'flexible': any roll that carries the pawn
   * onto or past the winning cell completes it.
   */
  finishRule: FinishRuleId;
  /**
   * Star Mode (kids-v5, default OFF) — the optional wild-die variant. ON:
   * the die's white and black faces are replaced by two golden STAR wilds;
   * a star counts as ANY of the six track colors (four player colors, white
   * or black). OFF (the standard game): the die carries a WHITE face and a
   * BLACK face that walk a pawn to the next white/black platform, exactly
   * like a color roll walks to the next field of that color.
   */
  starMode: boolean;
  /**
   * A9 color-match turns — when ON (Star Mode required), only the player's
   * OWN color (or a golden star, which is wild) lets them move; any plain
   * foreign face skips the whole turn immediately — no extra roll, no
   * re-rolling. OFF (Classic default): every face moves a pawn to the next
   * field of that color. Under the mandatory golden-arrow stop (kids-v6)
   * this variant NEEDS Star Mode: with the standard die the arrow gateway's
   * white/black platform color could never be rolled and pawns would strand
   * forever right before their home stretch — the normalization therefore
   * drops the variant when Star Mode is off.
   */
  ownColorToMove: boolean;
  /** Voluntary skip of a legal move (Skip button in the HUD). */
  maySkipMove: boolean;
  /** V2 — 3 for the edition, 2 for shorter matches. */
  pawnsPerPlayer: 2 | 3;
  /**
   * Ceramic Dice (kids-v7, default OFF) — the optional smart-luck die. A
   * purely cosmetic weight layer on the SAME seeded RNG: in normal play the
   * roll is completely standard; when the active player is fully stuck it
   * gently favors faces that let a pawn move; when ALL pawns wait in the base
   * a pity ladder raises the exit color to 50% → 75% → 99% on consecutive
   * failed attempts; and a roll that would immediately WIN the match gets a
   * random 15–25% boost. Never changes WHAT the faces are — only their odds.
   */
  ceramicDice: boolean;
  /**
   * Board layout (kids-v7) — 'classic' keeps the official color weave (and
   * the own-colored home rows); 'random' repaints every track field AND all
   * three cells of every home stretch with random colors (start fields keep
   * their owner's color), so even the way home demands matching rolls.
   */
  boardLayout: BoardLayoutId;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** The documented Kids-edition reconstruction (RULES.md §3) — strict edition. */
export const CLASSIC_CONFIG: RulesConfig = {
  version: 4,
  preset: 'classic',
  entryRule: 'own-color',
  entryAssist: false,
  passingRule: 'strict-blocking',
  captureEnabled: true,
  protectedStarts: false,
  friendlyStacking: false,
  extraTurnOnCapture: false,
  extraTurnOnOwnColor: false,
  finishRule: 'exact',
  starMode: false,
  ownColorToMove: false,
  maySkipMove: false,
  pawnsPerPlayer: 3,
  ceramicDice: false,
  boardLayout: 'classic',
};

/** Shorter matches: any-color entry, extra roll after captures, 2 pawns. */
export const QUICK_CONFIG: RulesConfig = {
  ...CLASSIC_CONFIG,
  preset: 'quick',
  entryRule: 'any-color',
  extraTurnOnCapture: true,
  pawnsPerPlayer: 2,
};

/** Easier for younger players: hop over others, safe starts, skipping, and a
 *  forgiving finish — any roll that reaches the goal completes the pawn. */
export const FAMILY_CONFIG: RulesConfig = {
  ...CLASSIC_CONFIG,
  preset: 'family',
  passingRule: 'free',
  protectedStarts: true,
  finishRule: 'flexible',
  maySkipMove: true,
};

export const PRESET_ORDER: RulesPresetId[] = ['classic', 'quick', 'family', 'custom'];

export const rulesConfigSchema = z
  .object({
    version: z.literal(4),
    preset: z.enum(['classic', 'custom', 'quick', 'family']),
    entryRule: z.enum(['own-color', 'any-color']),
    entryAssist: z.boolean(),
    passingRule: z.enum(['free', 'strict-blocking']),
    captureEnabled: z.boolean(),
    protectedStarts: z.boolean(),
    friendlyStacking: z.boolean(),
    extraTurnOnCapture: z.boolean(),
    extraTurnOnOwnColor: z.boolean(),
    finishRule: z.enum(['exact', 'flexible']),
    starMode: z.boolean(),
    ownColorToMove: z.boolean(),
    maySkipMove: z.boolean(),
    pawnsPerPlayer: z.union([z.literal(2), z.literal(3)]),
    ceramicDice: z.boolean(),
    boardLayout: z.enum(['classic', 'random']),
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
    tagline:
      'Strict edition rules — your own color starts, nobody may be jumped over, and every pawn must STOP on the golden arrow before walking home.',
    locked: true,
  },
  quick: {
    title: 'Quick Game',
    tagline: 'Shorter matches — leave the base with any color, extra roll after captures, 2 pawns.',
    locked: false,
  },
  family: {
    title: 'Family Mode',
    tagline:
      'Friendliest for the youngest — hop over others, safe start fields, and a forgiving goal once a pawn is inside its row.',
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
 * Version 1 saves (kids-v3) are migrated by filling the new options with
 * their Classic defaults; version 2 saves (kids-v4, the star-era die) are
 * migrated to Star Mode ON — those matches were created when the two wild
 * faces were stars, and custom presets keep that behavior.
 */
export function normalizeRulesConfig(input: unknown): RulesConfig {
  const base = CLASSIC_CONFIG;
  if (!input || typeof input !== 'object') return { ...base };
  const raw = input as Record<string, unknown>;
  // kids-v4 (v2) configs predate Star Mode: their die carried two golden
  // star wilds. Migrate them to starMode ON so saved custom presets keep
  // playing exactly as they were created — they are recognizable by the
  // missing starMode field (v3+ saves always carry it). (Preset configs
  // resolve to the preset definitions below, which use the standard die.)
  const legacyStarEra = raw.starMode === undefined;
  const merged = { ...base, ...(raw as Partial<RulesConfig>) } as RulesConfig;
  merged.version = 4;
  // kids-v7 fields: older saves simply lack them — Classic defaults apply.
  merged.ceramicDice = raw.ceramicDice === true;
  merged.boardLayout = raw.boardLayout === 'random' && merged.preset === 'custom' ? 'random' : 'classic';
  if (legacyStarEra && merged.preset === 'custom') merged.starMode = true;
  // Drop nonsensical combinations:
  if (!merged.captureEnabled) {
    merged.extraTurnOnCapture = false; // no captures → no capture extra roll
    merged.protectedStarts = false; //    protection is meaningless without captures
  }
  if (merged.entryRule === 'any-color') {
    merged.entryAssist = true; // any-color already includes the assist idea
  }
  if (!merged.starMode) {
    // kids-v6: the golden-arrow gateway is a MANDATORY stop — reaching it
    // requires rolling the arrow cell's white/black platform face. Without
    // a wild star that face can never be used under the own-color-only
    // variant, so the variant is dropped with the standard die (otherwise
    // every pawn would strand forever right before its home stretch).
    merged.ownColorToMove = false;
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

export type RuleGroup = 'start' | 'movement' | 'capture' | 'turn' | 'finish' | 'board';

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
  board: { title: 'The board & dice', icon: 'map' },
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
    key: 'starMode',
    group: 'movement',
    kind: 'toggle',
    title: 'Star Mode (wild die)',
    explanation:
      'OFF (standard): the die carries a WHITE and a BLACK face — roll them to hop to the next white or black platform on the track. ON: those two faces become golden STARS — a star counts as ANY color you like (including white or black).',
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
      'Your own pawns may stand together on one TRACK field. Careful: an opponent who lands on your tower bumps ALL of them! Inside the home stretch every finish slot always holds ONE pawn — the strict limit applies even with towers on.',
  },
  {
    key: 'ownColorToMove',
    group: 'turn',
    kind: 'toggle',
    title: 'Only your color moves you',
    explanation:
      'Roll YOUR color to move — a golden star is wild and may become any color (including the white/black platform you need for the arrow gateway). Any other plain face skips your whole turn right away. Needs Star Mode: with the standard die there is no star to save you, and pawns would strand at the arrow forever.',
    requires: {
      key: 'starMode',
      value: true,
      why: 'Star Mode must be ON — without the wild star faces nobody could ever roll the arrow gateway\'s platform color, and every pawn would get stuck right before its home stretch.',
    },
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
    key: 'finishRule',
    group: 'finish',
    kind: 'select',
    title: 'Reaching the golden goal',
    explanation:
      'How the golden winning cell may be reached at the end of the home stretch (inside the row — the golden arrow gateway before it is always a mandatory stop).',
    choices: [
      {
        value: 'exact',
        label: 'Exact landing (strict)',
        description:
          'Inside the row only rolls that keep the pawn ON the row move it — a roll that would carry it PAST the golden cell cannot move that pawn.',
      },
      {
        value: 'flexible',
        label: 'Carry past is fine',
        description:
          'Any roll that carries a home pawn ONTO or PAST the golden cell completes it — nobody gets stuck at the door.',
      },
    ],
  },
  {
    key: 'boardLayout',
    group: 'board',
    kind: 'select',
    title: 'Board color pattern',
    explanation:
      'Which colors the track fields — and the three home cells — are painted with.',
    choices: [
      {
        value: 'classic',
        label: 'Classic official pattern',
        description:
          'The documented edition weave: every home row is painted in the owner\'s color.',
      },
      {
        value: 'random',
        label: 'Full random map',
        description:
          'Every field — INCLUDING all three home-stretch cells — gets a random color each match. Even walking home demands the matching rolls! Start fields keep their owner\'s color.',
      },
    ],
  },
  {
    key: 'ceramicDice',
    group: 'board',
    kind: 'toggle',
    title: 'Ceramic dice (smart luck)',
    explanation:
      'A friendly hand from fate, OFF in fair play. Normal rolls stay perfectly honest — but when you are fully blocked it gently favors colors that let a pawn move; while ALL your pawns wait in the base, your exit color becomes 50% on the 1st failed try, 75% on the 2nd, 99% afterwards; and a roll that would win you the match gets a random 15–25% boost. Miss the 99% chance and the dice will tease you about it.',
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
      `Each player races ${config.pawnsPerPlayer === 3 ? 'three' : 'two'} pawns around the board and into their home stretch.`,
      'The home stretch is fed straight from the arm tip opposite your color row — your pawn walks in through the outer cell.',
      'Every finish cell holds ONE pawn: the first finisher stands on the golden winning cell forever, the others park behind it — one pawn per slot.',
      'The first player whose pawns ALL stand inside their home stretch — packed onto the golden cell — wins. The game ends immediately.',
    ],
  });

  const rolling: string[] = config.starMode
    ? [
        'Tap the die. Four faces show a color and two show a golden STAR.',
        'Roll a color → move ONE of your pawns forward to the NEXT field showing that color — no counting needed.',
        'Roll a STAR → it counts as ANY color you like (even white or black). Pick your favorite!',
      ]
    : [
        'Tap the die. Four faces show a color, one shows WHITE and one shows BLACK.',
        'Roll a color → move ONE of your pawns forward to the NEXT field showing that color — no counting needed.',
        'Roll WHITE or BLACK → hop to the next white or black platform on the track — a nice long stride!',
      ];
  if (config.ownColorToMove) {
    rolling.push(
      'Color match: ONLY your own color (or a star) lets you move. Any other plain face skips your turn right away — no re-rolling.',
    );
  }
  rolling.push(
    config.passingRule === 'free'
      ? 'You may hop right over pawns standing in your way — only your landing field matters. But inside a home stretch nobody may EVER be passed — every finish slot holds one pawn, and no pawn jumps over another there.'
      : 'Pawns may NOT jump over anybody: if a pawn stands between you and your next matching field, you must wait.',
    'The golden ARROW at each arm tip is a mandatory stop: you can never jump over it into your home stretch — you must first land ON the arrow cell by rolling its exact color, and then roll the color painted on the first home cell to step inside.',
    'No legal move? Your turn is skipped — the die is never re-rolled automatically.',
  );
  if (config.ceramicDice) {
    rolling.push(
      'Ceramic dice: normal rolls are perfectly honest — but the die quietly leans in your favor when you are fully blocked, raises your exit color to 50% → 75% → 99% while all your pawns wait in the base, and boosts a match-winning roll by a random 15–25%.',
    );
  }
  sections.push({ title: 'Rolling & moving', points: rolling });

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
      capture.push('Your own pawns may share one TRACK field ("pawn towers"). If an opponent lands on your tower, ALL of them go home!');
      capture.push('Inside the home stretch every finish slot always holds just ONE pawn — the strict limit applies even with pawn towers on.');
    } else {
      capture.push('You cannot land on your own pawn — find another move.');
    }
  } else {
    capture.push('Bumping is switched OFF: you can never land where an opponent stands.');
    capture.push('Everyone races peacefully side by side.');
  }
  sections.push({ title: 'Bumping & landing', points: capture });

  const turns: string[] = ['No legal move? The turn is simply skipped — no automatic re-rolls.'];
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

  const finish: string[] = [
    'After a full circuit your pawn arrives at the arm tip directly opposite your color row — the golden ARROW cell — and it is a MANDATORY stop: no pawn may jump over it.',
    'Step 1: standing before the arrow, roll the arrow cell\u2019s exact color (it is a white or black platform) to move ONTO it. Once there, a pawn may never continue around the board loop.',
    'Step 2: on a later turn, roll your OWN color (or a golden star) to step onto the first cell of your home stretch.',
    'The home stretch is YOUR color: roll your OWN color again and again to walk slot by slot — the first pawn reaches the golden winning cell and stands there forever; the later pawns park behind it, one per cell.',
    'Winning: bring ALL your pawns into the row — one per finish cell, packed onto the golden cell — and you win immediately.',
  ];
  if (config.finishRule === 'exact') {
    finish.push(
      'Strict finish inside the row: a roll that would carry a pawn PAST the golden cell cannot move it — foreign colors simply do not help there.',
    );
  } else {
    finish.push(
      'Flexible finish inside the row: ANY roll that carries a pawn onto or past the golden winning cell completes it — nobody waits at the door.',
    );
  }
  if (config.boardLayout === 'random') {
    finish.push(
      'FULL RANDOM MAP: the whole board — including the three home-stretch cells — is painted with random colors this match. Walking home demands rolling each cell\'s exact random color! (Start fields keep their owner\'s color.)',
    );
  }
  finish.push('A finished pawn stands on the winning cell forever: it never moves again and cannot be bumped.');
  sections.push({ title: 'Going home', points: finish });

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
  if (config.ownColorToMove) parts.push('own color only');
  parts.push(config.starMode ? 'star wilds' : 'white & black platforms');
  parts.push(config.finishRule === 'exact' ? 'exact goal landing' : 'goal on any reach');
  if (config.pawnsPerPlayer === 2) parts.push('2 pawns');
  if (config.boardLayout === 'random') parts.push('full random board');
  if (config.ceramicDice) parts.push('ceramic dice');
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
    'The die faces: the four colors plus white & black platforms (Star Mode swaps them for two golden star wilds)',
    'Own color required to leave the base',
    'Strict blocking — pawns may not be jumped over',
    'The home stretch is painted in the player\'s own color and walked with own-color rolls',
    'The golden arrow gateway (the arm tip) is a MANDATORY stop: reach it by rolling its exact platform color, step into the row with the own color, never loop past it',
    'Strictly one pawn per finish cell inside the home stretch (the golden cell keeps its first finisher; later pawns park behind)',
    'Victory when all pawns stand in the home stretch, one per cell, packed onto the golden cell',
    'The exact-roll finish rule inside the row',
    'Skipped turns instead of automatic re-rolls',
    'No extra-roll rules',
  ],
} as const;
