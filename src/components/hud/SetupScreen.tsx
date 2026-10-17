'use client';

import { useState } from 'react';
import { ArrowLeft, Bot, Check, Dices, Settings, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PLAYER_COLORS } from '@/config/gameConfig';
import { COLORS, COLORS_DEEP } from '@/config/theme';
import { defaultName } from '@/engine/game';
import type { AiLevel, PlayerColorId, PlayerKind } from '@/engine/types';
import { useGameStore, type SeatDraft } from '@/store/gameStore';
import { playSfx } from '@/services/audio';
import { CHAR_ICON } from './shared';
import { SettingsDialog } from './SettingsPanel';

const AI_LEVELS: AiLevel[] = ['easy', 'medium', 'hard'];

function ColorPicker({
  seatColor,
  takenColors,
  onPick,
}: {
  seatColor: PlayerColorId;
  takenColors: PlayerColorId[];
  onPick: (c: PlayerColorId) => void;
}) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Seat color">
      {PLAYER_COLORS.map((c) => {
        const Icon = CHAR_ICON[c];
        const selected = seatColor === c;
        const taken = takenColors.includes(c);
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${c}${taken && !selected ? ' (swaps)' : ''}`}
            onClick={() => {
              if (!selected) {
                playSfx('uiClick');
                onPick(c);
              }
            }}
            className={`relative flex size-10 items-center justify-center rounded-full text-white transition-transform ${
              selected ? 'scale-105' : 'hover:scale-105 active:scale-95'
            }`}
            style={{
              backgroundColor: COLORS[c],
              boxShadow: selected
                ? `0 0 0 3px #FBF3E0, 0 0 0 5.5px ${COLORS_DEEP[c]}`
                : 'inset 0 -3px 6px rgba(0,0,0,0.25)',
            }}
          >
            <Icon size={17} />
            {taken && !selected && (
              <span className="absolute -bottom-1 rounded-full bg-[#3E2A18] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-[#F6EBD9]">
                swap
              </span>
            )}
            {selected && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-white shadow">
                <Check size={11} strokeWidth={3.5} className="text-[#3E2A18]" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SeatCard({
  seat,
  index,
  takenColors,
}: {
  seat: SeatDraft;
  index: number;
  takenColors: PlayerColorId[];
}) {
  const updateSeat = useGameStore((s) => s.updateSeat);
  const swapSeatColor = useGameStore((s) => s.swapSeatColor);
  const Icon = CHAR_ICON[seat.color];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card className="h-full rounded-2xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-lg shadow-black/25 backdrop-blur-md">
        <CardContent className="space-y-2.5 p-3">
          {/* row 1 — avatar + name */}
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ backgroundColor: COLORS[seat.color] }}
              aria-hidden
            >
              <Icon size={19} />
            </span>
            <Input
              value={seat.name}
              maxLength={24}
              placeholder={defaultName(seat.color)}
              aria-label={`Player ${index + 1} name`}
              onChange={(e) => updateSeat(index, { name: e.target.value })}
              className="h-10 min-w-0 flex-1 rounded-xl border-[#5B3A24]/25 bg-white/70 text-base"
            />
          </div>

          {/* row 2 — color + kind */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ColorPicker
              seatColor={seat.color}
              takenColors={takenColors}
              onPick={(c) => swapSeatColor(index, c)}
            />
            <ToggleGroup
              type="single"
              value={seat.kind}
              onValueChange={(v) => {
                if (v) {
                  playSfx('uiClick');
                  updateSeat(index, { kind: v as PlayerKind });
                }
              }}
              className="gap-1 rounded-xl bg-[#E8D6B4] p-1"
              variant="default"
              aria-label={`Player ${index + 1} human or robot`}
            >
              <ToggleGroupItem
                value="human"
                aria-label="Human player"
                className="h-7 gap-1 rounded-lg px-2.5 text-xs font-semibold data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow"
              >
                <User size={13} /> Human
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ai"
                aria-label="Robot player"
                className="h-7 gap-1 rounded-lg px-2.5 text-xs font-semibold data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow"
              >
                <Bot size={13} /> Robot
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* row 3 — robot level */}
          {seat.kind === 'ai' && (
            <ToggleGroup
              type="single"
              value={seat.aiLevel}
              onValueChange={(v) => {
                if (v) {
                  playSfx('uiClick');
                  updateSeat(index, { aiLevel: v as AiLevel });
                }
              }}
              className="grid w-full grid-cols-3 gap-1 rounded-xl bg-[#E8D6B4] p-1"
              aria-label={`Robot level for player ${index + 1}`}
            >
              {AI_LEVELS.map((lvl) => (
                <ToggleGroupItem
                  key={lvl}
                  value={lvl}
                  className="h-8 rounded-lg text-xs font-semibold capitalize text-[#6B4E35] data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow"
                >
                  {lvl}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function SetupScreen() {
  const goScreen = useGameStore((s) => s.goScreen);
  const goRules = useGameStore((s) => s.goRules);
  const playerCount = useGameStore((s) => s.playerCount);
  const seats = useGameStore((s) => s.seats);
  const setPlayerCount = useGameStore((s) => s.setPlayerCount);
  const rulesConfig = useGameStore((s) => s.rulesConfig);

  const activeSeats = seats.slice(0, playerCount);
  const takenColors = activeSeats.map((s) => s.color);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-y-auto overscroll-contain">
      <div className="pointer-events-auto mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back to menu"
            className="size-11 rounded-2xl bg-[#241B14]/75 text-[#F6EBD9] backdrop-blur-md hover:bg-[#3A2A1B]"
            onClick={() => {
              playSfx('uiClick');
              goScreen('menu');
            }}
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="flex-1 text-center">
            <h1 className="font-[family-name:var(--font-baloo)] text-3xl font-extrabold text-[#F6EBD9] drop-shadow-md">
              Set up the match
            </h1>
          </div>
          <span className="w-11" aria-hidden />
        </div>

        {/* player count */}
        <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#3E2A18]">Players at the table</CardTitle>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              type="single"
              value={String(playerCount)}
              onValueChange={(v) => {
                if (v) {
                  playSfx('uiClick');
                  setPlayerCount(Number(v));
                }
              }}
              className="grid w-full grid-cols-3 gap-2 rounded-2xl bg-[#E8D6B4] p-1.5"
              aria-label="Player count"
            >
              {[2, 3, 4].map((n) => (
                <ToggleGroupItem
                  key={n}
                  value={String(n)}
                  className="h-12 rounded-xl text-sm font-bold text-[#6B4E35] data-[state=on]:bg-white data-[state=on]:text-[#3E2A18] data-[state=on]:shadow-md"
                >
                  {n} players
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardContent>
        </Card>

        {/* seats */}
        {activeSeats.map((seat, i) => (
          <SeatCard key={i} seat={seat} index={i} takenColors={takenColors} />
        ))}

        {/* settings */}
        <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#3E2A18]">Comfort &amp; settings</CardTitle>
            <CardDescription className="text-xs text-[#8A6B4F]">
              Sound, graphics and little helpers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsPanel />
          </CardContent>
        </Card>

        {/* rules teaser — the full rules screen follows this one */}
        <Card className="rounded-3xl border-[#5B3A24]/20 bg-[#FBF3E0]/95 shadow-xl shadow-black/30 backdrop-blur-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#3E2A18]">Rules for this match</CardTitle>
            <CardDescription className="text-xs text-[#8A6B4F]">
              {rulesHeadline(rulesConfig)}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* start */}
        <Button
          onClick={() => {
            playSfx('star');
            goRules('setup');
          }}
          className="h-14 w-full rounded-2xl bg-[#E8503A] text-lg font-bold text-white shadow-xl shadow-[#E8503A]/30 hover:bg-[#C23A28]"
        >
          <Dices size={22} /> Choose rules &amp; play
          <Sparkles size={16} className="opacity-70" />
        </Button>
      </div>
    </div>
  );
}
