// src/lib/scoring.test.ts
import { scoreApartment, type Apartment, type Preferences } from './scoring'

// ─────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────

const BASE_APT: Apartment = {
  id: 'test-1',
  rent_min: 800,
  rent_max: 1100,
  bedrooms: [1, 2],
  lat: 40.1085,   // ~8 min walk from Siebel
  lng: -88.2285,
  rating_overall: 4.2,
  review_count: 20,
  pets_allowed: true,
  parking_available: true,
  utilities_included: false,
  laundry_in_unit: true,
}

const BASE_PREFS: Preferences = {
  budgetMin: 700,
  budgetMax: 1200,
  bedrooms: [1],
  nearestBuilding: 'Siebel Center (CS)',
  pets: false,
  parking: false,
  utilitiesIncluded: false,
  laundryInUnit: false,
}

// ─────────────────────────────────────────
// Score is bounded 0–100
// ─────────────────────────────────────────

test('score is always between 0 and 100', () => {
  const result = scoreApartment(BASE_APT, BASE_PREFS)
  expect(result.score).toBeGreaterThanOrEqual(0)
  expect(result.score).toBeLessThanOrEqual(100)
})

// ─────────────────────────────────────────
// Budget scoring
// ─────────────────────────────────────────

test('perfect budget fit scores full 25 budget points', () => {
  const prefs = { ...BASE_PREFS, budgetMin: 700, budgetMax: 1200 }
  const apt = { ...BASE_APT, rent_min: 800, rent_max: 1100 }
  const { score, reasons } = scoreApartment(apt, prefs)
  expect(reasons.some(r => r.includes('Within your budget'))).toBe(true)
  // Budget contributes 25, rating ~21, distance partial, bedrooms 15
  expect(score).toBeGreaterThan(50)
})

test('apartment outside budget scores 0 budget points and adds a miss', () => {
  const prefs = { ...BASE_PREFS, budgetMin: 500, budgetMax: 700 }
  const apt = { ...BASE_APT, rent_min: 1000, rent_max: 1400 }
  const { misses } = scoreApartment(apt, prefs)
  expect(misses.some(m => m.includes('budget'))).toBe(true)
})

test('partial budget overlap gives partial points', () => {
  const prefs = { ...BASE_PREFS, budgetMin: 700, budgetMax: 900 }
  const apt = { ...BASE_APT, rent_min: 800, rent_max: 1200 }
  const { partials } = scoreApartment(apt, prefs)
  expect(partials.some(p => p.includes('Partially within budget'))).toBe(true)
})

// ─────────────────────────────────────────
// Rating scoring
// ─────────────────────────────────────────

test('high-rated apartment adds rating to reasons', () => {
  const apt = { ...BASE_APT, rating_overall: 4.5, review_count: 30 }
  const { reasons } = scoreApartment(apt, BASE_PREFS)
  expect(reasons.some(r => r.includes('4.5'))).toBe(true)
})

test('low-rated apartment adds rating to misses', () => {
  const apt = { ...BASE_APT, rating_overall: 2.1, review_count: 10 }
  const { misses } = scoreApartment(apt, BASE_PREFS)
  expect(misses.some(m => m.includes('Low rating'))).toBe(true)
})

test('apartment with no reviews gets neutral score and partial note', () => {
  const apt = { ...BASE_APT, rating_overall: 0, review_count: 0 }
  const { partials, score } = scoreApartment(apt, BASE_PREFS)
  expect(partials.some(p => p.includes('No reviews yet'))).toBe(true)
  expect(score).toBeGreaterThan(0) // neutral, not penalized
})

// ─────────────────────────────────────────
// Walking distance scoring
// ─────────────────────────────────────────

test('apartment very close to campus building scores high on distance', () => {
  // Coordinates ~2 min walk from Siebel
  const apt = { ...BASE_APT, lat: 40.1140, lng: -88.2250 }
  const { reasons, walkMinutes } = scoreApartment(apt, BASE_PREFS)
  expect(walkMinutes).toBeLessThanOrEqual(5)
  expect(reasons.some(r => r.includes('min walk'))).toBe(true)
})

test('apartment far from campus adds miss for distance', () => {
  // Coordinates far from campus (~20 min walk)
  const apt = { ...BASE_APT, lat: 40.0800, lng: -88.2500 }
  const { misses, walkMinutes } = scoreApartment(apt, BASE_PREFS)
  expect(walkMinutes).toBeGreaterThan(15)
  expect(misses.some(m => m.includes('min walk'))).toBe(true)
})

test('no building preference gives neutral distance score', () => {
  const prefs = { ...BASE_PREFS, nearestBuilding: '' }
  const { score } = scoreApartment(BASE_APT, prefs)
  // Should still score decently without distance preference
  expect(score).toBeGreaterThan(20)
})

test('walkMinutes is null when no building selected', () => {
  const prefs = { ...BASE_PREFS, nearestBuilding: '' }
  const { walkMinutes } = scoreApartment(BASE_APT, prefs)
  expect(walkMinutes).toBeNull()
})

