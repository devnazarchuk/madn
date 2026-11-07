'use client';

import {
  Bot,
  Dices,
  Disc3,
  Layers,
  MonitorPlay,
  Shapes,
  Shirt,
  Snowflake,
  Sparkles,
  TreePine,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  ACCESSORY_LABELS,
  ACCESSORY_ORDER,
  BOARD_SKINS,
  BOARD_SKIN_ORDER,
  PAWN_SKIN_LABELS,
  PAWN_SKIN_ORDER,
  THEMES,
  THEME_ORDER,
  type AccessoryChoice,
  type BoardSkinId,
  type PawnSkinId,
  type ThemeId,
} from '@/config/theme';
import { playSfx } from '@/services/audio';
import { useSettingsStore, type SoundPackId } from '@/store/settingsStore';

/** The three synthesized audio styles, selectable in the settings. */
const SOUND_PACKS: Array<{ id: SoundPackId; label: string }> = [
  { id: 'toys', label: 'Toy shop' },
  { id: 'christmas', label: 'Christmas bells' },
  { id: 'arcade', label: 'Arcade chip' },
];

/**
 * Compact audio/visual/gameplay settings panel, embedded in the setup
 * screen and the pause dialog.
 */
export function SettingsPanel() {
  const audio = useSettingsStore((s) => s.audio);
  const setAudio = useSettingsStore((s) => s.setAudio);
  const toggleMuted = useSettingsStore((s) => s.toggleMuted);
  const quality = useSettingsStore((s) => s.quality);
  const setQuality = useSettingsStore((s) => s.setQuality);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);
  const showMoveHints = useSettingsStore((s) => s.showMoveHints);
  const setShowMoveHints = useSettingsStore((s) => s.setShowMoveHints);
  const autoSingleMove = useSettingsStore((s) => s.autoSingleMove);
  const setAutoSingleMove = useSettingsStore((s) => s.setAutoSingleMove);
  const autoRoll = useSettingsStore((s) => s.autoRoll);
  const setAutoRoll = useSettingsStore((s) => s.setAutoRoll);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const boardSkin = useSettingsStore((s) => s.boardSkin);
  const setBoardSkin = useSettingsStore((s) => s.setBoardSkin);
  const pawnSkin = useSettingsStore((s) => s.pawnSkin);
  const setPawnSkin = useSettingsStore((s) => s.setPawnSkin);
  const pawnAccessory = useSettingsStore((s) => s.pawnAccessory);
  const setPawnAccessory = useSettingsStore((s) => s.setPawnAccessory);
  const shadows = useSettingsStore((s) => s.shadows);
  const setShadows = useSettingsStore((s) => s.setShadows);
  const weather = useSettingsStore((s) => s.weather);
  const setWeather = useSettingsStore((s) => s.setWeather);
  const scenery = useSettingsStore((s) => s.scenery);
  const setScenery = useSettingsStore((s) => s.setScenery);
  const sharpTextures = useSettingsStore((s) => s.sharpTextures);
  const setSharpTextures = useSettingsStore((s) => s.setSharpTextures);
  const antialias = useSettingsStore((s) => s.antialias);
  const setAntialias = useSettingsStore((s) => s.setAntialias);

  return (
    <div className="space-y-4">
      {/* --- Audio ---------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {audio.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          Sound
        </div>
        <Switch
          checked={!audio.muted}
          onCheckedChange={(v) => {
            toggleMuted();
            playSfx('uiClick', { intensity: v ? 0.9 : 0.4 });
          }}
          aria-label="Toggle sound"
        />
      </div>

      {(['master', 'sfx', 'music'] as const).map((key) => (
        <div key={key} className="space-y-1.5" aria-label={`${key} volume`}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <Label htmlFor={`vol-${key}`} className="text-xs font-normal capitalize">
              {key === 'sfx' ? 'Effects' : key === 'music' ? 'Music' : 'Master'}
            </Label>
            <span>{Math.round(audio[key] * 100)}%</span>
          </div>
          <Slider
            id={`vol-${key}`}
            value={[audio[key]]}
            min={0}
            max={1}
            step={0.05}
            disabled={audio.muted}
            onValueChange={(v) => setAudio({ [key]: v[0] ?? 0 })}
          />
        </div>
      ))}

      <Separator />

      {/* --- Appearance ----------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles size={15} /> Season
        </div>
        <Select
          value={theme}
          onValueChange={(v) => {
            setTheme(v as ThemeId);
            playSfx('uiClick');
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Season">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_ORDER.map((id) => (
              <SelectItem key={id} value={id}>
                {THEMES[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Layers size={15} /> Board skin
        </div>
        <Select
          value={boardSkin}
          onValueChange={(v) => {
            setBoardSkin(v as BoardSkinId);
            playSfx('uiClick');
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Board skin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOARD_SKIN_ORDER.map((id) => (
              <SelectItem key={id} value={id}>
                {BOARD_SKINS[id].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shapes size={15} /> Pawn skin
        </div>
        <Select
          value={pawnSkin}
          onValueChange={(v) => {
            setPawnSkin(v as PawnSkinId);
            playSfx('uiClick');
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Pawn skin">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAWN_SKIN_ORDER.map((id) => (
              <SelectItem key={id} value={id}>
                {PAWN_SKIN_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Shirt size={15} /> Accessories
        </div>
        <Select
          value={pawnAccessory}
          onValueChange={(v) => {
            setPawnAccessory(v as AccessoryChoice);
            playSfx('uiClick');
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Accessories">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCESSORY_ORDER.map((id) => (
              <SelectItem key={id} value={id}>
                {ACCESSORY_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {pawnSkin === 'elf' && (
        <p className="-mt-1 px-1 text-[11px] leading-snug text-muted-foreground">
          Elves wear their own pointed hat — beanies, Santa and sun caps are skipped (the golden crown still fits on top).
        </p>
      )}

      <Separator />

      {/* --- Visual --------------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MonitorPlay size={15} /> Graphics quality
        </div>
        <Select
          value={quality}
          onValueChange={(v) => {
            setQuality(v as typeof quality);
            playSfx('uiClick');
          }}
        >
          <SelectTrigger className="h-8 w-28 text-xs" aria-label="Graphics quality">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Reduced motion</span>
        <Switch
          checked={reducedMotion}
          onCheckedChange={(v) => {
            setReducedMotion(v);
            playSfx('uiClick');
          }}
          aria-label="Reduced motion"
        />
      </label>

      {/* --- Performance ---------------------------------------------------- */}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Shadows</span>
        <Switch
          checked={shadows}
          onCheckedChange={(v) => {
            setShadows(v);
            playSfx('uiClick');
          }}
          aria-label="Shadows"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Snowflake size={15} /> Weather & sparkles
        </span>
        <Switch
          checked={weather}
          onCheckedChange={(v) => {
            setWeather(v);
            playSfx('uiClick');
          }}
          aria-label="Weather & sparkles"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <TreePine size={15} /> Scenery
        </span>
        <Switch
          checked={scenery}
          onCheckedChange={(v) => {
            setScenery(v);
            playSfx('uiClick');
          }}
          aria-label="Scenery"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Sharp textures</span>
        <Switch
          checked={sharpTextures}
          onCheckedChange={(v) => {
            setSharpTextures(v);
            playSfx('uiClick');
          }}
          aria-label="Sharp textures"
        />
      </label>
      <label
        className="flex items-center justify-between gap-3 text-sm"
        title="Applies after the next page reload"
      >
        <span className="font-medium">Anti-aliasing</span>
        <Switch
          checked={antialias}
          onCheckedChange={(v) => {
            setAntialias(v);
            playSfx('uiClick');
          }}
          aria-label="Anti-aliasing"
        />
      </label>

      <Separator />

      {/* --- Gameplay ------------------------------------------------------- */}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">Show move hints</span>
        <Switch
          checked={showMoveHints}
          onCheckedChange={(v) => {
            setShowMoveHints(v);
            playSfx('uiClick');
          }}
          aria-label="Show move hints"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Bot size={15} /> Auto-play single moves
        </span>
        <Switch
          checked={autoSingleMove}
          onCheckedChange={(v) => {
            setAutoSingleMove(v);
            playSfx('uiClick');
          }}
          aria-label="Auto-play single moves"
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Dices size={15} /> Auto-roll dice
        </span>
        <Switch
          checked={autoRoll}
          onCheckedChange={(v) => {
            setAutoRoll(v);
            playSfx('uiClick');
          }}
          aria-label="Auto-roll dice"
        />
      </label>
    </div>
  );
}

/** The single settings surface — opened from the menu, the setup header
 *  gear and the pause menu. Sound & graphics quality live HERE, never
 *  inline in the match setup flow. */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-3xl border-[#5B3A24]/25 bg-[#FBF3E0] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-baloo)] text-2xl font-bold text-[#3E2A18]">
            Settings
          </DialogTitle>
          <DialogDescription>Sound, graphics and little helpers.</DialogDescription>
        </DialogHeader>
        <SettingsPanel />
      </DialogContent>
    </Dialog>
  );
}

/** Small icon button used across the HUD. */
export function HudIconButton({
  label,
  onClick,
  children,
  tone = 'dark',
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'dark' | 'light';
}) {
  return (
    <Button
      size="icon"
      variant="secondary"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        tone === 'dark'
          ? 'size-9 rounded-xl bg-[#241B14]/70 text-[#F6EBD9] backdrop-blur-md hover:bg-[#3A2A1B] hover:text-white sm:size-10'
          : 'size-9 rounded-xl sm:size-10'
      }
    >
      {children}
    </Button>
  );
}
