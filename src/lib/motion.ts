/**
 * SeMa C2 — Shared motion tokens and variants.
 *
 * Import from here, never hardcode transitions inline.
 *
 * Reference: DESIGN_SYSTEM.md — Motion section
 */

import type { Transition, Variants } from 'framer-motion'

// ── Duration tokens ────────────────────────────────────────────────────────────

export const DURATION = {
  fast:     0.15,   // immediate state changes (chip toggles, icon swaps)
  standard: 0.22,   // dialog fade, short transitions
  slow:     0.35,   // sheet slide, longer transitions
  progress: 0.60,   // progress bar fill animation
} as const

// ── Easing tokens ─────────────────────────────────────────────────────────────

export const EASE = {
  standard: [0.32, 0.72, 0, 1] as const,         // decelerate into rest
  enter:    [0.0,  0.0,  0.2, 1] as const,        // fast start, soft end
  exit:     [0.4,  0.0,  1,   1] as const,        // slow start, fast end
} as const

// ── Spring tokens ─────────────────────────────────────────────────────────────

/** Standard spring for bottom sheets. */
export const SPRING_SHEET: Transition = {
  type:     'spring',
  damping:  30,
  stiffness: 380,
}

/** Soft spring for dialogs and popovers. */
export const SPRING_SOFT: Transition = {
  type:     'spring',
  damping:  25,
  stiffness: 300,
}

/** Press-state scale spring. */
export const SPRING_PRESS: Transition = {
  type:     'spring',
  stiffness: 400,
  damping:  30,
}

// ── Transition presets ────────────────────────────────────────────────────────

export const TRANSITION_FAST: Transition = {
  duration: DURATION.fast,
  ease: EASE.standard,
}

export const TRANSITION_STANDARD: Transition = {
  duration: DURATION.standard,
  ease: EASE.standard,
}

export const TRANSITION_SLOW: Transition = {
  duration: DURATION.slow,
  ease: EASE.standard,
}

// ── Framer Motion variants ────────────────────────────────────────────────────

/** Fade in from transparent. */
export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_STANDARD },
  exit:    { opacity: 0, transition: TRANSITION_FAST },
}

/** Slide up from below + fade. Used for list rows entering. */
export const slideUpFade: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_STANDARD },
  exit:    { opacity: 0, y: -6, transition: TRANSITION_FAST },
}

/** Scale in from slightly smaller + fade. Used for dialogs. */
export const scaleInFade: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: TRANSITION_STANDARD },
  exit:    { opacity: 0, scale: 0.94, y: 8, transition: TRANSITION_FAST },
}

/** Sheet slide up from bottom. */
export const sheetSlideUp: Variants = {
  hidden:  { y: '100%' },
  visible: { y: 0, transition: SPRING_SHEET },
  exit:    { y: '100%', transition: SPRING_SHEET },
}

/** Stagger children with slight delay each. */
export function staggerChildren(stagger = 0.06): Variants {
  return {
    hidden:  {},
    visible: { transition: { staggerChildren: stagger } },
  }
}

/**
 * Row collapse for deleted items.
 * Use `AnimatePresence` + `layout` prop on the item.
 */
export const rowCollapse: Variants = {
  hidden:  { opacity: 0, height: 0, marginBottom: 0 },
  visible: { opacity: 1, height: 'auto', marginBottom: undefined },
}

// ── Reduced motion guard ──────────────────────────────────────────────────────

/**
 * Returns a transition that respects prefers-reduced-motion.
 * Pass `reducedMotion` from the `useReducedMotion()` hook.
 *
 * @example
 * const shouldReduce = useReducedMotion()
 * transition={reduceMotion(shouldReduce, SPRING_SHEET)}
 */
export function reduceMotion(
  shouldReduce: boolean | null,
  transition: Transition,
): Transition {
  if (shouldReduce) return { duration: 0.01 }
  return transition
}
