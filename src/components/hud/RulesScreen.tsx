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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { playSfx } from '@/services/audio';
import { useGameStore } from '@/store/gameStore';
import {
  deletePreset,
  listPresets,
  renamePreset,
  savePreset,
  type SavedPreset,
} from '@/engine/persistence';
import {
  CLASSIC_CONFIG,
  GROUP_META,
  PRESET_META,
  PRESET_ORDER,
  RULE_OPTIONS,
  describeRules,
  diffFromClassic,
  rulesHeadline,
  type DiffKey,
  type RuleGroup,
  type RulesPresetId,
} from '@/engine/rulesConfig';
import { AnimalIcon } from './shared';

const GROUP_ICONS: Record<RuleGroup, typeof DoorOpen> = {
  start: DoorOpen,
  movement: Footprints,
  capture: Swords,
  turn: Hourglass,
  finish: Flag,
};

// ---------------------------------------------------------------------------
// Preset cards
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
    const cfg =
      preset === 'quick' ? PRESET_META.quick : PRESET_META.family;
    void cfg;
    return preset === 'quick' ? '3 changes vs Classic' : '2 changes vs Classic';
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PRESET_ORDER.map((preset) => {
        const meta = PRESET_META[preset];
        const selected = active === preset;
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={selected}
            onClick={() => selectRulesPreset(preset)}
            className={`rounded-3xl border p-4 text-left transition-all ${
              selected
                ? 'border-[#E8503A] bg-white shadow-lg shadow-[#E8503A]/15 ring-2 ring-[#E8503A]/60'
                : 'border-[#5B3A24]/20 bg-white/60 hover:border-[#5B3A24]/40 hover:bg-white/85'
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-base font-bold text-[#3E2A18]">
                {meta.title}
                {meta.locked && preset === 'classic' && <BookLock size={15} className="text-[#B08A5E]" />}
              </span>
              {selected && (
                <span className="flex size-5 items-center justify-center rounded-full bg-[#E8503A] text-white">
                  <Check size={12} strokeWidth={3.5} />
                </span>
              )}
            </div>
            <p className="text-xs leading-snug text-[#6B4E35]">{meta.tagline}</p>
            <span className="mt-2 inline-block rounded-full bg-[#F4E7CE] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8A6B4F]">
              {badge(preset)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option editor (custom mode)
// ---------------------------------------------------------------------------

function OptionRow({ optionKey }: { optionKey: DiffKey }) {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const updateRulesOption = useGameStore((s) => s.updateRulesOption);
  const meta = RULE_OPTIONS.find((o) => o.key === optionKey)!;
  const value = rulesConfig[optionKey];
  const changed = diffFromClassic(rulesConfig).includes(optionKey);
  const requiresMet = !meta.requires || rulesConfig[meta.requires.key] === meta.requires.value;
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
      className={`rounded-2xl border p-3.5 ${
        changed ? 'border-[#D9A441]/60 bg-[#FBEFD4]/70' : 'border-[#5B3A24]/15 bg-white/60'
      } ${requiresMet ? '' : 'opacity-55'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#5B3A24] text-[#F6EBD9]">
              <Icon size={14} />
            </span>
            <p className="text-sm font-semibold text-[#3E2A18]">{meta.title}</p>
            {changed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#D9A441] px-2 py-px text-[10px] font-bold uppercase tracking-wide text-[#3E2A18]">
                <Sparkles size={10} /> differs
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-snug text-[#6B4E35]">{meta.explanation}</p>
          {!requiresMet && meta.requires && (
            <p className="mt-1 text-[11px] italic text-[#B08A5E]">{meta.requires.why}</p>
          )}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`About ${meta.title}`}
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[#8A6B4F] hover:bg-[#F4E7CE]"
            >
              <Info size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-56 text-xs">
            {meta.kind === 'select'
              ? meta.choices?.find((c) => c.value === String(value))?.description
              : value
                ? 'Switched ON right now.'
                : 'Switched OFF right now.'}
          </TooltipContent>
        </Tooltip>
      </div>

      {meta.kind === 'toggle' ? (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#8A6B4F]">
            {value ? 'ON' : 'OFF'}
          </span>
          <Switch
            checked={Boolean(value)}
            disabled={!requiresMet}
            onCheckedChange={setValue}
            aria-label={meta.title}
          />
        </div>
      ) : (
        <ToggleGroup
          type="single"
          value={String(value)}
          onValueChange={(v) => v && setValue(v)}
          disabled={!requiresMet}
          className="mt-2.5 grid w-full grid-cols-2 gap-1.5 rounded-xl bg-[#E8D6B4] p-1"
          aria-label={meta.title}
        >
          {meta.choices?.map((choice) => (
            <ToggleGroupItem
              key={choice.value}
              value={choice.value}
              className="h-9 rounded-lg px-2 text-xs font-semibold text-[#6B4E35] data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow"
            >
              {choice.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

function CustomEditor() {
  const rulesConfig = useGameStore((s) => s.rulesConfig);
  const customizeFromPreset = useGameStore((s) => s.customizeFromPreset);
  const resetRulesToClassic = useGameStore((s) => s.resetRulesToClassic);

  if (rulesConfig.preset !== 'custom') {
    const meta = PRESET_META[rulesConfig.preset];
    return (
      <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-[#3E2A18]">
            <Wand2 size={16} /> Want to tweak the rules?
          </CardTitle>
          <CardDescription className="text-xs text-[#8A6B4F]">
            {meta.title} is a fixed preset. Copy it into Custom Rules to change any option.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              playSfx('modal');
              customizeFromPreset();
            }}
            className="rounded-xl bg-[#E8503A] hover:bg-[#C23A28]"
          >
            <Wand2 size={15} /> Make it custom
          </Button>
          <Button
            variant="outline"
            onClick={() => resetRulesToClassic()}
            className="rounded-xl border-[#5B3A24]/25 bg-white/60"
          >
            <RotateCcw size={15} /> Reset to Classic
          </Button>
        </CardContent>
      </Card>
    );
  }

  const groups = [...new Set(RULE_OPTIONS.map((o) => o.group))] as RuleGroup[];
  return (
    <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[#3E2A18]">
          <Wand2 size={16} /> Additional Rules
        </CardTitle>
        <CardDescription className="text-xs text-[#8A6B4F]">
          Every option is explained — yellow cards differ from Classic Rules.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => {
          const GroupIcon = GROUP_ICONS[group];
          return (
            <div key={group}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#8A6B4F]">
                <GroupIcon size={13} /> {GROUP_META[group].title}
              </p>
              <div className="space-y-2.5">
                {RULE_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <OptionRow key={o.key} optionKey={o.key} />
                ))}
              </div>
            </div>
          );
        })}
        <Button
          variant="outline"
          onClick={() => resetRulesToClassic()}
          className="w-full rounded-xl border-[#5B3A24]/25 bg-white/60"
        >
          <RotateCcw size={15} /> Reset all options to Classic
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
    <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[#3E2A18]">
          <Save size={16} /> My saved rules
        </CardTitle>
        <CardDescription className="text-xs text-[#8A6B4F]">
          Keep your favorite rule mixes — they stay on this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={name}
            maxLength={40}
            placeholder="Name your rules, e.g. Cozy evening"
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-xl border-[#5B3A24]/25 bg-white/70"
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
            className="h-10 shrink-0 rounded-xl bg-[#43B57E] text-white hover:bg-[#2E8F63]"
          >
            <Plus size={15} /> Save
          </Button>
        </div>

        {presets.length === 0 && (
          <p className="py-2 text-center text-xs text-[#8A6B4F]">
            No saved rules yet — set up your own mix above and save it here.
          </p>
        )}

        {presets.length > 0 && (
          <ScrollArea className="max-h-44 pr-2">
            <ul className="space-y-2">
              {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex items-center gap-2 rounded-xl border border-[#5B3A24]/15 bg-white/60 px-3 py-2"
                >
                  {editingId === preset.id ? (
                    <>
                      <Input
                        value={editName}
                        maxLength={40}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 rounded-lg bg-white"
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
          </ScrollArea>
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
    <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-[#3E2A18]">
          <Shield size={16} /> Match summary
        </CardTitle>
        <CardDescription className="text-xs text-[#8A6B4F]">
          {rulesHeadline(rulesConfig)}
          {diffs.length > 0 && (
            <span className="ml-1 font-semibold text-[#B6842B]">
              ({diffs.length} change{diffs.length === 1 ? '' : 's'} from Classic)
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-64 pr-3">
          <div className="space-y-3">
            {sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-bold uppercase tracking-wide text-[#8A6B4F]">
                  {section.title}
                </p>
                <ul className="mt-1 space-y-1">
                  {section.points.map((point) => (
                    <li key={point} className="flex gap-1.5 text-xs leading-snug text-[#6B4E35]">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#D9A441]" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
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
        <div className="pointer-events-auto mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 p-4 pb-8">
          {/* header */}
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Back"
              className="size-11 rounded-2xl bg-[#241B14]/75 text-[#F6EBD9] backdrop-blur-md hover:bg-[#3A2A1B]"
              onClick={() => {
                playSfx('uiClick');
                goScreen(rulesReturnTo === 'setup' ? 'setup' : 'menu');
              }}
            >
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1 text-center">
              <h1 className="font-[family-name:var(--font-baloo)] text-3xl font-extrabold text-[#F6EBD9] drop-shadow-md">
                Choose your rules
              </h1>
              <p className="text-xs text-[#D9C3A0]">
                {rulesReturnTo === 'setup'
                  ? `${activeSeats.map((s) => s.name).join(' · ')} — one last look before the match`
                  : 'Set the rules for the next match'}
              </p>
            </div>
            <span className="w-11" aria-hidden />
          </div>

          {/* who's playing (from setup) */}
          {rulesReturnTo === 'setup' && (
            <div className="flex flex-wrap justify-center gap-2">
              {activeSeats.map((seat, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[#3E2A18] shadow"
                >
                  <span className="text-[#5B3A24]">
                    <AnimalIcon color={seat.color} size={14} />
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
            className="space-y-5"
          >
            <PresetCards />
            <CustomEditor />
            <RulesSummary />
            <PresetManager />
          </motion.div>

          {/* actions */}
          <div className="sticky bottom-3 z-10 flex gap-3">
            {rulesReturnTo === 'setup' ? (
              <>
                <Button
                  variant="outline"
                  className="h-14 flex-1 rounded-2xl border-[#5B3A24]/40 bg-[#FBF3E0]/95 text-base font-semibold text-[#3E2A18] backdrop-blur-md hover:bg-[#FBF3E0]"
                  onClick={() => {
                    playSfx('uiClick');
                    goScreen('setup');
                  }}
                >
                  <ArrowLeft size={17} /> Players
                </Button>
                <Button
                  onClick={() => {
                    playSfx('star');
                    startGame();
                  }}
                  className="h-14 flex-[2] rounded-2xl bg-[#E8503A] text-lg font-bold text-white shadow-xl shadow-[#E8503A]/30 hover:bg-[#C23A28]"
                >
                  <Dices size={22} /> Start the match
                  <Sparkles size={16} className="opacity-70" />
                </Button>
              </>
            ) : (
              <Button
                onClick={() => {
                  playSfx('star');
                  goScreen('menu');
                }}
                className="h-14 w-full rounded-2xl bg-[#43B57E] text-lg font-bold text-white shadow-xl shadow-[#43B57E]/30 hover:bg-[#2E8F63]"
              >
                <Check size={20} /> Save rules &amp; back to menu
              </Button>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
