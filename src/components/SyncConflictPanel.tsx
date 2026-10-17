'use client'

import { resolveBackgroundConflict, useSyncConflicts } from '@/hooks/useSupabaseSync'
import type { SyncConflictGroup } from '@/lib/sync-merge'

const names: Record<string, string> = { events: 'Calendar', goals: 'Dreams', todos: 'To-Dos', moods: 'Moods',
  monthlyIncome: 'Monthly income', boomBoomCount: 'Count', checklistItems: 'Checklist', isCompleted: 'Done', todosField: 'Checklist' }
const name = (field: string) => names[field] ?? field.replace(/([a-z])([A-Z])/g, '$1 $2')
function version(value: unknown): string {
  if (value === undefined) return 'Removed / not present'
  if (Array.isArray(value)) return value.map(version).join('\n\n') || 'Empty list'
  if (value && typeof value === 'object') return Object.entries(value)
    .filter(([key]) => !['id', 'key', 'createdAt', 'updatedAt', 'linkedGoalId', 'linkedTodoId', 'linkedEventId'].includes(key) &&
      (key !== 'checklist' || !Array.isArray((value as Record<string, unknown>).checklistItems)))
    .map(([key, entry]) => `${name(key === 'todos' ? 'todosField' : key)}: ${version(entry)}`).join('\n')
  return typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value ?? 'Empty')
}
function Versions({ group }: { group: SyncConflictGroup }) {
  return <div className="space-y-3">
    {group.members.map(member => <div key={`${member.key}:${member.recordId ?? ''}`}>
      <p className="font-semibold">{name(member.key)}</p>
      {member.base === undefined && <p>No earlier shared version is available for comparison. A local-only record may also be a previously deleted shared record.</p>}
      <p className="mt-1 font-medium">Local version</p>
      <p className="whitespace-pre-wrap break-words">{version(member.local)}</p>
      <p className="mt-1 font-medium">Remote version</p>
      <p className="whitespace-pre-wrap break-words">{version(member.remote)}</p>
    </div>)}
  </div>
}
export function SyncConflictPanel() {
  const { groups, archives, busy, message } = useSyncConflicts()
  if (!groups.length && !archives.length) return null
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, archives }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'sema-sync-recovery.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <aside aria-label="Synchronization recovery" className="fixed bottom-20 left-3 right-3 z-[999] mx-auto max-w-lg rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg">
    <details open={groups.length > 0}>
      <summary className="cursor-pointer font-semibold">{groups.length ? `Synchronization conflicts (${groups.length})` : 'Synchronization recovery history'}</summary>
      <div className="mt-3 max-h-[55vh] space-y-4 overflow-y-auto">
        {groups.length > 0 && <p role="alert">Some edits need your choice. Linked records are chosen together. Both reviewed versions will be retained in recovery history.</p>}
        {message && <p role="status">{message}</p>}
        {groups.map(group => <section key={group.id} aria-label={`Conflict: ${group.title}`} className="rounded-lg border border-amber-300 p-3">
          <h2 className="font-semibold">{group.title}</h2>
          <p>Affected fields: {group.fields.map(field => name(field.split(' / ').at(-1) ?? field)).join(', ')}</p>
          <Versions group={group} />
          <p className="mt-2">This choice applies to the affected records above. Other records keep their edits.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => { void resolveBackgroundConflict(group, 'local') }} className="rounded-lg border border-amber-700 px-3 py-2 disabled:opacity-50">Keep local version</button>
            <button type="button" disabled={busy} onClick={() => { void resolveBackgroundConflict(group, 'remote') }} className="rounded-lg border border-amber-700 px-3 py-2 disabled:opacity-50">Use remote version</button>
          </div>
        </section>)}
        {archives.length > 0 && <details>
          <summary className="cursor-pointer font-semibold">Recovery history ({archives.length})</summary>
          <p className="my-2">Reviewed versions saved on this device. Browser storage may be cleared or evicted; download a copy to retain them separately.</p>
          <button type="button" onClick={download} className="mb-2 rounded-lg border border-amber-700 px-3 py-2">Download recovery history</button>
          {archives.map(archive => <details key={archive.id} className="mt-2">
            <summary className="cursor-pointer">{archive.group.title} — {archive.choice === 'unresolved' ? 'unresolved versions' : `chose ${archive.choice}`} — {archive.at}</summary>
            <Versions group={archive.group} />
          </details>)}
        </details>}
      </div>
    </details>
  </aside>
}
