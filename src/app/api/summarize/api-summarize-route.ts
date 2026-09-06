// src/app/api/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { apartment_id } = await req.json()
  if (!apartment_id) return NextResponse.json({ error: 'Missing apartment_id' }, { status: 400 })

  const supabase = await createClient()

  // Fetch apartment + reviews
  const { data: apt } = await supabase
    .from('apartments')
    .select('name, address, rating_overall, review_count')
    .eq('id', apartment_id)
    .single()

  if (!apt) return NextResponse.json({ error: 'Apartment not found' }, { status: 404 })

  const { data: reviews } = await supabase
    .from('reviews')
    .select('body, rating_maintenance, rating_responsiveness, rating_noise, rating_cleanliness, rating_value, rating_pests, verified_tenant')
    .eq('apartment_id', apartment_id)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(30)

  if (!reviews?.length) {
    return NextResponse.json({ error: 'No reviews to summarize' }, { status: 400 })
  }

  const reviewText = reviews
    .map((r, i) => {
      const ratings = [r.rating_maintenance, r.rating_responsiveness, r.rating_noise, r.rating_cleanliness, r.rating_value, r.rating_pests]
        .filter(Boolean)
      const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 'N/A'
      return `Review ${i + 1} (avg ${avg}/5${r.verified_tenant ? ', verified' : ''}):\n${r.body}`
    })
    .join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are summarizing tenant reviews for "${apt.name}" at ${apt.address}, a student apartment near UIUC. Overall rating: ${apt.rating_overall}/5 from ${apt.review_count} reviews.

Here are the reviews:
${reviewText}

Respond with ONLY valid JSON (no markdown, no code block) in this exact format:
{
  "summary": "2-3 sentence overall summary of what it's like to live here",
  "pros": ["pro 1", "pro 2", "pro 3"],
  "cons": ["con 1", "con 2", "con 3"]
}

Be specific and honest. Use tenant language. Don't be generic.`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response', raw }, { status: 500 })
  }

  // Store in DB
  await supabase
    .from('apartments')
    .update({ ai_summary: parsed })
    .eq('id', apartment_id)

  return NextResponse.json({ success: true, summary: parsed })
}
