// src/lib/scoring.ts
// Match scoring algorithm — scores each apartment against a student's preferences
// Returns a score out of 100, plus human-readable reasons

import { BUILDINGS } from './buildings'

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type Preferences = {
  budgetMin: number
  budgetMax: number
  bedrooms: number[]           // empty = no preference
  nearestBuilding: string      // empty = no preference
  pets: boolean
  parking: boolean
  utilitiesIncluded: boolean
  laundryInUnit: boolean
}

export type Apartment = {
  id: string
  rent_min: number | null
  rent_max: number | null
  bedrooms: number[] | null
  lat: number | null
  lng: number | null
  rating_overall: number
  review_count: number
  pets_allowed: boolean
  parking_available: boolean
  utilities_included: boolean
  laundry_in_unit: boolean
}

export type ScoreResult = {
  score: number                // 0–100
  reasons: string[]            // matched preferences (shown as green dots)
  misses: string[]             // missed preferences (shown as red dots)
  partials: string[]           // partial matches (shown as yellow dots)
  walkMinutes: number | null   // walking time to selected building
}

// ─────────────────────────────────────────
// Haversine distance formula
// Returns distance in kilometers between two lat/lng points
// ─────────────────────────────────────────

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Average walking speed: 5 km/h → 1 km = 12 minutes
function kmToWalkMinutes(km: number): number {
  return Math.round(km * 12)
}

// ─────────────────────────────────────────
// Main scoring function
// Max points per category:
//   Budget fit:       25 pts
//   Tenant rating:    25 pts
//   Walking distance: 20 pts
//   Bedroom match:    15 pts
//   Amenity match:    15 pts
//   Total:           100 pts
// ─────────────────────────────────────────

export function scoreApartment(
  apt: Apartment,
  prefs: Preferences
): ScoreResult {
  let score = 0
  const reasons: string[] = []
  const misses: string[] = []
  const partials: string[] = []
  let walkMinutes: number | null = null

  // ── 1. Budget fit (25 pts) ──────────────
  const rentMin = apt.rent_min ?? 0
  const rentMax = apt.rent_max ?? 9999

  if (rentMin >= prefs.budgetMin && rentMax <= prefs.budgetMax) {
    // Fully within budget
    score += 25
    reasons.push(`Within your budget ($${rentMin}–$${rentMax}/mo)`)
  } else if (rentMin <= prefs.budgetMax && rentMax >= prefs.budgetMin) {
    // Partial overlap
    const overlap =
      Math.min(rentMax, prefs.budgetMax) - Math.max(rentMin, prefs.budgetMin)
    const range = prefs.budgetMax - prefs.budgetMin || 1
    const ratio = Math.max(0, Math.min(1, overlap / range))
    score += Math.round(ratio * 25)
    partials.push(`Partially within budget ($${rentMin}–$${rentMax}/mo)`)
  } else {
    misses.push(`Outside your budget ($${rentMin}–$${rentMax}/mo)`)
  }

  // ── 2. Tenant rating (25 pts) ────────────
  if (apt.review_count === 0) {
    // No reviews yet — give neutral score
    score += 12
    partials.push('No reviews yet')
  } else {
    const ratingPts = Math.round((apt.rating_overall / 5) * 25)
    score += ratingPts
    if (apt.rating_overall >= 4) {
      reasons.push(`Rated ${apt.rating_overall.toFixed(1)}/5 by ${apt.review_count} tenants`)
    } else if (apt.rating_overall >= 3) {
      partials.push(`Rated ${apt.rating_overall.toFixed(1)}/5 by ${apt.review_count} tenants`)
    } else {
      misses.push(`Low rating: ${apt.rating_overall.toFixed(1)}/5`)
    }
  }

  // ── 3. Walking distance (20 pts) ─────────
  const buildingCoords = prefs.nearestBuilding
    ? BUILDINGS[prefs.nearestBuilding]
    : null

  if (buildingCoords && apt.lat && apt.lng) {
    const km = haversineKm(apt.lat, apt.lng, buildingCoords[0], buildingCoords[1])
    walkMinutes = kmToWalkMinutes(km)

    if (walkMinutes <= 5) {
      score += 20
      reasons.push(`${walkMinutes} min walk to ${prefs.nearestBuilding}`)
    } else if (walkMinutes <= 10) {
      score += 14
      partials.push(`${walkMinutes} min walk to ${prefs.nearestBuilding}`)
    } else if (walkMinutes <= 15) {
      score += 8
      partials.push(`${walkMinutes} min walk to ${prefs.nearestBuilding}`)
    } else {
      score += 0
      misses.push(`${walkMinutes} min walk to ${prefs.nearestBuilding}`)
    }
  } else {
    // No building preference — neutral
    score += 10
  }

  // ── 4. Bedroom match (15 pts) ────────────
  if (prefs.bedrooms.length === 0) {
    // No preference — full points
    score += 15
  } else if (apt.bedrooms?.some((b) => prefs.bedrooms.includes(b))) {
    score += 15
    const matched = apt.bedrooms
      .filter((b) => prefs.bedrooms.includes(b))
      .map((b) => (b === 0 ? 'Studio' : `${b}BR`))
      .join(', ')
    reasons.push(`Offers ${matched}`)
  } else {
    misses.push('Bedroom type not available')
  }

  // ── 5. Amenities (15 pts total) ──────────
  const amenities = [
    {
      requested: prefs.pets,
      available: apt.pets_allowed,
      pts: 5,
      label: 'Pets allowed',
    },
    {
      requested: prefs.parking,
      available: apt.parking_available,
      pts: 4,
      label: 'Parking available',
    },
    {
      requested: prefs.utilitiesIncluded,
      available: apt.utilities_included,
      pts: 4,
      label: 'Utilities included',
    },
    {
      requested: prefs.laundryInUnit,
      available: apt.laundry_in_unit,
      pts: 2,
      label: 'In-unit laundry',
    },
  ]

  for (const amenity of amenities) {
    if (!amenity.requested) continue // student didn't ask for it — skip
    if (amenity.available) {
      score += amenity.pts
      reasons.push(`${amenity.label} ✓`)
    } else {
      misses.push(`${amenity.label} not available`)
    }
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    reasons,
    misses,
    partials,
    walkMinutes,
  }
}
