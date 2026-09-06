// src/components/ApartmentCard.tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'

type Apartment = {
  id: string
  name: string
  address: string
  rent_min: number | null
  rent_max: number | null
  rating_overall: number
  review_count: number
  bedrooms: number[] | null
  pets_allowed: boolean
  parking_available: boolean
  utilities_included: boolean
  laundry_in_unit: boolean
  ai_red_flags: string[]
  ai_summary: {
    pros: string[]
    cons: string[]
    summary: string
  } | null
  landlords: { name: string }[] | null
}

const RED_FLAG_LABELS: Record<string, string> = {
  deposit_disputes: '⚠️ Deposit disputes',
  pest_issues: '🐛 Pest issues',
  mold_reported: '🚨 Mold reported',
  unresponsive_landlord: '📵 Unresponsive landlord',
  hidden_fees: '💸 Hidden fees',
  safety_concerns: '🔒 Safety concerns',
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(rating)
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`text-sm ${s <= stars ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
      ))}
      <span className="text-sm font-semibold text-gray-700 ml-1">
        {rating > 0 ? rating.toFixed(1) : 'No ratings'}
      </span>
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-600' :
    score >= 60 ? 'bg-yellow-500' :
    'bg-red-500'
  return (
    <span className={`${color} text-white text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0`}>
      {score}% match
    </span>
  )
}

export default function ApartmentCard({
  apt,
  score,
  reasons = [],
  misses = [],
  partials = [],
}: {
  apt: Apartment
  score?: number
  reasons?: string[]
  misses?: string[]
  partials?: string[]
}) {
  const [showReasons, setShowReasons] = useState(false)

  const bedroomLabel = apt.bedrooms?.length
    ? apt.bedrooms.map((b) => (b === 0 ? 'Studio' : `${b}BR`)).join(', ')
    : null

  const rentLabel =
    apt.rent_min && apt.rent_max
      ? `$${apt.rent_min}–$${apt.rent_max}/mo`
      : apt.rent_min
      ? `From $${apt.rent_min}/mo`
      : 'Rent TBD'

  const hasReasons = reasons.length > 0 || misses.length > 0 || partials.length > 0

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#13294B] text-base leading-tight">{apt.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{apt.address}</p>
          {apt.landlords?.[0]?.name && (
            <p className="text-xs text-gray-400">Managed by {apt.landlords[0].name}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-[#13294B] text-sm">{rentLabel}</div>
          {bedroomLabel && <div className="text-xs text-gray-400 mt-0.5">{bedroomLabel}</div>}
        </div>
      </div>

      {/* Score + rating row */}
      <div className="flex items-center justify-between">
        <StarRating rating={apt.rating_overall} />
        {score !== undefined && <ScoreBadge score={score} />}
      </div>

      {/* Red flags */}
      {apt.ai_red_flags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {apt.ai_red_flags.map((flag) => (
            <span key={flag} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">
              {RED_FLAG_LABELS[flag] ?? flag}
            </span>
          ))}
        </div>
      )}

      {/* Why this match */}
      {hasReasons && (
        <div>
          <button
            onClick={() => setShowReasons((v) => !v)}
            className="text-xs font-semibold text-[#13294B] hover:underline"
          >
            {showReasons ? '▲ Hide reasons' : '▼ Why this match?'}
          </button>

          {showReasons && (
            <div className="mt-2 flex flex-col gap-1.5">
              {reasons.map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                  {r}
                </div>
              ))}
              {partials.map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                  {r}
                </div>
              ))}
              {misses.map((r) => (
                <div key={r} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Amenity chips */}
      <div className="flex flex-wrap gap-1.5">
        {apt.pets_allowed && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">🐾 Pets</span>}
        {apt.parking_available && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">🚗 Parking</span>}
        {apt.utilities_included && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">💡 Utilities</span>}
        {apt.laundry_in_unit && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">🧺 In-unit laundry</span>}
      </div>

      {/* CTA */}
      <Link
        href={`/apartments/${apt.id}`}
        className="block text-center bg-[#13294B] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#0f1f38] transition-colors mt-auto"
      >
        View details →
      </Link>
    </div>
  )
}
