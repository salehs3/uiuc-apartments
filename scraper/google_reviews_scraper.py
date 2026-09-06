#!/usr/bin/env python3
"""
Google Places scraper for UIUC Apartment Review Platform.

Two passes:
  1. Per-landlord: updates landlords.aggregate_rating + landlords.review_count
  2. Per-building: updates apartments.google_review_count (+ google_rating if column exists)

Usage:
  python google_reviews_scraper.py             # live run (both passes)
  python google_reviews_scraper.py --dry-run   # print only, no writes
  python google_reviews_scraper.py --landlords # landlord pass only
  python google_reviews_scraper.py --buildings # building pass only
"""

import os, sys, time, requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

# Try common env var names for the API key
API_KEY = (
    os.getenv('GOOGLE_PLACES_API_KEY') or
    os.getenv('GOOGLE_PLACES_KEY') or
    os.getenv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY') or
    os.getenv('GOOGLE_MAPS_API_KEY')
)

DRY_RUN       = '--dry-run'   in sys.argv
DO_LANDLORDS  = '--landlords' in sys.argv or '--buildings' not in sys.argv
DO_BUILDINGS  = '--buildings' in sys.argv or '--landlords' not in sys.argv

FIND_URL    = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

if not API_KEY:
    print("ERROR: No Google Places API key found. Set GOOGLE_PLACES_API_KEY in .env.local")
    sys.exit(1)

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE env vars.")
    sys.exit(1)


def find_place(query: str) -> str | None:
    r = requests.get(FIND_URL, params={
        'input': query,
        'inputtype': 'textquery',
        'fields': 'place_id,name',
        'key': API_KEY,
    }, timeout=10)
    candidates = r.json().get('candidates', [])
    return candidates[0]['place_id'] if candidates else None


def get_details(place_id: str) -> dict:
    r = requests.get(DETAILS_URL, params={
        'place_id': place_id,
        'fields': 'name,rating,user_ratings_total',
        'key': API_KEY,
    }, timeout=10)
    result = r.json().get('result', {})
    return {
        'name':         result.get('name'),
        'rating':       result.get('rating'),
        'review_count': result.get('user_ratings_total', 0),
    }


def landlord_pass(supabase):
    print("=== LANDLORD PASS ===")
    landlords = supabase.table('landlords').select('id, name').execute().data or []
    print(f"  {len(landlords)} landlords\n")

    updated = 0
    for l in landlords:
        name, lid = l['name'], l['id']
        place_id = find_place(f"{name} Champaign IL")
        if not place_id:
            print(f"  [NOT FOUND] {name}")
            time.sleep(0.3)
            continue

        d = get_details(place_id)
        print(f"  {name}")
        print(f"    → {d['name']} | rating={d['rating']} | reviews={d['review_count']}")

        if not DRY_RUN and d['rating'] is not None:
            supabase.table('landlords').update({
                'aggregate_rating': d['rating'],
                'review_count':     d['review_count'],
            }).eq('id', lid).execute()
            updated += 1

        time.sleep(0.3)

    print(f"\n  Updated {updated} landlords\n")


def building_pass(supabase):
    print("=== BUILDING PASS ===")
    apartments = supabase.table('apartments').select('id, name, address').execute().data or []
    print(f"  {len(apartments)} apartments\n")

    updated = 0
    not_found = 0
    for apt in apartments:
        name    = apt.get('name', '')
        address = apt.get('address', '')
        apt_id  = apt['id']

        query = f"{address} Champaign IL" if address else f"{name} Champaign IL"
        place_id = find_place(query)

        if not place_id:
            print(f"  [NOT FOUND] {name} | {address}")
            not_found += 1
            time.sleep(0.3)
            continue

        d = get_details(place_id)
        print(f"  {name}")
        print(f"    → {d['name']} | rating={d['rating']} | reviews={d['review_count']}")

        if not DRY_RUN:
            payload = {'google_review_count': d['review_count']}
            # Also try to update google_rating if column exists
            try:
                supabase.table('apartments').update({
                    **payload,
                    'google_rating': d['rating'],
                }).eq('id', apt_id).execute()
            except Exception:
                # Column probably doesn't exist — fall back to count only
                supabase.table('apartments').update(payload).eq('id', apt_id).execute()
            updated += 1

        time.sleep(0.3)

    print(f"\n  Updated {updated} | Not found {not_found}\n")


def main():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Starting Google Reviews scraper\n")

    if DO_LANDLORDS:
        landlord_pass(supabase)
    if DO_BUILDINGS:
        building_pass(supabase)

    print("Done.")


if __name__ == '__main__':
    main()
