'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  BookLock,
  Check,
  DoorOpen,
  Dices,
  Flag,
  Footprints,
  Hourglass,
  Info,
  Map as MapIcon,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { playSfx } from '@/services/audio';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  deletePreset,
  listPresets,
  renamePreset,
  savePreset,
  type SavedPreset,
} from '@/engine/persistence';
import {
  CLASSIC_CONFIG,
  FAMILY_CONFIG,
  GROUP_META,
  PRESET_META,
  PRESET_ORDER,
  QUICK_CONFIG,
  RULE_OPTIONS,
  describeRules,
  diffFromClassic,
  rulesHeadline,
  type DiffKey,
  type RuleGroup,
  type RuleOptionMeta,
  type RulesConfig,
  type RulesPresetId,
} from '@/engine/rulesConfig';
import { AnimalIcon } from './shared';

const GROUP_ICONS: Record<RuleGroup, typeof DoorOpen> = {
  start: DoorOpen,
  movement: Footprints,
  capture: Swords,
  turn: Hourglass,
  finish: Flag,
  board: MapIcon,
};

/** Sparkles badge shown on cards whose value differs from Classic. */
function DiffersBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#D9A441] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[#3E2A18]">
      <Sparkles size={9} /> differs
    </span>
  );
}

// ---------------------------------------------------------------------------
// Preset cards — compact 2×2 grid; the longer description only appears for
// the SELECTED preset (caption below the grid keeps all four rows equal).
// ---------------------------------------------------------------------------

