// Greeting library — deterministic per user / date / time period.
// Same greeting persists all day; changes the next day or when period shifts.

export type TimePeriod = 'morning' | 'afternoon' | 'evening'

const MORNING: Array<(name: string) => string> = [
  name => `☀️ Good morning, ${name} ❤️`,
  name => `☀️ Rise and shine, ${name} ☀️`,
  name => `🌼 Have a beautiful day, ${name} ❤️`,
  name => `✨ Wishing you a wonderful morning, ${name}`,
  name => `🌸 Ready for a beautiful day, ${name}?`,
]

const AFTERNOON: Array<(name: string) => string> = [
  name => `🌿 Good afternoon, ${name} ❤️`,
  name => `☀️ Hope your day is going well, ${name}`,
  name => `🌺 Hope today is treating you kindly, ${name}`,
  name => `🌿 Enjoy the rest of your afternoon, ${name}`,
]

const EVENING: Array<(name: string) => string> = [
  name => `🌙 Good evening, ${name} ❤️`,
  name => `✨ Welcome back, ${name}.`,
  name => `🌙 Time to relax together ❤️`,
  name => `🌙 Hope you had a great day, ${name}`,
  name => `✨ Let's make tonight a good one, ${name}`,
]

export function getTimePeriod(now = new Date()): TimePeriod {
  const h = now.getHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  return 'evening'
}

/** Stable numeric index derived from a string seed (same seed = same index). */
function stableIndex(length: number, seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % length
}

/**
 * Returns a greeting chosen deterministically for the given name, date string,
 * and time period.  Adding more entries to a pool is the only change needed to
 * expand the greeting library.
 */
export function getDailyGreeting(name: string, dateStr: string, now = new Date()): string {
  const period = getTimePeriod(now)
  const pool = period === 'morning' ? MORNING : period === 'afternoon' ? AFTERNOON : EVENING
  const seed = `${dateStr}:${period}:${name}`
  return pool[stableIndex(pool.length, seed)](name)
}

/** Milliseconds until the next time-period boundary (5 am / 12 pm / 6 pm). */
export function msToNextPeriodBoundary(now = new Date()): number {
  const h  = now.getHours()
  const m  = now.getMinutes()
  const s  = now.getSeconds()
  const ms = now.getMilliseconds()
  const currentMs = ((h * 60 + m) * 60 + s) * 1000 + ms

  for (const bh of [5, 12, 18]) {
    const bMs = bh * 3600 * 1000
    if (bMs > currentMs) return bMs - currentMs
  }
  // Next boundary is 5 am tomorrow
  return (24 + 5) * 3600 * 1000 - currentMs
}
