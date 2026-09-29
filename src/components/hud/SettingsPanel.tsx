'use client';

import { Bot, MonitorPlay, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { playSfx } from '@/services/audio';
import { useSettingsStore } from '@/store/settingsStore';

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
    </div>
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