function PresetCards() {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const selectRulesPreset = useGameStore((s) => s.selectRulesPreset);
  const active = rulesConfig.preset;
  const diffs = diffFromClassic(rulesConfig);

  const badge = (preset: RulesPresetId) => {
    if (preset === 'custom') {
      if (diffs.length === 0) return 'Same as Classic';
      return `${diffs.length} change${diffs.length === 1 ? '' : 's'} vs Classic`;
    }
    if (preset === 'classic') return 'Official-style preset';
    const presetDiffs = diffFromClassic(
      preset === 'quick' ? QUICK_CONFIG : preset === 'family' ? FAMILY_CONFIG : CLASSIC_CONFIG,
    );
    return `${presetDiffs.length} change${presetDiffs.length === 1 ? '' : 's'} vs Classic`;
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {PRESET_ORDER.map((preset) => {
          const meta = PRESET_META[preset];
          const selected = active === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              onClick={() => selectRulesPreset(preset)}
              className={`min-w-0 rounded-2xl border p-2.5 text-left transition-all ${
                selected
                  ? 'border-[#E8503A] bg-white shadow-lg shadow-[#E8503A]/15 ring-2 ring-[#E8503A]/60'
                  : 'border-[#5B3A24]/20 bg-white/90 hover:border-[#5B3A24]/40 hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold leading-tight text-[#3E2A18]">
                  <span className="truncate">{meta.title}</span>
                  {meta.locked && preset === 'classic' && (
                    <BookLock size={14} className="shrink-0 text-[#B08A5E]" />
                  )}
                </span>
                {selected && (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#E8503A] text-white">
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                )}
              </div>
              <span className="mt-1.5 inline-block max-w-full truncate rounded-full bg-[#F4E7CE] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A6B4F]">
                {badge(preset)}
              </span>
            </button>
          );
        })}
      </div>
      {/* description of the SELECTED preset only — keeps the grid compact */}
      <p className="min-w-0 rounded-xl border border-[#5B3A24]/10 bg-white/70 px-3 py-2 text-[11px] leading-snug text-[#6B4E35]">
        {PRESET_META[active].tagline}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rule info popup — full explanation behind the ⬁ info icon of each card
// ---------------------------------------------------------------------------

function RuleInfoDialog({
  open,
  onOpenChange,
  meta,
  value,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: RuleOptionMeta;
  value: boolean | string;
}) {
  const Icon = GROUP_ICONS[meta.group];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="sheet"
        className="rounded-3xl border-[#5B3A24]/25 bg-[#FBF3E0] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-[family-name:var(--font-baloo)] text-xl font-bold text-[#3E2A18]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#5B3A24] text-[#F6EBD9]">
              <Icon size={15} />
            </span>
            {meta.title}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-snug text-[#6B4E35]">
            {meta.explanation}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {meta.kind === 'select' ? (
            meta.choices?.map((choice) => {
              const active = String(value) === choice.value;
              return (
                <div
                  key={choice.value}
                  className={`rounded-xl border p-2.5 ${
                    active ? 'border-[#D9A441]/60 bg-[#FBEFD4]/70' : 'border-[#5B3A24]/15 bg-white/60'
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs font-bold text-[#3E2A18]">
                    {active && <Check size={12} className="text-[#B6842B]" />}
                    {choice.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#6B4E35]">
                    {choice.description}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="rounded-xl border border-[#5B3A24]/15 bg-white/60 p-2.5">
              <p className="text-xs font-bold text-[#3E2A18]">
                Right now: {value ? 'switched ON' : 'switched OFF'}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#6B4E35]">
                {value
                  ? 'This rule is currently part of your match.'
                  : 'This rule is currently switched off for your match.'}
              </p>
            </div>
          )}
          {meta.requires && (
            <p className="rounded-xl border border-[#B08A5E]/30 bg-[#F4E7CE]/60 p-2.5 text-[11px] leading-snug text-[#8A6B4F]">
              <span className="font-bold">Why it may be greyed out: </span>
              {meta.requires.why}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => {
              playSfx('uiClick');
              onOpenChange(false);
            }}
            className="h-10 rounded-xl bg-[#E8503A] font-bold text-white hover:bg-[#C23A28]"
          >
            <Check size={15} /> Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Option editor (custom mode) — compact card: name + state + info popup
// ---------------------------------------------------------------------------

function OptionRow({ optionKey }: { optionKey: DiffKey }) {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const updateRulesOption = useGameStore((s) => s.updateRulesOption);
  const meta = RULE_OPTIONS.find((o) => o.key === optionKey)!;
  const value = rulesConfig[optionKey];
  const changed = diffFromClassic(rulesConfig).includes(optionKey);
  const requiresMet = !meta.requires || rulesConfig[meta.requires.key] === meta.requires.value;
  const [infoOpen, setInfoOpen] = useState(false);
  const Icon = GROUP_ICONS[meta.group];

  const setValue = (v: string | boolean) => {
    playSfx('uiClick');
    if (meta.kind === 'select') {
      updateRulesOption(optionKey, v);
    } else {
      updateRulesOption(optionKey, Boolean(v));
    }
  };

  return (
    <div
      className={`rounded-xl border p-2.5 ${
        changed ? 'border-[#D9A441]/60 bg-[#FBEFD4]/70' : 'border-[#5B3A24]/15 bg-white/60'
      } ${requiresMet ? '' : 'opacity-55'}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#5B3A24] text-[#F6EBD9]">
          <Icon size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[13px] font-semibold text-[#3E2A18]">{meta.title}</p>
            {changed && <DiffersBadge />}
          </div>
        </div>
        <button
          type="button"
          aria-label={`About ${meta.title}`}
          aria-expanded={infoOpen}
          onClick={() => {
            playSfx('uiClick');
            setInfoOpen(true);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#8A6B4F] transition hover:bg-[#F4E7CE] focus-visible:ring-2 focus-visible:ring-[#D9A441]/60"
        >
          <Info size={15} />
        </button>
        {meta.kind === 'toggle' && (
          <Switch
            checked={Boolean(value)}
            disabled={!requiresMet}
            onCheckedChange={setValue}
            aria-label={meta.title}
          />
        )}
      </div>

      {meta.kind === 'select' && (
        <ToggleGroup
          type="single"
          value={String(value)}
          onValueChange={(v) => v && setValue(v)}
          disabled={!requiresMet}
          className="mt-2 grid w-full grid-cols-2 gap-1 rounded-xl bg-[#E8D6B4] p-1"
          aria-label={meta.title}
        >
          {meta.choices?.map((choice) => (
            <ToggleGroupItem
              key={choice.value}
              value={choice.value}
              className="h-8 min-w-0 rounded-lg px-1.5 text-[11px] font-semibold leading-tight text-[#6B4E35] data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow"
            >
              {choice.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {!requiresMet && meta.requires && (
        <p className="mt-1.5 text-[10px] italic leading-snug text-[#B08A5E]">{meta.requires.why}</p>
      )}

      <RuleInfoDialog open={infoOpen} onOpenChange={setInfoOpen} meta={meta} value={value} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-roll — a device setting (works with EVERY preset), now living inside
// the Additional Rules card after the old Board & Dice Extras section was
// removed. Persistence (settings store) is unchanged.
// ---------------------------------------------------------------------------

function AutoRollRow() {
  const autoRoll = useSettingsStore((s) => s.autoRoll);
  const setAutoRoll = useSettingsStore((s) => s.setAutoRoll);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#5B3A24]/15 bg-white/60 p-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#3E2A18]">
          <Dices size={13} className="shrink-0 text-[#8A6B4F]" /> Auto-roll dice
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-[#6B4E35]">
          The die rolls itself at the start of your turn — hands-free turns. Works with every
          preset; OFF by default.
        </p>
      </div>
      <Switch
        checked={autoRoll}
        onCheckedChange={(v) => {
          playSfx('uiClick');
          setAutoRoll(v);
        }}
        aria-label="Auto-roll dice"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Additional Rules — always visible; the full editor appears in custom mode
// ---------------------------------------------------------------------------

function AdditionalRulesCard() {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const customizeFromPreset = useGameStore((s) => s.customizeFromPreset);
  const resetRulesToClassic = useGameStore((s) => s.resetRulesToClassic);
  const isCustom = rulesConfig.preset === 'custom';

  if (!isCustom) {
    const meta = PRESET_META[rulesConfig.preset];
    return (
      <Card className="w-full min-w-0 rounded-2xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-lg shadow-black/25 backdrop-blur-md">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-[#3E2A18]">
            <Wand2 size={15} /> Additional Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#5B3A24]/15 bg-white/60 p-2.5">
            <p className="min-w-0 flex-1 basis-52 text-xs leading-snug text-[#6B4E35]">
              <span className="font-bold text-[#3E2A18]">{meta.title}</span> is a fixed preset.
              Copy it into Custom Rules to tweak every option — ceramic dice, random maps and all.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => {
                  playSfx('modal');
                  customizeFromPreset();
                }}
                className="h-8 rounded-lg bg-[#E8503A] hover:bg-[#C23A28]"
              >
                <Wand2 size={13} /> Make it custom
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resetRulesToClassic()}
                className="h-8 rounded-lg border-[#5B3A24]/25 bg-white/60"
              >
                <RotateCcw size={13} /> Classic
              </Button>
            </div>
          </div>
          <AutoRollRow />
        </CardContent>
      </Card>
    );
  }

  const groups = [...new Set(RULE_OPTIONS.map((o) => o.group))] as RuleGroup[];
  return (
    <Card className="w-full min-w-0 rounded-2xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-lg shadow-black/25 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-[#3E2A18]">
          <Wand2 size={15} /> Additional Rules
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((group) => {
          const GroupIcon = GROUP_ICONS[group];
          return (
            <div key={group}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8A6B4F]">
                <GroupIcon size={12} /> {GROUP_META[group].title}
              </p>
              <div className="space-y-2">
                {RULE_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <OptionRow key={o.key} optionKey={o.key} />
                ))}
              </div>
            </div>
          );
        })}
        <AutoRollRow />
        <Button
          variant="outline"
          onClick={() => resetRulesToClassic()}
          className="h-9 w-full rounded-xl border-[#5B3A24]/25 bg-white/60"
        >
          <RotateCcw size={14} /> Reset all options to Classic
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Saved preset management
// ---------------------------------------------------------------------------

function PresetManager() {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  // Mounted-only component — reading localStorage lazily is safe here.
  const [presets, setPresets] = useState<SavedPreset[]>(() => listPresets());
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  return (
    <Card className="h-full rounded-2xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-lg shadow-black/25 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-[#3E2A18]">
          <Save size={15} /> My saved rules
        </CardTitle>
        <CardDescription className="text-[11px] text-[#8A6B4F]">
          Keep your favorite rule mixes — they stay on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex gap-2">
          <Input
            value={name}
            maxLength={40}
            placeholder="Name your rule mix"
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-xl border-[#5B3A24]/25 bg-white/70 text-base"
            aria-label="Preset name"
          />
          <Button
            onClick={() => {
              if (!name.trim()) return;
              playSfx('star');
              savePreset(name, rulesConfig);
              setName('');
              setPresets(listPresets());
            }}
            className="h-9 shrink-0 rounded-xl bg-[#43B57E] text-white hover:bg-[#2E8F63]"
          >
            <Plus size={14} /> Save
          </Button>
        </div>

        {presets.length === 0 && (
          <p className="py-1.5 text-center text-[11px] text-[#8A6B4F]">
            No saved rules yet — set up your own mix above and save it here.
          </p>
        )}

        {presets.length > 0 && (
          <ul className="scrollbar-cute max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex items-center gap-2 rounded-xl border border-[#5B3A24]/15 bg-white/60 px-2.5 py-1.5"
                >
                  {editingId === preset.id ? (
                    <>
                      <Input
                        value={editName}
                        maxLength={40}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 rounded-lg bg-white text-base"
                        aria-label="Rename preset"
                      />
                      <Button
                        size="sm"
                        className="h-8 rounded-lg bg-[#43B57E] text-white hover:bg-[#2E8F63]"
                        onClick={() => {
                          const next = renamePreset(preset.id, editName);
                          setPresets(next);
                          setEditingId(null);
                          playSfx('uiClick');
                        }}
                      >
                        <Check size={14} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#3E2A18]">{preset.name}</p>
                        <p className="truncate text-[11px] text-[#8A6B4F]">
                          {rulesHeadline(preset.config)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg border-[#5B3A24]/25"
                        onClick={() => {
                          playSfx('uiClick');
                          useGameStore.setState({ rulesConfig: preset.config });
                        }}
                      >
                        Load
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Rename ${preset.name}`}
                        className="size-8 rounded-lg text-[#8A6B4F] hover:bg-[#F4E7CE]"
                        onClick={() => {
                          setEditingId(preset.id);
                          setEditName(preset.name);
                        }}
                      >
                        <Pencil size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${preset.name}`}
                        className="size-8 rounded-lg text-[#C23A28] hover:bg-[#FBE3DE]"
                        onClick={() => {
                          setPresets(deletePreset(preset.id));
                          playSfx('uiClick');
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function RulesSummary() {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const diffs = diffFromClassic(rulesConfig);
  const sections = describeRules(rulesConfig);
  return (
    <Card className="h-full rounded-2xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-lg shadow-black/25 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-[#3E2A18]">
          <Shield size={15} /> Match summary
        </CardTitle>
        <CardDescription className="text-[11px] text-[#8A6B4F]">
          {rulesHeadline(rulesConfig)}
          {diffs.length > 0 && (
            <span className="ml-1 font-semibold text-[#B6842B]">
              ({diffs.length} change{diffs.length === 1 ? '' : 's'} from Classic)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="scrollbar-cute max-h-44 space-y-2 overflow-y-auto pr-1">
          {sections.map((section) => (
              <div key={section.title}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#8A6B4F]">
                  {section.title}
                </p>
                <ul className="mt-1 space-y-1">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-1.5 text-[11px] leading-snug text-[#6B4E35]">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function RulesScreen() {
  const goScreen = useGameStore((s) => s.goScreen);
  const startGame = useGameStore((s) => s.startGame);
  const rulesReturnTo = useGameStore((s) => s.rulesReturnTo);
  const playerCount = useGameStore((s) => s.playerCount);
  const seats = useGameStore((s) => s.seats);

  const activeSeats = seats.slice(0, playerCount);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="pointer-events-auto mx-auto flex min-h-full w-full max-w-2xl flex-col gap-3 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* header */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Back"
              className="size-10 rounded-2xl bg-[#241B14]/75 text-[#F6EBD9] backdrop-blur-md hover:bg-[#3A2A1B]"
              onClick={() => {
                playSfx('uiClick');
                goScreen(rulesReturnTo === 'setup' ? 'setup' : 'menu');
              }}
            >
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1 text-center">
              <h1 className="font-[family-name:var(--font-baloo)] text-2xl font-extrabold text-[#F6EBD9] drop-shadow-md">
                Choose your rules
              </h1>
              <p className="text-[11px] text-[#D9C3A0]">
                {rulesReturnTo === 'setup'
                  ? 'One last look before the match'
                  : 'Set the rules for the next match'}
              </p>
            </div>
            <span className="w-10" aria-hidden />
          </div>

          {/* who's playing (from setup) */}
          {rulesReturnTo === 'setup' && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {activeSeats.map((seat, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-semibold text-[#3E2A18] shadow"
                >
                  <span className="text-[#5B3A24]">
                    <AnimalIcon color={seat.color} size={12} />
                  </span>
                  {seat.name}
                </span>
              ))}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-3"
          >
            <PresetCards />
            <ExtrasCard />
            <CustomEditor />
            {/* summary & saved rules share a row on large screens */}
            <div className="grid gap-3 lg:grid-cols-2">
              <RulesSummary />
              <PresetManager />
            </div>
          </motion.div>

          {/* actions — sticky floating bar with its own panel so scrolling
              content never shows through between the buttons */}
          <div className="sticky bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-10 flex gap-2.5 rounded-[1.4rem] border border-[#5B3A24]/20 bg-[#FBF3E0]/95 p-1.5 shadow-xl shadow-black/30 backdrop-blur-md">
            {rulesReturnTo === 'setup' ? (
              <>
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-2xl border-[#5B3A24]/40 bg-[#FBF3E0]/95 text-sm font-semibold text-[#3E2A18] backdrop-blur-md hover:bg-[#FBF3E0]"
                  onClick={() => {
                    playSfx('uiClick');
                    goScreen('setup');
                  }}
                >
                  <ArrowLeft size={16} /> Players
                </Button>
                <Button
                  onClick={() => {
                    playSfx('star');
                    startGame();
                  }}
                  className="h-12 flex-[2] rounded-2xl bg-[#E8503A] text-base font-bold text-white shadow-xl shadow-[#E8503A]/30 hover:bg-[#C23A28]"
                >
                  <Dices size={19} /> Start the match
                  <Sparkles size={14} className="opacity-70" />
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  playSfx('star');
                  goScreen('menu');
                }}
                className="h-12 w-full rounded-2xl bg-[#43B57E] text-base font-bold text-white shadow-xl shadow-[#43B57E]/30 hover:bg-[#2E8F63]"
              >
                <Check size={18} /> Save rules &amp; back to menu
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
