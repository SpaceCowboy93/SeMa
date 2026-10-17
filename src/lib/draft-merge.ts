import { sameValue } from './sync-merge'

export interface DraftConflict { path: string; mine: unknown; latest: unknown }
export type DraftChoice = 'mine' | 'latest'
export type DraftResolutions = Record<string, DraftConflict & { choice: DraftChoice }>
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function resolveDraftConflicts(conflicts: DraftConflict[], choice: DraftChoice): DraftResolutions {
  return Object.fromEntries(conflicts.map(conflict => [conflict.path, { ...conflict, choice }]))
}

/** Never mutate either version. A reviewed choice expires if either value changes. */
export function mergeDraft<T extends object>(opening: T, mine: T, latest: T, resolutions: DraftResolutions = {}) {
  const conflicts: DraftConflict[] = []
  function conflict(path: string, local: unknown, remote: unknown) {
    const resolution = resolutions[path]
    if (resolution && sameValue(resolution.mine, local) && sameValue(resolution.latest, remote)) {
      return resolution.choice === 'mine' ? local : remote
    }
    conflicts.push({ path, mine: local, latest: remote })
    return remote
  }
  function merge(base: unknown, local: unknown, remote: unknown, path: string): unknown {
    if (sameValue(local, base)) return remote
    if (sameValue(remote, base) || sameValue(local, remote)) return local
    if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
      if ([base, local, remote].every(items => items.every(item => object(item) && typeof item.id === 'string') &&
        new Set(items.map(item => item.id)).size === items.length)) {
        const index = (items: Record<string, unknown>[]) => new Map(items.map(item => [item.id, item]))
        const b = index(base), l = index(local), r = index(remote)
        const result = [...new Set([...r.keys(), ...l.keys()])]
          .map(id => merge(b.get(id), l.get(id), r.get(id), `${path}.${id}`))
          .filter(item => item !== undefined) as Record<string, unknown>[]
        const common = base.filter(item => l.has(item.id) && r.has(item.id)).map(item => item.id)
        const order = (items: Record<string, unknown>[]) => items.filter(item => common.includes(item.id)).map(item => item.id)
        const lo = order(local), ro = order(remote)
        const lm = !sameValue(lo, common), rm = !sameValue(ro, common)
        const ordered = lm && rm && !sameValue(lo, ro)
          ? conflict(`${path}.order`, local, remote) as Record<string, unknown>[]
          : lm ? local : remote
        const rank = new Map(ordered.map((item, i) => [item.id, i]))
        return result.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
      }
      if (path === 'photos' && [base, local, remote].every(items => items.every(item => typeof item === 'string'))) {
        return [...new Set([...remote, ...local])].filter(item => !base.includes(item) || (local.includes(item) && remote.includes(item)))
      }
    }
    if (object(base) && object(local) && object(remote)) {
      return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
        .map(key => [key, merge(base[key], local[key], remote[key], path ? `${path}.${key}` : key)]))
    }
    return conflict(path, local, remote)
  }
  const merged = merge(opening, mine, latest, '') as T
  const changes = Object.fromEntries(Object.keys(merged).filter(key =>
    !sameValue(merged[key as keyof T], latest[key as keyof T])).map(key => [key, merged[key as keyof T]])) as Partial<T>
  return { merged, changes, conflicts }
}
