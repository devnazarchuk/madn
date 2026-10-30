'use client';

import { useEffect, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { useGameStore } from '@/store/gameStore';
import { MenuScreen } from '@/components/hud/MenuScreen';
import { SetupScreen } from '@/components/hud/SetupScreen';
import { RulesScreen } from '@/components/hud/RulesScreen';
import { GameHud } from '@/components/hud/GameHud';
import { Overlays } from '@/components/hud/Overlays';

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
  ssr: false,
  loading: () => null,
});

const noopSubscribe = () => () => {};
/** Client-only hydration gate (true after hydration, false during SSR). */
const useMounted = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

function Splash() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-4 bg-[#241B14]"
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-2" aria-hidden>
        {['#E8503A', '#43B57E', '#F2C14E'].map((c, i) => (
          <span
            key={c}
            className="size-4 animate-bounce rounded-full"
            style={{ backgroundColor: c, animationDelay: `${i * 0.14}s` }}
          />
        ))}
      </div>
      <p className="text-sm font-medium text-[#D9C3A0]">Setting up the board…</p>
    </div>
  );
}

export default function Home() {
  const mounted = useMounted();
  const screen = useGameStore((s) => s.screen);

  // Keyboard: Space/Enter rolls for the active human, Escape pauses.
  useEffect(() => {
    if (screen !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      const st = useGameStore.getState();
      const g = st.game;
      if (!g) return;
      if (e.key === 'Escape') {
        if (!st.winner) st.togglePause();
        return;
      }
      if (e.code === 'Space' || e.key === 'Enter') {
        const active = g.players[g.activeIndex];
        if (
          g.phase === 'await-roll' &&
          active?.kind === 'human' &&
          !st.diceRolling &&
          !st.paused &&
          !st.introPlaying
        ) {
          e.preventDefault();
          st.rollDice();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  if (!mounted) return <Splash />;

  return (
    <div className="flex h-full flex-col bg-[#241B14]">
      {/* The shell fills the (locked) viewport exactly; each screen overlay
          inside <main> owns its own scroll container — the page never scrolls
          as a whole, so mobile browser chrome changes cannot hijack it. */}
      <main className="relative min-h-0 flex-1">
        {/* warm 3D scene */}
        <GameCanvas />

        {/* soft vignette over the canvas (never blocks clicks) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_at_center,transparent_52%,rgba(16,11,7,0.5)_100%)]"
        />

        {/* screen overlays */}
        {screen === 'menu' && <MenuScreen />}
        {screen === 'setup' && <SetupScreen />}
        {screen === 'rules' && <RulesScreen />}
        {screen === 'game' && <GameHud />}
        <Overlays />
      </main>
    </div>
  );
}
