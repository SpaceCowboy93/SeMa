/**
 * Framer Motion mock for Vitest.
 *
 * Renders plain HTML elements instead of animated ones so tests are stable
 * and fast.  Real accessibility attributes (role, aria-*) are forwarded.
 */

import React from 'react'
import { vi } from 'vitest'

type AnyProps = Record<string, unknown>

// Generic pass-through that strips framer-motion-specific props
function stripMotionProps(props: AnyProps) {
  const {
    initial, animate, exit, transition, variants, whileTap, whileHover, whileFocus,
    layout, layoutId, drag, dragConstraints, dragElastic,
    onAnimationStart, onAnimationComplete,
    ...rest
  } = props
  void initial; void animate; void exit; void transition; void variants
  void whileTap; void whileHover; void whileFocus; void layout; void layoutId
  void drag; void dragConstraints; void dragElastic
  void onAnimationStart; void onAnimationComplete
  return rest
}

function createMotionComponent(tag: string) {
  return React.forwardRef<HTMLElement, AnyProps>(function MotionComponent(props, ref) {
    return React.createElement(tag, { ...stripMotionProps(props), ref })
  })
}

// Cache keyed by tag name so the same component reference is returned on every
// render.  Without caching, each access creates a new component type and React
// unmounts/remounts the subtree, causing async DOM tasks to fire outside
// userEvent's act() scope and generating spurious act() warnings in tests.
const _motionCache = new Map<string, ReturnType<typeof createMotionComponent>>()
export const motion = new Proxy({} as Record<string, ReturnType<typeof createMotionComponent>>, {
  get(_target, prop: string) {
    if (!_motionCache.has(prop)) {
      _motionCache.set(prop, createMotionComponent(prop))
    }
    return _motionCache.get(prop)!
  },
})

export function AnimatePresence({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

export const useAnimation = vi.fn(() => ({
  start:  vi.fn(),
  stop:   vi.fn(),
  set:    vi.fn(),
  mount:  vi.fn(),
}))

export const useInView    = vi.fn(() => [null, false])
export const useScroll    = vi.fn(() => ({ scrollX: { get: vi.fn() }, scrollY: { get: vi.fn() } }))
export const useTransform = vi.fn(() => ({ get: vi.fn() }))
export const useSpring    = vi.fn((v: unknown) => v)

// MotionValue — needed by WeeklyFocusSection and other drag-gesture components.
// Returns a minimal stub so calling code does not crash.
export const useMotionValue = vi.fn((initialValue: unknown) => ({
  get:         vi.fn(() => initialValue),
  set:         vi.fn(),
  getVelocity: vi.fn(() => 0),
  subscribe:   vi.fn(() => vi.fn()),
  destroy:     vi.fn(),
}))

// animate() — the imperative animation helper used as `animate as animateX` in some files.
export const animate = vi.fn(() => ({ stop: vi.fn(), then: vi.fn() }))

// useReducedMotion — returns false by default; override per-test to simulate reduced-motion.
export const useReducedMotion = vi.fn(() => false)

const framerMotion = {
  motion, AnimatePresence,
  useAnimation, useInView, useScroll, useTransform, useSpring,
  useMotionValue, animate, useReducedMotion,
}
export default framerMotion
