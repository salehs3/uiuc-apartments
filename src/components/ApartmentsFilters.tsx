'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'

export default function ApartmentsFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    updateParam('q', searchInput || null)
  }

  const sort = searchParams.get('sort') ?? 'rating'
  const beds = searchParams.get('beds') ?? ''
  const pets = searchParams.get('pets') === '1'
  const parking = searchParams.get('parking') === '1'
  const utilities = searchParams.get('utilities') === '1'
  const laundry = searchParams.get('laundry') === '1'

  const hasFilters = beds || pets || parking || utilities || laundry || searchParams.get('q')

  function clearAll() {
    setSearchInput('')
    startTransition(() => {
      router.push(pathname)
    })
  }

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-4 mb-6 space-y-4 transition-opacity ${isPending ? 'opacity-60' : ''}`}>
      {/* Search + Sort */}
      <form onSubmit={handleSearch} className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by building name..."
          className="flex-1 min-w-48 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#13294B] transition-colors"
        />
        <button
          type="submit"
          className="bg-[#13294B] text-white text-sm px-4 py-2 rounded-xl hover:bg-[#0f1f38] transition-colors"
        >
          Search
        </button>
        <select
          value={sort}
          onChange={(e) => updateParam('sort', e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#13294B] transition-colors"
        >
          <option value="rating">Top rated</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
        </select>
      </form>

      {/* Bedrooms */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">Bedrooms</span>
        {[
          { label: 'Any', value: '' },
          { label: 'Studio', value: '0' },
          { label: '1BR', value: '1' },
          { label: '2BR', value: '2' },
          { label: '3BR', value: '3' },
        ].map(({ label, value }) => (
          <button
            key={label}
            onClick={() => updateParam('beds', beds === value ? '' : value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              beds === value && value !== ''
                ? 'bg-[#13294B] text-white border-[#13294B]'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Amenities */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-gray-400 w-20 flex-shrink-0">Amenities</span>
        {[
          { key: 'pets', label: '🐾 Pets', active: pets },
          { key: 'parking', label: '🚗 Parking', active: parking },
          { key: 'utilities', label: '💡 Utilities incl.', active: utilities },
          { key: 'laundry', label: '🧺 In-unit laundry', active: laundry },
        ].map(({ key, label, active }) => (
          <button
            key={key}
            onClick={() => updateParam(key, active ? null : '1')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active
                ? 'bg-[#E84A27] text-white border-[#E84A27]'
                : 'border-gray-200 text-gray-600 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-gray-400 hover:text-gray-700 ml-2 underline transition-colors"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  )
}
