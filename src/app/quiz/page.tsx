'use client'
// src/app/quiz/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CAMPUS_BUILDINGS = [
  'Siebel Center (CS)',
  'Grainger Engineering',
  'Main Quad',
  'Business Instructional Facility',
  'Natural History Building',
  'Illini Union',
  'Main Library',
  'SIEBL Center',
  'Beckman Institute',
  'Vet Med',
]

const BEDROOM_OPTIONS = [
  { label: 'Studio', value: 0 },
  { label: '1 BR', value: 1 },
  { label: '2 BR', value: 2 },
  { label: '3 BR', value: 3 },
  { label: '4+ BR', value: 4 },
]

type QuizState = {
  budgetMin: number
  budgetMax: number
  bedrooms: number[]
  nearestBuilding: string
  pets: boolean
  parking: boolean
  utilitiesIncluded: boolean
  laundryInUnit: boolean
}

const DEFAULT: QuizState = {
  budgetMin: 600,
  budgetMax: 1400,
  bedrooms: [],
  nearestBuilding: '',
  pets: false,
  parking: false,
  utilitiesIncluded: false,
  laundryInUnit: false,
}

const TOTAL_STEPS = 4

export default function QuizPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [quiz, setQuiz] = useState<QuizState>(DEFAULT)

  function toggleBedroom(val: number) {
    setQuiz((q) => ({
      ...q,
      bedrooms: q.bedrooms.includes(val)
        ? q.bedrooms.filter((b) => b !== val)
        : [...q.bedrooms, val],
    }))
  }

  function handleSubmit() {
    const params = new URLSearchParams({
      budgetMin: quiz.budgetMin.toString(),
      budgetMax: quiz.budgetMax.toString(),
      bedrooms: quiz.bedrooms.join(','),
      nearestBuilding: quiz.nearestBuilding,
      pets: quiz.pets.toString(),
      parking: quiz.parking.toString(),
      utilitiesIncluded: quiz.utilitiesIncluded.toString(),
      laundryInUnit: quiz.laundryInUnit.toString(),
    })
    router.push(`/results?${params.toString()}`)
  }

  const canNext =
    (step === 1) ||
    (step === 2 && quiz.bedrooms.length > 0) ||
    (step === 3 && quiz.nearestBuilding !== '') ||
    (step === 4)

  return (
    <main className="min-h-screen bg-[#F2F0EB] flex flex-col items-center justify-center px-4 py-12">
      {/* Header */}
      <div className="w-full max-w-lg mb-8">
        <a href="/" className="text-sm text-[#A8A29E] hover:text-[#78716C] transition-colors">← Back</a>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-lg mb-8">
        <div className="flex justify-between text-xs text-[#A8A29E] mb-2">
          <span>Step {step} of {TOTAL_STEPS}</span>
          <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
        </div>
        <div className="h-2 bg-[#E2DED8] rounded-full">
          <div
            className="h-2 bg-[#E84A27] rounded-full transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-[#FAFAF8] rounded-2xl shadow-md border border-[#E2DED8] p-8">

        {/* Step 1 — Budget */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold text-[#13294B] mb-1">What&apos;s your budget?</h2>
            <p className="text-sm text-[#A8A29E] mb-8">Per month, per person</p>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#78716C]">Minimum</span>
                  <span className="font-semibold text-[#13294B]">${quiz.budgetMin}/mo</span>
                </div>
                <input
                  type="range"
                  min={400} max={2000} step={50}
                  value={quiz.budgetMin}
                  onChange={(e) => setQuiz((q) => ({ ...q, budgetMin: Number(e.target.value) }))}
                  className="w-full accent-[#E84A27]"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-[#78716C]">Maximum</span>
                  <span className="font-semibold text-[#13294B]">${quiz.budgetMax}/mo</span>
                </div>
                <input
                  type="range"
                  min={400} max={2000} step={50}
                  value={quiz.budgetMax}
                  onChange={(e) => setQuiz((q) => ({ ...q, budgetMax: Number(e.target.value) }))}
                  className="w-full accent-[#E84A27]"
                />
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-sm text-[#E84A27] font-medium text-center">
                ${quiz.budgetMin} – ${quiz.budgetMax} / month
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Bedrooms */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-bold text-[#13294B] mb-1">How many bedrooms?</h2>
            <p className="text-sm text-[#A8A29E] mb-8">Select all you&apos;d consider</p>
            <div className="grid grid-cols-3 gap-3">
              {BEDROOM_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleBedroom(opt.value)}
                  className={`py-4 rounded-xl border-2 font-semibold text-sm transition-all ${
                    quiz.bedrooms.includes(opt.value)
                      ? 'border-[#E84A27] bg-[#E84A27] text-white'
                      : 'border-[#E2DED8] text-[#78716C] hover:border-[#A8A29E]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Location */}
        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold text-[#13294B] mb-1">Where are your classes?</h2>
            <p className="text-sm text-[#A8A29E] mb-8">We&apos;ll show walking distance from this building</p>
            <div className="grid grid-cols-1 gap-2">
              {CAMPUS_BUILDINGS.map((b) => (
                <button
                  key={b}
                  onClick={() => setQuiz((q) => ({ ...q, nearestBuilding: b }))}
                  className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all ${
                    quiz.nearestBuilding === b
                      ? 'border-[#E84A27] bg-[#E84A27] text-white'
                      : 'border-[#E2DED8] text-[#78716C] hover:border-[#A8A29E]'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4 — Amenities */}
        {step === 4 && (
          <div>
            <h2 className="text-xl font-bold text-[#13294B] mb-1">Any must-haves?</h2>
            <p className="text-sm text-[#A8A29E] mb-8">Toggle anything that matters to you</p>
            <div className="space-y-3">
              {[
                { key: 'pets', label: '🐾 Pets allowed' },
                { key: 'parking', label: '🚗 Parking available' },
                { key: 'utilitiesIncluded', label: '💡 Utilities included' },
                { key: 'laundryInUnit', label: '🧺 In-unit laundry' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQuiz((q) => ({ ...q, [key]: !q[key as keyof QuizState] }))}
                  className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border-2 transition-all ${
                    quiz[key as keyof QuizState]
                      ? 'border-[#E84A27] bg-[#E84A27]'
                      : 'border-[#E2DED8] hover:border-[#A8A29E]'
                  }`}
                >
                  <span className={`text-sm font-medium ${quiz[key as keyof QuizState] ? 'text-white' : 'text-[#78716C]'}`}>
                    {label}
                  </span>
                  <span className={`text-xs font-bold ${quiz[key as keyof QuizState] ? 'text-white/80' : 'text-[#A8A29E]'}`}>
                    {quiz[key as keyof QuizState] ? 'ON' : 'OFF'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-10">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-[#A8A29E] hover:text-[#78716C] font-medium transition-colors"
            >
              ← Back
            </button>
          ) : <div />}

          {step < TOTAL_STEPS ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="bg-[#13294B] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#0f1f38] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="bg-[#E84A27] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#c93d1e] transition-colors"
            >
              Show my apartments →
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
