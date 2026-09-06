// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, apartment_id } = await req.json()
  if (!messages?.length) return NextResponse.json({ error: 'No messages' }, { status: 400 })

  const supabase = await createClient()

  // If chat is on a specific apartment page, fetch that apartment's context
  let apartmentContext = ''
  if (apartment_id) {
    const { data: apt } = await supabase
      .from('apartments')
      .select('*, landlords(*)')
      .eq('id', apartment_id)
      .single()

    if (apt) {
      const amenities = [
        apt.pets_allowed && 'pets allowed',
        apt.parking_available && 'parking available',
        apt.utilities_included && 'utilities included',
        apt.laundry_in_unit && 'in-unit laundry',
        apt.laundry_in_building && 'laundry on-site',
        apt.dishwasher && 'dishwasher',
        apt.furnished && 'furnished',
        apt.ac && 'A/C',
      ].filter(Boolean).join(', ')

      apartmentContext = `
The user is viewing this specific apartment:
- Name: ${apt.name}
- Address: ${apt.address}
- Rent: $${apt.rent_min}–$${apt.rent_max}/mo
- Bedrooms: ${apt.bedrooms?.join(', ')}
- Rating: ${apt.rating_overall}/5 (${apt.review_count} reviews)
- Amenities: ${amenities || 'none listed'}
- Landlord: ${apt.landlords?.name ?? 'unknown'}
${apt.ai_summary ? `- AI summary: ${apt.ai_summary.summary}` : ''}
`
    }
  }

  // For general apartment search queries, fetch a snapshot of available apartments
  const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() ?? ''
  const isSearchQuery = ['find', 'show', 'recommend', 'best', 'cheap', 'under', 'budget', 'near', 'close', 'bedroom', 'br', 'studio', 'pet', 'parking', 'laundry', 'furnished'].some(k => lastMessage.includes(k))

  let dbContext = ''
  if (isSearchQuery && !apartment_id) {
    const { data: apts } = await supabase
      .from('apartments')
      .select('id, name, address, rent_min, rent_max, bedrooms, rating_overall, review_count, pets_allowed, parking_available, laundry_in_unit, furnished, ac, utilities_included')
      .not('rent_min', 'is', null)
      .order('rating_overall', { ascending: false })
      .limit(50)

    if (apts?.length) {
      dbContext = `\nHere are some available apartments (top 50 by rating):\n` +
        apts.map(a =>
          `- ${a.name} | ${a.address} | $${a.rent_min}–$${a.rent_max}/mo | ${a.bedrooms?.map((b: number) => b === 0 ? 'Studio' : `${b}BR`).join('/')} | ⭐ ${a.rating_overall > 0 ? a.rating_overall.toFixed(1) : 'unrated'} | ${[a.pets_allowed && 'pets', a.parking_available && 'parking', a.laundry_in_unit && 'in-unit laundry', a.furnished && 'furnished', a.ac && 'A/C', a.utilities_included && 'utilities incl.'].filter(Boolean).join(', ') || 'no special amenities'}`
        ).join('\n')
    }
  }

  const systemPrompt = `You are a helpful apartment advisor for UIUC (University of Illinois Urbana-Champaign) students. You help students find the right apartment in Champaign-Urbana.

You know about apartments in the area, can answer questions about leasing, and give honest advice. Be concise, friendly, and practical. Use student-friendly language.
${apartmentContext}${dbContext}

When recommending apartments, always mention the name, address, rent range, and a key reason why it fits. Link to apartments using this format: [Apartment Name](/apartments/ID) — but only if you have the ID.

If asked something you don't know, say so honestly. Don't make up prices or availability.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ reply })
}
