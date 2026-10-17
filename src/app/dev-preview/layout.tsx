/**
 * Dev-preview layout — server component guard.
 *
 * Returns 404 in any environment that is not NODE_ENV=development.
 * In development it renders the client shell that seeds the store with
 * fixtures and provides an isolated navigation without any Supabase hooks.
 */

import { notFound } from 'next/navigation'
import { DevPreviewShell } from './_shell'

export default function DevPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }
  return <DevPreviewShell>{children}</DevPreviewShell>
}
