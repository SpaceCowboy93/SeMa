'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, MotionConfig } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { getVerifiedAccess } from '@/lib/auth'
import { AccessError } from '@/lib/couple-access'
import { classifyAuthError } from '@/lib/classify-auth-error'

export default function LandingPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    getVerifiedAccess().then(() => {
      if (active) router.replace('/together')
    }).catch(failure => {
      if (active && !(failure instanceof AccessError && failure.status === 401)) {
        setError(classifyAuthError(failure))
      }
    })
    return () => { active = false }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) throw signInError
      await getVerifiedAccess()
      setPassword('')
      router.replace('/together')
    } catch (failure) {
      setError(classifyAuthError(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(ellipse at 20% 50%, rgba(167,139,250,0.18) 0%, transparent 60%), ' +
              'radial-gradient(ellipse at 80% 50%, rgba(45,212,191,0.18) 0%, transparent 60%), ' +
              'linear-gradient(135deg, #f5f3ff 0%, #fefce8 50%, #f0fdfa 100%)',
          }}
        />
        <motion.div className="absolute top-16 left-8 w-32 h-32 rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }}
          animate={{ scale: [1, 1.1, 1], x: [0, 6, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute bottom-24 right-8 w-40 h-40 rounded-full opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2dd4bf, transparent)' }}
          animate={{ scale: [1, 1.08, 1], x: [0, -6, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }} />

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} className="text-center w-full max-w-sm">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1, duration: 0.4 }} className="mb-2 text-5xl">💕</motion.div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-800 mb-1">SeMa</h1>
          <p className="text-gray-400 text-sm mb-8 font-medium">our little world, together</p>

          <motion.form initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }} onSubmit={handleSubmit} className="rounded-3xl bg-white/90 border border-white shadow-soft p-5 text-left space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
            </div>
            {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
            <button type="submit" disabled={submitting} className="w-full rounded-xl bg-violet-500 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-60 active:opacity-85">
              {submitting ? 'Signing in…' : 'Enter SeMa'}
            </button>
            <p className="text-center text-xs leading-5 text-gray-400">Accounts are private and created by the SeMa administrator.</p>
          </motion.form>

          <p className="text-xs text-gray-300 font-medium mt-8">made with love, just for you two</p>
        </motion.div>
      </div>
    </MotionConfig>
  )
}
