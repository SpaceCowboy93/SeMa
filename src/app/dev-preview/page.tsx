'use client'

/**
 * Dev-preview identity picker.
 *
 * Displayed at /dev-preview. Lets the developer choose a fake identity
 * (Mateo or Seval) and navigate to /dev-preview/together to explore
 * the full UI with fixture data.
 *
 * The "Reset fixtures" button wipes saved edits so the next load starts
 * fresh from the canonical fixture set.
 */

import { useRouter } from 'next/navigation'
import { useAppStore } from '@/store/useAppStore'
import {
  savePreviewUser,
  clearPreviewState,
  getDevPreviewFixtures,
} from '@/lib/dev-preview-fixtures'
import type { UserName } from '@/types'

export default function DevPreviewPage() {
  const router = useRouter()

  function pickUser(user: UserName) {
    savePreviewUser(user)
    const fixtures = getDevPreviewFixtures(user)
    useAppStore.setState(fixtures)
    router.push('/dev-preview/together')
  }

  function resetFixtures() {
    clearPreviewState()
    const user     = useAppStore.getState().currentUser ?? 'mateo'
    const fixtures = getDevPreviewFixtures(user)
    useAppStore.setState(fixtures)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-6 bg-gradient-to-br from-violet-50 to-teal-50">
      <div className="text-center">
        <div className="text-4xl mb-2">&#128995;</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Local Preview</h1>
        <p className="text-sm text-gray-500">Explore the UI with fake data &mdash; no network required</p>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <p className="text-xs font-medium text-gray-400 text-center uppercase tracking-wider">
          Preview as
        </p>

        <button
          onClick={() => pickUser('mateo')}
          className="w-full flex items-center gap-4 rounded-2xl bg-white border border-gray-200 shadow-sm px-5 py-4 text-left hover:border-teal-300 hover:shadow-md transition-all active:scale-[0.98]"
        >
          <span className="text-2xl">&#129337;</span>
          <div>
            <div className="font-semibold text-gray-800">Mateo</div>
            <div className="text-xs text-gray-400">teal theme &middot; fake account</div>
          </div>
        </button>

        <button
          onClick={() => pickUser('seval')}
          className="w-full flex items-center gap-4 rounded-2xl bg-white border border-gray-200 shadow-sm px-5 py-4 text-left hover:border-violet-300 hover:shadow-md transition-all active:scale-[0.98]"
        >
          <span className="text-2xl">&#129338;</span>
          <div>
            <div className="font-semibold text-gray-800">Seval</div>
            <div className="text-xs text-gray-400">purple theme &middot; fake account</div>
          </div>
        </button>
      </div>

      <button
        onClick={resetFixtures}
        className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
      >
        Reset to default fixtures
      </button>
    </div>
  )
}
