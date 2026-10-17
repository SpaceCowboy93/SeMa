import { type SharedState } from './shared-state'
import { goalChecklist } from './dream-checklist'

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// JSON object order is not significant (Postgres JSONB may reorder properties).
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => sameValue(value, b[i]))
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every(key =>
      Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]))
  }
  return false
}

export interface SyncConflictDetail { key: keyof SharedState; path: string[]; base: unknown; local: unknown; remote: unknown }
export interface SyncConflictMember { key: keyof SharedState; recordId?: string; base: unknown; local: unknown; remote: unknown }
export interface SyncConflictGroup { id: string; title: string; members: SyncConflictMember[]; fields: string[] }
export interface SyncResolutionArchive { id: string; at: string; choice: 'local' | 'remote' | 'unresolved'; group: SyncConflictGroup }
// A legacy local record may be a new record OR a stale copy of a remote deletion.
// Keep that uncertainty across partial resolutions, checkpoints and reloads.
export type UnbasedRecords = Partial<Record<keyof SharedState, string[]>>

function mergeValue(base: unknown, local: unknown, remote: unknown, moodCollection = false,
  path: string[] = [], onConflict?: (path: string[], base: unknown, local: unknown, remote: unknown) => void): unknown {
  if (sameValue(local, base)) return remote
  if (sameValue(remote, base) || sameValue(local, remote)) return local
  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(remote)) {
    // Includes shopping-list items and finance months, without changing their schema.
    const moodKey = (item: Record<string, unknown>) => JSON.stringify([item.userId, item.date])
    const isMood = (item: unknown): item is Record<string, unknown> => isObject(item) &&
      (item.userId === 'mateo' || item.userId === 'seval') && typeof item.date === 'string' && typeof item.mood === 'string'
    const moods = moodCollection && [base, local, remote].every(items => items.every(isMood) &&
      new Set(items.map(moodKey)).size === items.length)
    const idKey = moods ? undefined : ['id', 'key'].find(key => [base, local, remote].every(items =>
      items.every(item => isObject(item) && typeof item[key] === 'string') &&
      new Set(items.map(item => item[key])).size === items.length))
    if (idKey || moods) {
      const identity = (item: Record<string, unknown>) => idKey ? item[idKey] : moodKey(item)
      const index = (items: Record<string, unknown>[]) => new Map(items.map(item => [identity(item), item]))
      const b = index(base), l = index(local), r = index(remote)
      const result = Array.from(new Set([...r.keys(), ...l.keys()]))
        .map(id => mergeValue(b.get(id), l.get(id), r.get(id), false, [...path, String(id)], onConflict))
        .filter(value => value !== undefined)
      const common = base.map(identity).filter(id => l.has(id) && r.has(id))
      const order = (items: Record<string, unknown>[]) => items.map(identity).filter(id => common.includes(id))
      const localOrder = order(local), remoteOrder = order(remote)
      const localMoved = !sameValue(localOrder, common), remoteMoved = !sameValue(remoteOrder, common)
      if (localMoved && remoteMoved && !sameValue(localOrder, remoteOrder)) {
        if (!onConflict) throw new Error('Conflicting shared-state order')
        onConflict(path, base, local, remote)
      }
      const rank = new Map((localMoved && !remoteMoved ? local : remote).map((item, index) => [identity(item), index]))
      return result.sort((a, b) => (rank.get(identity(a as Record<string, unknown>)) ?? Infinity) -
        (rank.get(identity(b as Record<string, unknown>)) ?? Infinity))
    }
  }
  if (isObject(base) && isObject(local) && isObject(remote)) {
    const result: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      // The legacy text list is derived from the structured Dream checklist.
      if (key === 'checklist' && Array.isArray(local.checklistItems) && Array.isArray(remote.checklistItems)) continue
      // Independent changes to one record both advance its modification metadata.
      const value = key === 'updatedAt' && typeof local[key] === 'string' && typeof remote[key] === 'string' &&
        Number.isFinite(Date.parse(local[key])) && Number.isFinite(Date.parse(remote[key]))
        ? (Date.parse(local[key]) > Date.parse(remote[key]) ? local[key] : remote[key])
        : mergeValue(base[key], local[key], remote[key], false, [...path, key], onConflict)
      if (value !== undefined) Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true })
    }
    if (Array.isArray(result.checklistItems)) result.checklist = result.checklistItems.map(item => item.title)
    return result
  }
  // Includes edit/delete races and pending legacy caches with no known baseline.
  if (!onConflict) throw new Error('Conflicting shared-state edit')
  onConflict(path, base, local, remote)
  return remote
}

const identity = (key: keyof SharedState, item: Record<string, unknown>) => key === 'moods'
  ? JSON.stringify([item.userId, item.date]) : String(item[key === 'financeMonths' ? 'key' : 'id'])
