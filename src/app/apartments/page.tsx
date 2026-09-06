// src/app/apartments/page.tsx
import { createClient } from '@/lib/supabase/server'
import ApartmentCard from '@/components/ApartmentCard'
import Link from 'next/link'

type SortOption = 'rating' | 'price_asc' | 'price_desc' | 'reviews'
type SP = { sort?: string; pets?: string; parking?: string; utilities?: string }

export default async function ApartmentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const sort = (sp.sort ?? 'rating') as SortOption

  const sortMap: Record<SortOption, { column: string; ascending: boolean }> = {
    rating:    { column: 'rating_overall', ascending: false },
    price_asc: { column: 'rent_min',       ascending: true },
    price_desc:{ column: 'rent_max',       ascending: false },
    reviews:   { column: 'review_count',   ascending: false },
  }

  const { column, ascending } = sortMap[sort] ?? sortMap.rating

  let query = supabase
    .from('apartments')
    .select(`
      id, name, address, rent_min, rent_max,
      rating_overall, review_count, bedrooms,
      pets_allowed, parking_available,
      utilities_included, laundry_in_unit,
      ai_red_flags, ai_summary,
      landlords ( name )
    `)
    .order(column, { ascending })

  if (sp.pets === 'true')      query = query.eq('pets_allowed', true)
  if (sp.parking === 'true')   query = query.eq('parking_available', true)
  if (sp.utilities === 'true') query = query.eq('utilities_included', true)

  const { data: apartments } = await query

  const sortLabels: Record<SortOption, string> = {
    rating:    'Top rated',
    price_asc: 'Cheapest first',
    price_desc:'Most expensive',
    reviews:   'Most reviewed',
  }

  const activeFilters = [
    sp.pets === 'true' ? 'Pets' : null,
    sp.parking === 'true' ? 'Parking' : null,
    sp.utilities === 'true' ? 'Utilities included' : null,
  ].filter(Boolean)

  function buildUrl(params: Record<string, string>) {
    const base = { ...sp, ...params }
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(base).filter(([, v]) => v))
    )
    return `/apartments?${qs.toString()}`
  }

  return (
    <main className="min-h-screen bg-[#F2F0EB]">
      {/* Nav */}
      <nav className="bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-[#E2DED8] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link href="/" className="font-bold text-xl text-[#13294B]">
          UIUC <span className="text-[#E84A27]">Apartments</span>
        </Link>
        <Link
          href="/quiz"
          className="text-sm bg-[#E84A27] text-white px-4 py-2 rounded-lg hover:bg-[#c93d1e] transition-colors"
        >
          Find my match →
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#13294B]">All apartments</h1>
            <p className="text-sm text-[#A8A29E] mt-1">
              {apartments?.length ?? 0} listings in Champaign-Urbana
            </p>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#A8A29E] font-medium">Sort:</span>
            {(Object.keys(sortLabels) as SortOption[]).map((s) => (
              <Link
                key={s}
                href={buildUrl({ sort: s })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  sort === s
                    ? 'bg-[#13294B] text-white border-[#13294B]'
                    : 'bg-[#FAFAF8] text-[#78716C] border-[#E2DED8] hover:border-[#A8A29E]'
                }`}
              >
                {sortLabels[s]}
              </Link>
            ))}
          </div>
        </div>

        {/* Quick filters */}
        <div className="flex gap-2 flex-wrap mb-6">
          <span className="text-xs text-[#A8A29E] font-medium self-center">Filter:</span>
          {[
            { key: 'pets',      label: '🐾 Pets' },
            { key: 'parking',   label: '🚗 Parking' },
            { key: 'utilities', label: '💡 Utilities incl.' },
          ].map(({ key, label }) => {
            const active = sp[key as keyof SP] === 'true'
            return (
              <Link
                key={key}
                href={buildUrl({ [key]: active ? '' : 'true' })}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  active
                    ? 'bg-[#E84A27] text-white border-[#E84A27]'
                    : 'bg-[#FAFAF8] text-[#78716C] border-[#E2DED8] hover:border-[#A8A29E]'
                }`}
              >
                {label}
              </Link>
            )
          })}
          {activeFilters.length > 0 && (
            <Link
              href="/apartments"
              className="text-xs px-3 py-1.5 rounded-full border border-[#E2DED8] text-[#A8A29E] hover:border-[#A8A29E] transition-colors"
            >
              Clear filters ✕
            </Link>
          )}
        </div>

        {/* Grid */}
        {!apartments?.length ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🏠</div>
            <p className="text-[#78716C] text-sm">No apartments found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apartments.map((apt) => (
              <ApartmentCard key={apt.id} apt={apt} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
