'use client'
// src/app/admin/AdminReviewCard.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdminReviewCard({ review }: { review: any }) {
  const supabase = createClient()
  const [status, setStatus] = useState<'idle' | 'loading' | 'approved' | 'rejected'>('idle')
  const [leaseUrl, setLeaseUrl] = useState<string | null>(null)
  const [showLease, setShowLease] = useState(false)

  const apt = review.apartments
  const profile = review.profiles
  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  const avgRating = review.rating_maintenance
    ? ((review.rating_maintenance + review.rating_responsiveness +
        review.rating_noise + review.rating_cleanliness +
        review.rating_value + review.rating_pests) / 6).toFixed(1)
    : null

  async function viewLease() {
    if (leaseUrl) { setShowLease(true); return }

    const { data } = await supabase.storage
      .from('lease-docs')
      .createSignedUrl(review.lease_doc_url, 60) // 60 second expiry

    if (data?.signedUrl) {
      setLeaseUrl(data.signedUrl)
      setShowLease(true)
    }
  }

  async function approve() {
    setStatus('loading')
    const { error } = await supabase
      .from('reviews')
      .update({ verified_tenant: true })
      .eq('id', review.id)

    setStatus(error ? 'idle' : 'approved')
  }

  async function reject() {
    setStatus('loading')
    // Clear the lease doc but leave the review — they just don't get the badge
    const { error } = await supabase
      .from('reviews')
      .update({ lease_doc_url: null })
      .eq('id', review.id)

    setStatus(error ? 'idle' : 'rejected')
  }

  if (status === 'approved') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 text-sm text-green-700 font-medium">
        ✓ Verified — badge now shows on {profile?.display_name ?? 'user'}'s review
      </div>
    )
  }

  if (status === 'rejected') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-sm text-gray-500">
        Rejected — lease document removed, review remains without badge
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-gray-800 text-sm">
            {profile?.display_name ?? 'Anonymous'}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {apt?.name} · {date}
          </div>
        </div>
        {avgRating && (
          <div className="text-right">
            <div className="text-lg font-bold text-[#13294B]">{avgRating}</div>
            <div className="text-xs text-gray-400">/ 5 avg</div>
          </div>
        )}
      </div>

      {/* Review body */}
      {review.body && (
        <p className="text-sm text-gray-600 leading-relaxed border-l-2 border-gray-200 pl-3">
          {review.body}
        </p>
      )}

      {/* Lease preview */}
      {showLease && leaseUrl && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          {leaseUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i) ? (
            <img src={leaseUrl} alt="Lease document" className="w-full max-h-64 object-contain" />
          ) : (
            <div className="p-4 flex items-center justify-between bg-gray-50">
              <span className="text-sm text-gray-600">📄 PDF lease document</span>
              <a href={leaseUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#13294B] font-semibold hover:underline">
                Open PDF →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={viewLease}
          className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:border-gray-400 transition-colors"
        >
          {showLease ? 'Hide lease' : 'View lease'}
        </button>

        <a
          href={`/apartments/${apt?.id}`}
          target="_blank"
          className="text-sm border border-gray-200 text-gray-600 px-4 py-2 rounded-xl hover:border-gray-400 transition-colors"
        >
          View apartment →
        </a>

        <div className="ml-auto flex gap-2">
          <button
            onClick={reject}
            disabled={status === 'loading'}
            className="text-sm border border-red-200 text-red-500 px-4 py-2 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            Reject
          </button>
          <button
            onClick={approve}
            disabled={status === 'loading'}
            className="text-sm bg-green-600 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-40 font-semibold"
          >
            {status === 'loading' ? 'Saving...' : '✓ Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
