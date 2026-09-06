// src/app/page.tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ChatWidget from '@/components/ChatWidget'

const stats = [
  { value: '430+', label: 'Apartments listed' },
  { value: '7', label: 'Top landlords rated' },
  { value: '6', label: 'Rating categories' },
]

const features = [
  {
    icon: '🎯',
    title: 'Personalized matches',
    desc: 'Tell us your budget, location, and must-haves — we rank apartments that actually fit.',
  },
  {
    icon: '⭐',
    title: 'Honest reviews',
    desc: 'Ratings from verified UIUC tenants across maintenance, noise, value, pests, and more.',
  },
  {
    icon: '🤖',
    title: 'AI summaries',
    desc: 'Every building gets an AI-generated pro/con breakdown and red flag alerts from real reviews.',
  },
  {
    icon: '🗺️',
    title: 'Campus map',
    desc: 'See walking distance to your classes, not just a street address.',
  },
]

function SatelliteThumb({ lat, lng, address, apiKey }: { lat: number | null; lng: number | null; address: string; apiKey: string }) {
  const src = lat && lng
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=400x240&maptype=satellite&key=${apiKey}`
    : `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(address)}&zoom=18&size=400x240&maptype=satellite&key=${apiKey}`
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={address} className="w-full h-full object-cover" />
  )
}

export default async function HomePage() {
  const supabase = await createClient()
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY ?? ''

  // Fetch a few featured apartments (those with rent data, ordered by review count)
  const { data: featured } = await supabase
    .from('apartments')
    .select('id, name, address, lat, lng, rent_min, rent_max, bedrooms, review_count, rating_overall, landlord_id')
    .not('rent_min', 'is', null)
    .order('review_count', { ascending: false })
    .limit(6)

  return (
    <main className="min-h-screen bg-[#F2F0EB]">
      {/* Nav */}
      <nav className="bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-[#E2DED8] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <span className="font-bold text-xl text-[#13294B]">
          UIUC <span className="text-[#E84A27]">Apartments</span>
        </span>
        <div className="flex items-center gap-4">
          <Link href="/apartments" className="text-sm text-[#78716C] hover:text-[#1C1917] transition-colors">
            Browse all
          </Link>
          <Link
            href="/quiz"
            className="text-sm bg-[#E84A27] text-white px-4 py-2 rounded-lg hover:bg-[#c93d1e] transition-colors"
          >
            Find my apartment
          </Link>
        </div>
      </nav>

      {/* Hero — dark navy with Unsplash background */}
      <section className="relative bg-[#13294B] px-6 pt-20 pb-16 overflow-hidden">
        {/* Background image with dark overlay */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=70&auto=format&fit=crop"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#13294B]/60 via-[#13294B]/80 to-[#13294B]" />

        {/* Content */}
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="inline-block bg-white/10 text-white/75 text-sm font-semibold px-3 py-1 rounded-full mb-6">
            Made for UIUC students
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-white leading-[1.08] mb-5">
            Find your apartment.<br />Without the horror stories.
          </h1>
          <p className="text-lg text-white/65 mb-8 max-w-xl mx-auto leading-relaxed">
            Real reviews from verified tenants. AI-powered summaries. Ranked by what matters to you — not whoever paid for the top spot.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/quiz"
              className="bg-[#E84A27] text-white px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-[#c93d1e] transition-colors shadow-sm"
            >
              Find my apartment →
            </Link>
            <Link
              href="/apartments"
              className="text-white/80 border border-white/30 px-8 py-3.5 rounded-xl font-semibold text-base hover:border-white/60 transition-colors"
            >
              Browse all
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-[#FAFAF8] border-b border-[#E2DED8] py-14">
        <div className="max-w-2xl mx-auto px-6 flex items-center justify-around flex-wrap gap-10">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-4xl font-bold text-[#13294B]">{s.value}</div>
              <div className="text-sm text-[#78716C] mt-1.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Featured apartments */}
      {featured && featured.length > 0 && googleApiKey && (
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-[#13294B]">Featured apartments</h2>
            <Link href="/apartments" className="text-sm text-[#E84A27] hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((apt) => {
              const rentLabel = apt.rent_min && apt.rent_max
                ? `$${apt.rent_min.toLocaleString()} – $${apt.rent_max.toLocaleString()}/mo`
                : apt.rent_min
                ? `From $${apt.rent_min.toLocaleString()}/mo`
                : null
              const bedroomLabel = apt.bedrooms?.length
                ? apt.bedrooms.map((b: number) => (b === 0 ? 'Studio' : `${b}BR`)).join(', ')
                : null
              return (
                <Link
                  key={apt.id}
                  href={`/apartments/${apt.id}`}
                  className="group bg-[#FAFAF8] border border-[#E2DED8] rounded-2xl overflow-hidden hover:shadow-md hover:border-[#C8C4BE] transition-all"
                >
                  {/* Satellite thumbnail */}
                  <div className="h-40 bg-[#D6D3CD] overflow-hidden relative">
                    <SatelliteThumb
                      lat={apt.lat}
                      lng={apt.lng}
                      address={apt.address}
                      apiKey={googleApiKey}
                    />
                    {apt.rating_overall > 0 && (
                      <div className="absolute top-2 right-2 bg-[#13294B]/80 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded-lg">
                        ★ {Number(apt.rating_overall).toFixed(1)}
                      </div>
                    )}
                  </div>
                  {/* Card content */}
                  <div className="p-4">
                    <div className="font-semibold text-[#13294B] text-sm truncate group-hover:text-[#E84A27] transition-colors">
                      {apt.name}
                    </div>
                    <div className="text-xs text-[#A8A29E] mt-0.5 truncate">{apt.address}</div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm font-bold text-[#13294B]">{rentLabel ?? 'Rent on request'}</div>
                      {bedroomLabel && (
                        <div className="text-xs text-[#78716C] bg-[#EDECEA] px-2 py-0.5 rounded-full">{bedroomLabel}</div>
                      )}
                    </div>
                    {apt.review_count > 0 && (
                      <div className="text-xs text-[#A8A29E] mt-1">{apt.review_count} review{apt.review_count !== 1 ? 's' : ''}</div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-[#13294B] text-center mb-10">
          Everything you need to sign with confidence
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-[#FAFAF8] border border-[#E2DED8] border-l-4 border-l-transparent rounded-xl p-6 hover:border-l-[#13294B] transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <div className="font-semibold text-[#13294B] mb-1">{f.title}</div>
              <div className="text-sm text-[#78716C] leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className="bg-[#13294B] mx-6 mb-16 rounded-2xl px-8 py-12 text-center max-w-4xl xl:mx-auto">
        <h2 className="text-2xl font-bold text-white mb-3">
          Lease season is coming.
        </h2>
        <p className="text-blue-200 mb-6 text-sm">
          Most Champaign leases start August 1. Don&apos;t rush into a bad one.
        </p>
        <Link
          href="/quiz"
          className="inline-block bg-[#E84A27] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#c93d1e] transition-colors"
        >
          Find my apartment →
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E2DED8] px-6 py-6 text-center text-xs text-[#A8A29E]">
        Built for UIUC students · Not affiliated with the University of Illinois
      </footer>
      <ChatWidget />
    </main>
  )
}