function record(snapshot: Partial<SharedState>, key: keyof SharedState, id?: string): unknown {
  const value = snapshot[key]
  return id === undefined ? value : Array.isArray(value)
    ? value.find(item => identity(key, item as unknown as Record<string, unknown>) === id) : undefined
}
function replaceRecord(snapshot: Partial<SharedState>, member: Pick<SyncConflictMember, 'key' | 'recordId'>, value: unknown,
  order?: Partial<SharedState>) {
  if (member.recordId === undefined) {
    if (value === undefined) delete snapshot[member.key]
    else Object.assign(snapshot, { [member.key]: value })
    return
  }
  const items = snapshot[member.key]
  const values: unknown[] = Array.isArray(items) ? [...items] : []
  const index = values.findIndex(item => identity(member.key, item as Record<string, unknown>) === member.recordId)
  if (index >= 0) values.splice(index, 1, ...(value === undefined ? [] : [value]))
  else if (value !== undefined) {
    const reference = order?.[member.key]
    const source = Array.isArray(reference) ? reference as unknown as Record<string, unknown>[] : []
    const position = source.findIndex(item => identity(member.key, item) === member.recordId)
    const following = position < 0 ? undefined : source.slice(position + 1).find(item =>
      values.some(entry => identity(member.key, entry as Record<string, unknown>) === identity(member.key, item)))
    const before = following ? values.findIndex(entry => identity(member.key, entry as Record<string, unknown>) === identity(member.key, following)) : -1
    values.splice(before < 0 ? values.length : before, 0, value)
  }
  Object.assign(snapshot, { [member.key]: values })
}
function linkedNodes(snapshots: Partial<SharedState>[]) {
  const edges = new Map<string, Set<string>>()
  const node = (key: keyof SharedState, id: string) => JSON.stringify([key, id])
  function connect(a: string, b: string) {
    if (!edges.has(a)) edges.set(a, new Set())
    if (!edges.has(b)) edges.set(b, new Set())
    edges.get(a)!.add(b); edges.get(b)!.add(a)
  }
  for (const state of snapshots) {
    state.events?.forEach(event => {
      if (event.linkedGoalId) connect(node('events', event.id), node('goals', event.linkedGoalId))
      if (event.linkedTodoId) connect(node('events', event.id), node('todos', event.linkedTodoId))
    })
    state.goals?.forEach(goal => { if (goal.linkedEventId) connect(node('goals', goal.id), node('events', goal.linkedEventId)) })
    state.todos?.forEach(todo => { if (todo.linkedEventId) connect(node('todos', todo.id), node('events', todo.linkedEventId)) })
  }
  function component(start: string): string[] {
    const found = new Set([start])
    for (const entry of found) edges.get(entry)?.forEach(next => found.add(next))
    return [...found].sort()
  }
  return { edges, node, component }
}
function conflictGroups(base: Partial<SharedState>, local: Partial<SharedState>, remote: Partial<SharedState>, details: SyncConflictDetail[]) {
  const graph = linkedNodes([base, local, remote]), groups = new Map<string, SyncConflictGroup>()
  for (const detail of details) {
    const rootKeys = new Set<keyof SharedState>([detail.key])
    if (!detail.path.length) {
      for (const node of graph.edges.keys()) {
        if ((JSON.parse(node) as string[])[0] === detail.key) graph.component(node).forEach(entry => rootKeys.add(JSON.parse(entry)[0]))
      }
    }
    const nodes = detail.path.length ? graph.component(graph.node(detail.key, detail.path[0]))
      : [...rootKeys].sort().map(key => JSON.stringify([key]))
    const id = JSON.stringify(nodes)
    let group = groups.get(id)
    if (!group) {
      const members: SyncConflictMember[] = nodes.map(entry => {
        const [key, recordId] = JSON.parse(entry) as [keyof SharedState, string?]
        return { key, recordId, base: record(base, key, recordId), local: record(local, key, recordId), remote: record(remote, key, recordId) }
      })
      const example = members.flatMap(member => [member.local, member.remote, member.base])
        .find(value => isObject(value) && (typeof value.title === 'string' || typeof value.date === 'string')) as Record<string, unknown> | undefined
      group = { id, title: String(example?.title ?? example?.date ?? detail.key), members, fields: [] }
      groups.set(id, group)
    }
    const field = detail.path.slice(1).join(' / ') || detail.key
    if (!group.fields.includes(field)) group.fields.push(field)
  }
  // Missing legacy baselines can conflict at collection level. Coalesce overlapping
  // record groups so a choice cannot resolve only one half of a linked operation.
  const result = [...groups.values()]
  for (let index = 0; index < result.length; index++) {
    for (let other = index + 1; other < result.length; other++) {
      if (!result[index].members.some(a => result[other].members.some(b => a.key === b.key &&
        (a.recordId === undefined || b.recordId === undefined || a.recordId === b.recordId)))) continue
      const members = [...result[index].members, ...result[other].members]
      result[index].members = members.filter((member, position) => !members.some((entry, earlier) =>
        entry.key === member.key && ((entry.recordId === undefined && member.recordId !== undefined) ||
        (earlier < position && entry.recordId === member.recordId))))
      result[index].fields = [...new Set([...result[index].fields, ...result[other].fields])]
      result.splice(other, 1); other = index
    }
    result[index].id = JSON.stringify(result[index].members.map(member => JSON.stringify([member.key, member.recordId])).sort())
  }
  // Snapshots use JSON's absent-value representation, including across reloads.
  return JSON.parse(JSON.stringify(result)) as SyncConflictGroup[]
}

