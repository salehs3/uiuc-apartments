// src/app/admin/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminReviewCard from './AdminReviewCard'

export default async function AdminPage() {
  const supabase = await createClient()

  // Auth check — only admin email can access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    redirect('/')
  }

  // Fetch all reviews that have a lease doc attached but aren't verified yet
  const { data: pending } = await supabase
    .from('reviews')
    .select(`
      id, body, created_at, verified_tenant,
      lease_doc_url, lived_from, lived_until,
      rating_maintenance, rating_responsiveness,
      rating_noise, rating_cleanliness,
      rating_value, rating_pests,
      apartments ( id, name, address ),
      profiles ( display_name, id )
    `)
    .not('lease_doc_url', 'is', null)
    .eq('verified_tenant', false)
    .order('created_at', { ascending: false })

  // Fetch already verified reviews
  const { data: verified } = await supabase
    .from('reviews')
    .select(`
      id, created_at, verified_tenant, lease_doc_url,
      apartments ( name ),
      profiles ( display_name )
    `)
    .eq('verified_tenant', true)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-[#13294B]">
          UIUC <span className="text-[#E84A27]">Apartments</span>
          <span className="ml-3 text-xs bg-[#13294B] text-white px-2 py-0.5 rounded-full">Admin</span>
        </span>
        <a href="/" className="text-sm text-gray-500 hover:text-gray-800">← Back to site</a>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Pending verifications */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-xl font-bold text-[#13294B]">Pending verifications</h1>
            {pending && pending.length > 0 && (
              <span className="bg-[#E84A27] text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {pending.length}
              </span>
            )}
          </div>

          {!pending?.length ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-8 text-center text-gray-400 text-sm">
              No pending verifications 🎉
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((review) => (
                <AdminReviewCard key={review.id} review={review} />
              ))}
            </div>
          )}
        </div>

        {/* Recently verified */}
        <div>
          <h2 className="text-base font-bold text-[#13294B] mb-4">Recently verified</h2>
          {!verified?.length ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 text-center text-gray-400 text-sm">
              None yet
            </div>
          ) : (
            <div className="space-y-2">
              {verified.map((r) => (
                <div key={r.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">
                      {(r.profiles as any)?.display_name ?? 'Anonymous'}
                    </span>
                    <span className="text-xs text-gray-400 ml-2">
                      @ {(r.apartments as any)?.name}
                    </span>
                  </div>
                  <span className="text-xs text-green-600 font-semibold">✓ Verified</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
