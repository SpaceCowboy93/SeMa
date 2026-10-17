import type { CoupleAccess } from './couple-access'

export interface AuthContext extends CoupleAccess { generation: number }
let generation = 0
let context: AuthContext | null = null
const listeners = new Set<() => void>()
export const getAuthContext = () => context
export const getAuthGeneration = () => generation
export const isCurrentAuth = (candidate: AuthContext) => context === candidate
export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function invalidateAuth() {
  generation++
  context = null
  listeners.forEach(listener => listener())
}
export function establishAuth(access: CoupleAccess, expectedGeneration: number) {
  if (generation !== expectedGeneration) return null
  context = { ...access, generation }
  listeners.forEach(listener => listener())
  return context
}
