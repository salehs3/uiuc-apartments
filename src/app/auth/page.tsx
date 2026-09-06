'use client'

// src/app/auth/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function AuthPage() {
  const router = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Restrict to @illinois.edu emails for signup
    if (mode === 'signup' && !email.endsWith('@illinois.edu')) {
      setError('Only @illinois.edu email addresses can create an account.')
      return
    }

    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setSuccess('Check your email for a confirmation link, then sign in.')
        setMode('signin')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Invalid email or password.')
      } else {
        router.push('/')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#F2F0EB] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="block text-center font-bold text-xl text-[#13294B] mb-8">
          UIUC <span className="text-[#E84A27]">Apartments</span>
        </Link>

        <div className="bg-[#FAFAF8] rounded-2xl border border-[#E2DED8] p-10 shadow-[0_4px_24px_rgba(0,0,0,0.07)]">
          <h1 className="text-xl font-bold text-[#13294B] mb-1">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-sm text-[#A8A29E] mb-6">
            {mode === 'signup'
              ? 'Illinois email required to submit reviews'
              : 'Welcome back'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'signup' ? 'netid@illinois.edu' : 'you@example.com'}
                required
                className="w-full bg-[#EDECEA] border border-[#E2DED8] rounded-xl px-4 py-2.5 text-sm text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#13294B] focus:border-[#13294B] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-[#EDECEA] border border-[#E2DED8] rounded-xl px-4 py-2.5 text-sm text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#13294B] focus:border-[#13294B] transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-100 text-green-700 text-sm px-4 py-3 rounded-xl">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E84A27] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#c93d1e] transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-[#A8A29E]">
            {mode === 'signin' ? (
              <>
                No account?{' '}
                <button
                  onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
                  className="text-[#E84A27] font-medium hover:underline"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have one?{' '}
                <button
                  onClick={() => { setMode('signin'); setError(''); setSuccess('') }}
                  className="text-[#E84A27] font-medium hover:underline"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
