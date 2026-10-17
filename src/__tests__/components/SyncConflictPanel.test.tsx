import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SyncConflictPanel } from '@/components/SyncConflictPanel'
import type { SyncConflictGroup, SyncResolutionArchive } from '@/lib/sync-merge'

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), review: { groups: [] as SyncConflictGroup[], archives: [] as SyncResolutionArchive[], busy: false, message: null as string | null } }))
vi.mock('@/hooks/useSupabaseSync', () => ({ useSyncConflicts: () => mocks.review, resolveBackgroundConflict: mocks.resolve }))
const group: SyncConflictGroup = { id: 'group-id', title: 'Trip', fields: ['todos / item-internal-id / title'], members: [
  { key: 'goals', recordId: 'goal-internal-id', base: { title: 'Trip' }, local: { id: 'goal-internal-id', title: 'Local trip' }, remote: { title: 'Remote trip' } },
  { key: 'events', recordId: 'event-internal-id', base: { title: 'Trip' }, local: undefined, remote: { title: 'Remote trip' } },
] }
beforeEach(() => { mocks.resolve.mockReset(); mocks.review = { groups: [group], archives: [], busy: false, message: null } })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('identifies linked records, fields and both versions without exposing internal identifiers', () => {
  render(<SyncConflictPanel />)
  expect(screen.getByRole('complementary', { name: 'Synchronization recovery' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Conflict: Trip' })).toHaveTextContent('Local trip')
  expect(screen.getByRole('region', { name: 'Conflict: Trip' })).toHaveTextContent('Remote trip')
  expect(screen.getByRole('alert')).toHaveTextContent('Linked records are chosen together')
  expect(screen.getByText('Dreams')).toBeInTheDocument()
  expect(screen.getByText('Calendar')).toBeInTheDocument()
  expect(screen.getByText(/Affected fields:/)).toHaveTextContent('title')
  expect(screen.queryByText(/internal-id/)).not.toBeInTheDocument()
})

it.each(['local', 'remote'] as const)('passes the exact reviewed group for explicit %s resolution and disables choices during requests', choice => {
  const rendered = render(<SyncConflictPanel />)
  const label = choice === 'local' ? 'Keep local version' : 'Use remote version'
  fireEvent.click(screen.getByRole('button', { name: label }))
  expect(mocks.resolve).toHaveBeenCalledWith(group, choice)
  mocks.review.busy = true; rendered.rerender(<SyncConflictPanel />)
  expect(screen.getByRole('button', { name: label })).toBeDisabled()
})

it('retains downloadable review history after active conflicts disappear', () => {
  vi.useFakeTimers()
  const createObjectURL = vi.fn().mockReturnValue('blob:local-history'), revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  mocks.review = { groups: [], archives: [{ id: 'history', at: '2026-10-13', choice: 'remote', group }], busy: false, message: 'Saved on this device' }
  render(<SyncConflictPanel />)
  fireEvent.click(screen.getByText('Synchronization recovery history'))
  fireEvent.click(screen.getByText('Recovery history (1)'))
  fireEvent.click(screen.getByRole('button', { name: 'Download recovery history' }))
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  expect(click).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/Browser storage may be cleared or evicted/)).toBeInTheDocument()
  vi.advanceTimersByTime(1000)
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-history')
})

it('renders no panel when there are no conflicts or recovery versions', () => {
  mocks.review.groups = []
  render(<SyncConflictPanel />)
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})

it('shows legacy checklist text and explains the uncertainty of a missing baseline before a choice', () => {
  mocks.review.groups = [{ ...group, members: [{ key: 'goals', recordId: 'legacy', base: undefined,
    local: { title: 'Trip', checklist: ['Unique laptop checklist'] },
    remote: { title: 'Trip', checklist: ['Newer shared checklist'] } }] }]
  render(<SyncConflictPanel />)
  expect(screen.getByText(/Unique laptop checklist/)).toBeInTheDocument()
  expect(screen.getByText(/Newer shared checklist/)).toBeInTheDocument()
  expect(screen.getByText(/previously deleted shared record/)).toBeInTheDocument()
})
