'use client'
// src/components/AISummaryButton.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AISummaryButton({ apartmentId }: { apartmentId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function generate() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apartment_id: apartmentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate summary')
      } else {
        router.refresh() // reload page to show new summary
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#FAFAF8] rounded-2xl border border-[#E2DED8] border-l-4 border-l-[#13294B] p-6">
      <h2 className="text-base font-bold text-[#13294B] mb-2">🤖 AI Summary</h2>
      <p className="text-sm text-[#A8A29E] mb-4">
        Generate an AI summary of all reviews — pros, cons, and an overall verdict.
      </p>
      <button
        onClick={generate}
        disabled={loading}
        className="text-sm bg-[#13294B] text-white px-4 py-2 rounded-xl hover:bg-[#0f1f38] transition-colors disabled:opacity-50"
      >
        {loading ? 'Generating…' : 'Generate AI summary'}
      </button>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}
