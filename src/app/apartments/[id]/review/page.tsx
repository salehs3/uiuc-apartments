'use client'
// src/app/apartments/[id]/review/page.tsx

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const RATING_FIELDS = [
  { key: 'rating_maintenance',    label: 'Maintenance speed',        hint: '1 = weeks to fix, 5 = same day' },
  { key: 'rating_responsiveness', label: 'Landlord responsiveness',  hint: '1 = never replies, 5 = always available' },
  { key: 'rating_noise',          label: 'Noise level',              hint: '1 = very loud, 5 = very quiet' },
  { key: 'rating_cleanliness',    label: 'Cleanliness',              hint: '1 = dirty common areas, 5 = spotless' },
  { key: 'rating_value',          label: 'Value for money',          hint: '1 = overpriced, 5 = great deal' },
  { key: 'rating_pests',          label: 'Pest control',             hint: '1 = serious issues, 5 = never saw a bug' },
]

function RatingSelector({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${value ? 'text-[#E84A27]' : 'text-gray-300'}`}>
          {value ? `${value}/5` : '—'}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-2">{hint}</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button" onClick={() => onChange(n)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
              value === n
                ? 'border-[#E84A27] bg-orange-50 text-[#E84A27]'
                : 'border-gray-200 text-gray-400 hover:border-gray-300'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams()
  const aptId = params.id as string
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [aptName, setAptName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [ratings, setRatings] = useState({
    rating_maintenance: 0,
    rating_responsiveness: 0,
    rating_noise: 0,
    rating_cleanliness: 0,
    rating_value: 0,
    rating_pests: 0,
  })
  const [body, setBody] = useState('')
  const [livedFrom, setLivedFrom] = useState('')
  const [livedUntil, setLivedUntil] = useState('')
  const [stillLivingHere, setStillLivingHere] = useState(false)
  const [leaseFile, setLeaseFile] = useState<File | null>(null)
  const [leasePreview, setLeasePreview] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push(`/auth?redirect=/apartments/${aptId}/review`)
      } else {
        setUser(data.user)
      }
    })
    supabase.from('apartments').select('name').eq('id', aptId).single()
      .then(({ data }) => { if (data) setAptName(data.name) })
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Only allow images and PDFs
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setError('Please upload a JPG, PNG, or PDF file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB.')
      return
    }

    setLeaseFile(file)
    setError('')

    // Show preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setLeasePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setLeasePreview('')
    }
  }

  const allRated = Object.values(ratings).every((v) => v > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!allRated) { setError('Please rate all 6 categories.'); return }

    setLoading(true)
    setError('')

    let leaseDocUrl: string | null = null

    // Upload lease doc if provided
    if (leaseFile) {
      const ext = leaseFile.name.split('.').pop()
      const path = `${user.id}/${aptId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('lease-docs')
        .upload(path, leaseFile, { upsert: true })

      if (uploadError) {
        setError(`Lease upload failed: ${uploadError.message}`)
        setLoading(false)
        return
      }

      leaseDocUrl = path // store path, not public URL (bucket is private)
    }

    const { error } = await supabase.from('reviews').insert({
      apartment_id: aptId,
      user_id: user.id,
      ...ratings,
      body: body.trim() || null,
      lived_from: livedFrom || null,
      lived_until: stillLivingHere ? null : livedUntil || null,
      lease_doc_url: leaseDocUrl,
      verified_tenant: false, // admin will flip this after reviewing the lease
    })

    if (error) {
      setError(error.code === '23505'
        ? 'You already submitted a review for this apartment.'
        : error.message)
      setLoading(false)
    } else {
      router.push(`/apartments/${aptId}?reviewed=true`)
    }
  }

  if (!user) return null

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="font-bold text-[#13294B]">
          UIUC <span className="text-[#E84A27]">Apartments</span>
        </Link>
        <Link href={`/apartments/${aptId}`}
          className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-400">
          ← Cancel
        </Link>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#13294B]">Write a review</h1>
          {aptName && <p className="text-sm text-gray-400 mt-1">{aptName}</p>}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Ratings */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
            <h2 className="text-sm font-bold text-[#13294B] uppercase tracking-wide">Rate your experience</h2>
            {RATING_FIELDS.map(({ key, label, hint }) => (
              <RatingSelector
                key={key} label={label} hint={hint}
                value={ratings[key as keyof typeof ratings]}
                onChange={(v) => setRatings((r) => ({ ...r, [key]: v }))}
              />
            ))}
          </div>

          {/* Written review */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-[#13294B] uppercase tracking-wide mb-3">
              Written review <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </h2>
            <textarea
              value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Tell future tenants what it's really like to live here..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#13294B] transition-colors resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{body.length}/1000</p>
          </div>

          {/* Dates */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-[#13294B] uppercase tracking-wide mb-3">
              When did you live here? <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Move-in</label>
                <input type="month" value={livedFrom}
                  onChange={(e) => setLivedFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#13294B]" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Move-out</label>
                <input type="month" value={livedUntil}
                  onChange={(e) => setLivedUntil(e.target.value)}
                  disabled={stillLivingHere}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#13294B] disabled:opacity-40" />
              </div>
            </div>
            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={stillLivingHere}
                onChange={(e) => setStillLivingHere(e.target.checked)}
                className="accent-[#E84A27]" />
              <span className="text-sm text-gray-600">I currently live here</span>
            </label>
          </div>

          {/* Lease upload */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-sm font-bold text-[#13294B] uppercase tracking-wide mb-1">
              Verify you lived here <span className="text-gray-400 font-normal normal-case">(optional)</span>
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Upload a photo or PDF of your lease showing the building name and your name.
              Black out anything sensitive. Once reviewed, you'll get a{' '}
              <span className="text-green-600 font-semibold">✓ Verified tenant</span> badge.
            </p>

            <input
              ref={fileRef} type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {!leaseFile ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl py-6 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors"
              >
                Click to upload lease (JPG, PNG, or PDF · max 5MB)
              </button>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4">
                {leasePreview ? (
                  <img src={leasePreview} alt="Lease preview"
                    className="w-full max-h-48 object-contain rounded-lg mb-3" />
                ) : (
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">📄</span>
                    <span className="text-sm font-medium text-gray-700">{leaseFile.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-600 font-medium">✓ Lease attached</span>
                  <button
                    type="button"
                    onClick={() => { setLeaseFile(null); setLeasePreview('') }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading || !allRated}
            className="w-full bg-[#E84A27] text-white py-3 rounded-xl font-semibold hover:bg-[#c93d1e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit review'}
          </button>

          {!allRated && (
            <p className="text-xs text-center text-gray-400">Rate all 6 categories to submit</p>
          )}
        </form>
      </div>
    </main>
  )
}
