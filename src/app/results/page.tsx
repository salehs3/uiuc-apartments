// src/app/results/page.tsx
import { createClient } from '@/lib/supabase/server'
import ApartmentCard from '@/components/ApartmentCard'
import MapView from '@/components/MapView'
import Link from 'next/link'
import { scoreApartment, type Preferences } from '@/lib/scoring'
import { BUILDINGS } from '@/lib/buildings'

type SearchParams = {
  budgetMin?: string
  budgetMax?: string
  bedrooms?: string
  nearestBuilding?: string
  pets?: string
  parking?: string
  utilitiesIncluded?: string
  laundryInUnit?: string
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const prefs: Preferences = {
    budgetMin: Number(params.budgetMin ?? 0),
    budgetMax: Number(params.budgetMax ?? 9999),
    bedrooms: params.bedrooms
      ? params.bedrooms.split(',').map(Number)
      : [],
    nearestBuilding: params.nearestBuilding ?? '',
    pets: params.pets === 'true',
    parking: params.parking === 'true',
    utilitiesIncluded: params.utilitiesIncluded === 'true',
    laundryInUnit: params.laundryInUnit === 'true',
  }

  const { data: apartments, error } = await supabase
    .from('apartments')
    .select(`
      id, name, address, lat, lng,
      rent_min, rent_max, bedrooms,
      rating_overall, review_count,
      pets_allowed, parking_available,
      utilities_included, laundry_in_unit,
      ai_red_flags, ai_summary,
      landlords ( name )
    `)
    .lte('rent_min', Math.round(prefs.budgetMax * 1.2))   // hard exclude anything >20% over budget

  // Score every apartment (0-100 = match %), then rank by score. When two
  // apartments are within 2 points of each other, treat it as a tie and
  // prefer the cheaper one instead.
  const scored = (apartments ?? [])
    .map((apt) => ({
      ...apt,
      ...scoreApartment(apt, prefs),
    }))
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) <= 2) {
        return (a.rent_min ?? Infinity) - (b.rent_min ?? Infinity)
      }
      return b.score - a.score
    })

  const activeFilters = [
    prefs.budgetMin > 0 || prefs.budgetMax < 9999
      ? `$${prefs.budgetMin}–$${prefs.budgetMax}/mo`
      : null,
    prefs.bedrooms.length > 0
      ? prefs.bedrooms.map((b) => (b === 0 ? 'Studio' : `${b}BR`)).join(', ')
      : null,
    prefs.pets ? 'Pets' : null,
    prefs.parking ? 'Parking' : null,
    prefs.utilitiesIncluded ? 'Utilities included' : null,
    prefs.laundryInUnit ? 'In-unit laundry' : null,
  ].filter(Boolean)

  return (
    <main className="h-screen overflow-hidden bg-gray-50 flex flex-col">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <Link href="/" className="font-bold text-[#13294B]">
          UIUC <span className="text-[#E84A27]">Apartments</span>
        </Link>
        <Link
          href="/quiz"
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg"
        >
          ← Edit search
        </Link>
      </nav>

      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 bg-white">
        <h1 className="text-xl font-bold text-[#13294B]">
          {scored.length > 0
            ? `${scored.length} apartment${scored.length !== 1 ? 's' : ''} ranked for you`
            : 'No apartments found'}
        </h1>
        {prefs.nearestBuilding && (
          <p className="text-sm text-gray-400 mt-0.5">Near {prefs.nearestBuilding}</p>
        )}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {activeFilters.map((f) => (
              <span key={f} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 text-sm">
          Failed to load apartments: {error.message}
        </div>
      )}

      {scored.length > 0 ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: ranked list */}
          <div className="w-full lg:w-[500px] flex-shrink-0 overflow-y-auto p-4 space-y-3">
            {scored.map((apt) => (
              <ApartmentCard
                key={apt.id}
                apt={apt}
                score={apt.score}
                reasons={apt.reasons}
                misses={apt.misses}
                partials={apt.partials}
              />
            ))}
          </div>

          {/* Right: map */}
          <div className="hidden lg:block flex-1 p-4">
            <MapView
              apartments={scored.map((a) => ({
                id: a.id,
                name: a.name,
                address: a.address,
                lat: a.lat,
                lng: a.lng,
                rating_overall: a.rating_overall,
                rent_min: a.rent_min,
                rent_max: a.rent_max,
              }))}
              landmark={
                prefs.nearestBuilding && BUILDINGS[prefs.nearestBuilding]
                  ? {
                      name: prefs.nearestBuilding,
                      lat: BUILDINGS[prefs.nearestBuilding][0],
                      lng: BUILDINGS[prefs.nearestBuilding][1],
                    }
                  : null
              }
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">🏠</div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No apartments found</h2>
          <Link
            href="/quiz"
            className="inline-block bg-[#E84A27] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#c93d1e] transition-colors"
          >
            ← Adjust search
          </Link>
        </div>
      )}
    </main>
  )
}