/** A reviewed group changes only its records; unrelated work retains its baseline. */
export function resolveConflictGroup(base: Partial<SharedState>, local: Partial<SharedState>, group: SyncConflictGroup, choice: 'local' | 'remote') {
  const nextBase = { ...base }, nextLocal = { ...local }
  for (const member of group.members) {
    replaceRecord(nextBase, member, member.remote)
    replaceRecord(nextLocal, member, choice === 'local' ? member.local : member.remote)
  }
  return { base: nextBase, local: nextLocal }
}

export function rebaseSharedState(
  base: Partial<SharedState>, local: Partial<SharedState>, remote: Partial<SharedState>,
  pending: Set<keyof SharedState>,
  previousUnbased: UnbasedRecords = {},
) {
  const state = { ...remote }
  const details: SyncConflictDetail[] = []
  const unbased: UnbasedRecords = {}
  const structuredGoals = new Set([...(local.goals ?? []), ...(remote.goals ?? [])]
    .filter(goal => goal.checklistItems !== undefined).map(goal => goal.id))
  const normalizedGoals = (snapshot: Partial<SharedState>) => snapshot.goals?.map(goal => {
    if (!structuredGoals.has(goal.id)) return goal
    const items = goalChecklist(goal, snapshot.events?.find(event => event.id === goal.linkedEventId || event.linkedGoalId === goal.id))
    return { ...goal, checklistItems: items, checklist: items.map(item => item.title) }
  })
  const normalizedEvents = (snapshot: Partial<SharedState>) => snapshot.events?.map(event => {
    if (!event.linkedGoalId || !structuredGoals.has(event.linkedGoalId) || event.todos !== undefined) return event
    const goal = snapshot.goals?.find(entry => entry.id === event.linkedGoalId)
    return goal ? { ...event, todos: goalChecklist(goal) } : event
  })
  for (const key of pending) {
    const note = (path: string[], b: unknown, l: unknown, r: unknown) => { details.push({ key, path, base: b, local: l, remote: r }) }
    const localItems = local[key]
    const missingBase = !Object.prototype.hasOwnProperty.call(base, key)
    const unknownIds = new Set(previousUnbased[key] ?? (missingBase && Array.isArray(localItems)
      ? localItems.map(item => identity(key, item as unknown as Record<string, unknown>)) : []))
    const unknown = [...unknownIds].filter(id => !sameValue(record(local, key, id), record(remote, key, id)))
    if (unknown.length) unbased[key] = unknown
    if (missingBase && Array.isArray(localItems) && Array.isArray(remote[key])) {
      // Remote-only records are additions to this cache, never inferred deletions.
      // Every differing local legacy record needs its own explicit choice.
      unknown.forEach(id => note([id], undefined, record(local, key, id), record(remote, key, id)))
      continue
    }
    const value = key === 'goals'
      ? mergeValue(normalizedGoals(base), normalizedGoals(local), normalizedGoals(remote), false, [], note)
      : key === 'events' ? mergeValue(normalizedEvents(base), normalizedEvents(local), normalizedEvents(remote), false, [], note)
      : mergeValue(base[key], local[key], remote[key], key === 'moods', [], note)
    Object.assign(state, { [key]: value })
    unknown.forEach(id => note([id], undefined, record(local, key, id), record(remote, key, id)))
  }
  const groups = conflictGroups(base, local, remote, details)
  const visible = { ...state }, nextBase = { ...remote }, acknowledgedBase = { ...local }
  const conflicts = [...new Set(groups.flatMap(group => group.members.map(member => member.key)))]
  // Freeze the complete affected records, including linked halves. Independent
  // records in the same collection can still merge, upload and receive updates.
  for (const group of groups) for (const member of group.members) {
    replaceRecord(state, member, member.remote, remote)
    replaceRecord(visible, member, member.local, local)
    replaceRecord(nextBase, member, member.base, base)
    replaceRecord(acknowledgedBase, member, member.base, base)
  }
  const remaining = new Set([...pending, ...conflicts].filter(key =>
    conflicts.includes(key) || !sameValue(visible[key], remote[key])))
  return { state, visible, base: nextBase, acknowledgedBase, remaining, unbased, conflicts, groups }
}
