import { expect, it } from 'vitest'
import { writeRecoveryCheckpoint, type RecoveryCheckpoint } from '@/lib/sync-checkpoint'

// Synthetic ASCII text, not an original-device export. Explicit in-memory IO only.
function fixture(budget = Infinity) {
  const root = 'semacalendar-v2:synthetic-capacity:sema'
  const state = { events: [{ id: 'synthetic-large', title: 'Synthetic size fixture', date: '2027-06-01', color: 'blue' as const,
    createdBy: 'mateo' as const, createdAt: '2026-10-01', updatedAt: '2026-10-01', notes: 'x'.repeat(1_720_000) }] }
  const cache = JSON.stringify({ state, version: 0 }), base = JSON.stringify(state)
  const entries = new Map([[root, cache], [root + ':base', base], [root + ':pending', '[]']])
  const characters = () => [...entries].reduce((sum, [key, value]) => sum + key.length + value.length, 0)
  const io = { read: (key: string) => entries.get(key) ?? null, write: (key: string, value: string) => {
    const existing = entries.has(key) ? key.length + entries.get(key)!.length : 0
    // Deliberately generous model: one budget unit per ASCII character, not UTF-16 bytes.
    if (characters() - existing + key.length + value.length > budget) return false
    entries.set(key, value); return true
  } }
  const data: RecoveryCheckpoint = { state, base: state, pending: [], archives: [] }
  const mirror = (pending: Set<string>) => io.write(root, cache) && io.write(root + ':base', base) &&
    io.write(root + ':pending', JSON.stringify([...pending]))
  return { root, entries, characters, io, data, mirror, cache, base }
}

it('measures a two-slot plus mirror footprint above ten million characters for a 1.72M-character synthetic snapshot', () => {
  const f = fixture()
  expect(writeRecoveryCheckpoint(f.root, f.data, f.io, f.mirror)).toBe(true)
  expect(writeRecoveryCheckpoint(f.root, f.data, f.io, f.mirror)).toBe(true)
  expect(f.characters()).toBeGreaterThan(10_000_000)
  expect(f.entries.has(f.root + ':checkpoint:0')).toBe(true)
  expect(f.entries.has(f.root + ':checkpoint:1')).toBe(true)
})

it('refuses the first oversized checkpoint under a generous 5MiB ASCII budget and leaves all existing mirror bytes intact', () => {
  const f = fixture(5 * 1024 * 1024)
  expect(f.characters()).toBeLessThan(5 * 1024 * 1024)
  expect(writeRecoveryCheckpoint(f.root, f.data, f.io, f.mirror)).toBe(false)
  expect(f.entries.size).toBe(3)
  expect(f.entries.get(f.root) === f.cache).toBe(true)
  expect(f.entries.get(f.root + ':base') === f.base).toBe(true)
  expect(f.entries.get(f.root + ':pending')).toBe('[]')
  expect(f.entries.has(f.root + ':checkpoint:head')).toBe(false)
})
