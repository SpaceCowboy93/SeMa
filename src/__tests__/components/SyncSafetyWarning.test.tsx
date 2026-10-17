import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SyncSafetyWarning } from '@/components/SyncSafetyWarning'
import { coupleStorage, persistSyncCheckpoint, setCacheScope } from '@/lib/couple-cache'

const mocks = vi.hoisted(() => ({ retry: vi.fn(), warning: null as string | null }))
vi.mock('@/hooks/useSupabaseSync', () => ({ triggerPull: mocks.retry, useSyncStatus: () => ({ status: 'error', warning: mocks.warning }) }))
afterEach(() => { vi.restoreAllMocks(); setCacheScope(null); localStorage.clear(); mocks.warning = null; mocks.retry.mockReset() })

it('shows a persistent storage warning with an accessible retry action and clears it after recovery', () => {
  const access = { userId: 'local', userName: 'mateo' as const, coupleId: 'warning-local', stateId: 'sema' }
  setCacheScope(access)
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  })
  coupleStorage.setItem('unused', '{"state":{}}')
  render(<SyncSafetyWarning />)
  expect(screen.getByRole('alert')).toHaveTextContent('Keep this tab open')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(mocks.retry).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  storage.mockRestore()
  act(() => { persistSyncCheckpoint(access, { moods: [] }, { moods: [] }, new Set()) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('surfaces remote quarantine without displaying record contents', () => {
  mocks.warning = 'Shared data could not be read safely. Saving is paused to protect your data.'
  render(<SyncSafetyWarning />)
  expect(screen.getByRole('alert')).toHaveTextContent('Saving is paused')
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
})