// ─────────────────────────────────────────
// Bedroom matching
// ─────────────────────────────────────────

test('matching bedroom type scores full 15 bedroom points', () => {
  const apt = { ...BASE_APT, bedrooms: [1, 2] }
  const prefs = { ...BASE_PREFS, bedrooms: [1] }
  const { reasons } = scoreApartment(apt, prefs)
  expect(reasons.some(r => r.includes('1BR') || r.includes('Offers'))).toBe(true)
})

test('no bedroom match adds miss', () => {
  const apt = { ...BASE_APT, bedrooms: [3, 4] }
  const prefs = { ...BASE_PREFS, bedrooms: [1] }
  const { misses } = scoreApartment(apt, prefs)
  expect(misses.some(m => m.includes('Bedroom'))).toBe(true)
})

test('no bedroom preference gives full 15 points', () => {
  const prefs = { ...BASE_PREFS, bedrooms: [] }
  const prefs2 = { ...BASE_PREFS, bedrooms: [1] }
  const s1 = scoreApartment(BASE_APT, prefs).score
  const s2 = scoreApartment(BASE_APT, prefs2).score
  // No preference should score >= preference with a match
  expect(s1).toBeGreaterThanOrEqual(s2 - 1) // allow rounding
})

// ─────────────────────────────────────────
// Amenity matching
// ─────────────────────────────────────────

test('requested amenity that is available adds to reasons', () => {
  const prefs = { ...BASE_PREFS, pets: true }
  const apt = { ...BASE_APT, pets_allowed: true }
  const { reasons } = scoreApartment(apt, prefs)
  expect(reasons.some(r => r.includes('Pets allowed'))).toBe(true)
})

test('requested amenity that is NOT available adds to misses', () => {
  const prefs = { ...BASE_PREFS, pets: true }
  const apt = { ...BASE_APT, pets_allowed: false }
  const { misses } = scoreApartment(apt, prefs)
  expect(misses.some(m => m.includes('Pets'))).toBe(true)
})

test('unrequested amenity does not affect score', () => {
  const prefs = { ...BASE_PREFS, pets: false }
  const aptWith = { ...BASE_APT, pets_allowed: true }
  const aptWithout = { ...BASE_APT, pets_allowed: false }
  const s1 = scoreApartment(aptWith, prefs).score
  const s2 = scoreApartment(aptWithout, prefs).score
  expect(s1).toBe(s2) // pets not requested — should make no difference
})

test('all amenities matched when all requested', () => {
  const prefs = {
    ...BASE_PREFS,
    pets: true,
    parking: true,
    utilitiesIncluded: true,
    laundryInUnit: true,
  }
  const apt = {
    ...BASE_APT,
    pets_allowed: true,
    parking_available: true,
    utilities_included: true,
    laundry_in_unit: true,
  }
  const { reasons } = scoreApartment(apt, prefs)
  expect(reasons.some(r => r.includes('Pets'))).toBe(true)
  expect(reasons.some(r => r.includes('Parking'))).toBe(true)
  expect(reasons.some(r => r.includes('Utilities'))).toBe(true)
  expect(reasons.some(r => r.includes('laundry'))).toBe(true)
})

// ─────────────────────────────────────────
// Perfect match
// ─────────────────────────────────────────

test('near-perfect apartment scores 90+', () => {
  const apt: Apartment = {
    id: 'perfect',
    rent_min: 800,
    rent_max: 1000,
    bedrooms: [1],
    lat: 40.1140,  // very close to Siebel
    lng: -88.2250,
    rating_overall: 5.0,
    review_count: 50,
    pets_allowed: true,
    parking_available: true,
    utilities_included: true,
    laundry_in_unit: true,
  }
  const prefs: Preferences = {
    budgetMin: 700,
    budgetMax: 1200,
    bedrooms: [1],
    nearestBuilding: 'Siebel Center (CS)',
    pets: true,
    parking: true,
    utilitiesIncluded: true,
    laundryInUnit: true,
  }
  const { score } = scoreApartment(apt, prefs)
  expect(score).toBeGreaterThanOrEqual(90)
})

test('terrible apartment with all misses scores below 30', () => {
  const apt: Apartment = {
    id: 'bad',
    rent_min: 1800,
    rent_max: 2500,
    bedrooms: [4],
    lat: 40.0700,  // far from campus
    lng: -88.3000,
    rating_overall: 1.5,
    review_count: 40,
    pets_allowed: false,
    parking_available: false,
    utilities_included: false,
    laundry_in_unit: false,
  }
  const prefs: Preferences = {
    budgetMin: 600,
    budgetMax: 900,
    bedrooms: [1],
    nearestBuilding: 'Siebel Center (CS)',
    pets: true,
    parking: true,
    utilitiesIncluded: true,
    laundryInUnit: true,
  }
  const { score } = scoreApartment(apt, prefs)
  expect(score).toBeLessThan(30)
})
