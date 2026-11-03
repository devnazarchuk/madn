"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * Custom app-wide switch (visual reference: Uiverse.io "toggle-wrapper" by
 * njesenberger, adapted to the game's warm theme and component architecture):
 *  - rounded-rectangular track with distinct OFF (warm tan) / ON (green) fills,
 *  - a sliding button with a subtle mechanical look,
 *  - twelve small decorative circles inside the sliding button,
 *  - smooth transitions, disabled by prefers-reduced-motion,
 *  - full Radix a11y: role="switch", keyboard toggling, focus-visible ring.
 * The Root element is the touch target; wrap it in a <label> to make the
 * whole row clickable (existing call sites already do).
 */

/** Decorative dots inside the sliding button (2 rows × 6). */
const DOTS = Array.from({ length: 12 }, (_, i) => i)

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-8 w-16 shrink-0 touch-manipulation items-center rounded-[10px] border border-black/10 bg-[#D8C4A2] p-[3px] shadow-[inset_0_2px_5px_rgba(0,0,0,0.22)] outline-none transition-colors duration-300 motion-reduce:transition-none",
        "focus-visible:ring-[3px] focus-visible:ring-[#D9A441]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "data-[state=checked]:bg-[#43B57E] data-[state=checked]:border-[#2E8F63]/40 data-[state=checked]:shadow-[inset_0_2px_5px_rgba(0,0,0,0.18)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none grid h-[26px] w-9 translate-x-0 grid-cols-6 grid-rows-2 gap-[1.5px] rounded-[8px] bg-[#FBF3E0] p-[5px] shadow-[0_2px_5px_rgba(0,0,0,0.32),inset_0_-2px_3px_rgba(91,58,36,0.14)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "data-[state=checked]:translate-x-[22px]"
        )}
      >
        {DOTS.map((i) => (
          <span
            key={i}
            aria-hidden
            className="size-[3px] rounded-full bg-[#5B3A24]/25"
          />
        ))}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
