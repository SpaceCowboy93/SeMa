'use client'

import type { DraftChoice, DraftConflict } from '@/lib/draft-merge'

function describe(value: unknown): string {
  if (value === undefined) return 'Removed'
  if (Array.isArray(value)) return value.map(describe).join(', ') || 'Empty checklist'
  if (value && typeof value === 'object') {
    const item = value as { title?: string; isCompleted?: boolean }
    return item.title ? item.title + (item.isCompleted === undefined ? '' : item.isCompleted ? ' (done)' : ' (not done)') : 'Draft retained'
  }
  if (typeof value === 'boolean') return value ? 'Done' : 'Not done'
  return String(value ?? '') || 'Empty'
}
function label(path: string) {
  if (path.startsWith('todos.') || path.startsWith('checklistItems.')) return 'Checklist'
  return ({ title: 'Title', notes: 'Notes', date: 'Date', targetDate: 'Date', startTime: 'Start time', endTime: 'End time',
    todos: 'Checklist', checklistItems: 'Checklist', photos: 'Photos', backgroundPhoto: 'Background photo', record: 'Item', link: 'Linked item' } as Record<string, string>)[path] ?? 'Field'
}
export function DraftConflictNotice({ conflicts, onResolve }: {
  conflicts: DraftConflict[]; onResolve: (choice: DraftChoice) => void
}) {
  if (!conflicts.length) return null
  const blocked = conflicts.some(conflict => conflict.path === 'record' || conflict.path === 'link')
  return (
    <div role="alert" className="my-3 max-h-64 overflow-y-auto break-words rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p>{blocked ? 'This item was removed or relinked. Your draft is still open. Close and reopen to edit the current version.'
        : 'Your partner changed the same fields. Your draft has been kept. Choose which version to save.'}</p>
      {conflicts.map(conflict => (
        <div key={conflict.path} className="mt-2">
          <p className="font-semibold">{label(conflict.path)}</p>
          <p className="whitespace-pre-wrap">Your draft: {describe(conflict.mine)}</p>
          <p className="whitespace-pre-wrap">Latest: {describe(conflict.latest)}</p>
        </div>
      ))}
      <div className="mt-3 flex flex-wrap gap-2">
        {!blocked && <button type="button" className="rounded-lg border border-amber-700 px-3 py-2" onClick={() => onResolve('mine')}>Keep my changes</button>}
        <button type="button" className="rounded-lg border border-amber-700 px-3 py-2" onClick={() => onResolve('latest')}>{blocked ? 'Close draft' : 'Use latest changes'}</button>
      </div>
    </div>
  )
}
