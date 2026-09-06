"""
smile_scraper.py
Scrapes Smile Student Living via their Duda CMS / AppFolio listings API.
API: https://www.smilestudentliving.com/rts/collections/public/0af4bf1b/runtime/collection/appfolio-listings/query-data
Usage:
    python smile_scraper.py           # live run (writes to DB)
    python smile_scraper.py --dry-run # prints what would be written, no DB writes
"""
import os
import re
import sys
import time
import requests
from supabase import create_client
from dotenv import load_dotenv
# ── env ──────────────────────────────────────────────────────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, '..', '.env.local'))
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = (
    os.environ.get('SUPABASE_SERVICE_KEY')
    or os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
DRY_RUN = '--dry-run' in sys.argv
HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Referer': 'https://www.smilestudentliving.com/',
}
API_URL = (
    'https://www.smilestudentliving.com/rts/collections/public/0af4bf1b'
    '/runtime/collection/appfolio-listings/query-data'
    '?pageSize=500&pageNumber=0&query=%28%29&language=ENGLISH'
)
LEASING_BASE = 'https://www.smilestudentliving.com/availability'

# ── landlord ID ───────────────────────────────────────────────────────────────
def get_landlord_id() -> str | None:
    rows = supabase.table('landlords').select('id').eq('name', 'Smile Student Living').execute()
    if rows.data:
        return rows.data[0]['id']
    return None

# ── amenity detection ─────────────────────────────────────────────────────────
def detect_amenities(amenities_str: str, utilities_str: str, cats: str, dogs: str) -> dict:
    a = (amenities_str or '').lower()
    u = (utilities_str or '').lower()
    laundry_unit = any(k in a for k in [
        'in-unit washer', 'in unit washer', 'washer/dryer', 'w/d in unit',
        'in-unit laundry', 'in unit laundry',
    ])
    laundry_building = (not laundry_unit) and any(k in a for k in [
        'laundry facility', 'laundry room', 'shared laundry', 'on-site laundry',
        'community laundry', 'laundry center', 'coin laundry',
    ])
    parking = any(k in a for k in [
        'parking available', 'parking included', 'garage parking', 'covered parking',
        'surface parking', 'parking lot', 'assigned parking', 'off-street parking',
        'parking space', 'parking garage', 'private parking', 'permit parking',
        'indoor parking', 'outdoor parking',
    ])
    pets = bool(cats or dogs) or any(k in a for k in [
        'pet-friendly', 'pet friendly', 'pets allowed', 'pets welcome',
        'cats allowed', 'dogs allowed',
    ])
    utilities = bool((utilities_str or '').strip())
    furnished = any(k in a for k in [
        'fully furnished', 'furnished', 'furniture included',
    ])
    dishwasher = 'dishwasher' in a
    ac = any(k in a for k in [
        'air conditioning', 'central air', 'central a/c', 'central ac',
        'air conditioner', 'a/c', 'cooling',
    ])
    return {
        'laundry_in_unit':     laundry_unit,
        'laundry_in_building': laundry_building,
        'parking_available':   parking,
        'pets_allowed':        pets,
        'utilities_included':  utilities,
        'furnished':           furnished,
        'dishwasher':          dishwasher,
        'ac':                  ac,
    }

# ── fetch all listings from API ───────────────────────────────────────────────
def fetch_listings() -> list[dict]:
    resp = requests.get(API_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    values = data.get('values', [])
    listings = [v['data'] for v in values if isinstance(v.get('data'), dict)]
    return listings

# ── group unit-level listings into buildings ──────────────────────────────────
def group_by_building(listings: list[dict]) -> dict[str, dict]:
    buildings: dict[str, dict] = {}
    for item in listings:
        rent = float(item.get('market_rent') or 0)
        beds = item.get('bedrooms')
        marketing_title = (item.get('marketing_title') or '').lower()
        if rent == 0 and beds is None:
            continue
        if 'sublease' in marketing_title:
            continue
        addr1 = (item.get('address_address1') or '').strip()
        city  = (item.get('address_city') or 'Champaign').strip()
        state = (item.get('address_state') or 'IL').strip()
        full  = f"{addr1}, {city}, {state}"
        if not addr1:
            continue
        if addr1.startswith('615 S Wright'):
            continue
        if addr1 not in buildings:
            buildings[addr1] = {
                'address': full,
                'address1': addr1,
                'rents': [],
                'bedrooms': set(),
                'amenities_parts': [],
                'utilities': item.get('utilities') or '',
                'cats': item.get('cats') or '',
                'dogs': item.get('dogs') or '',
                'listing_uid': item.get('listing_uid') or '',
            }
        b = buildings[addr1]
        if rent > 0:
            b['rents'].append(rent)
        if beds is not None:
            b['bedrooms'].add(int(beds))
        amenities_str = item.get('amenities') or ''
        if amenities_str:
            b['amenities_parts'].append(amenities_str)
        if len(item.get('utilities') or '') > len(b['utilities']):
            b['utilities'] = item.get('utilities') or ''
        if item.get('cats'):
            b['cats'] = item['cats']
        if item.get('dogs'):
            b['dogs'] = item['dogs']
    return buildings

# ── DB matching ───────────────────────────────────────────────────────────────
def normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()

def find_match(addr1: str, existing: list[dict]) -> dict | None:
    parts = normalize(addr1).split()
    if not parts:
        return None
    num = parts[0]
    if not num.isdigit():
        return None
    street_words = [p for p in parts[1:] if p not in ('e', 'w', 'n', 's', 'st', 'ave', 'dr', 'ct', 'blvd', 'street')]
    if not street_words:
        return None
    street_word = street_words[0]
    for row in existing:
        addr = normalize(row.get('address', ''))
        if num in addr and street_word in addr:
            return row
    return None

# ── DB upsert ─────────────────────────────────────────────────────────────────
def upsert_row(row_id: str | None, name: str, address: str, data: dict, landlord_id: str | None) -> None:
    amenities = detect_amenities(
        ' | '.join(data['amenities_parts']),
        data['utilities'],
        data['cats'],
        data['dogs'],
    )
    rents = data['rents']
    rent_min = int(min(rents)) if rents else None
    rent_max = int(max(rents)) if rents else None
    bedrooms = sorted(data['bedrooms'])
    # Build per-building leasing URL using listing_uid if available
    uid = data.get('listing_uid', '')
    leasing_url = f"https://smilestudentliving.appfolio.com/listings/detail/{uid}" if uid else LEASING_BASE

    payload = {
        'rent_min':     rent_min,
        'rent_max':     rent_max,
        'bedrooms':     bedrooms,
        'leasing_url':  leasing_url,
        **amenities,
    }
    if landlord_id:
        payload['landlord_id'] = landlord_id

    if DRY_RUN:
        action = 'UPDATE' if row_id else 'INSERT'
        print(f"  [{action}] {name}")
        print(f"    rent: ${rent_min} – ${rent_max}/unit  |  beds: {bedrooms}")
        print(f"    laundry_in_unit={amenities['laundry_in_unit']}  "
              f"parking={amenities['parking_available']}  "
              f"furnished={amenities['furnished']}  "
              f"utilities_included={amenities['utilities_included']}  "
              f"pets={amenities['pets_allowed']}")
        return

    if row_id:
        supabase.table('apartments').update(payload).eq('id', row_id).execute()
    else:
        payload['name']    = name
        payload['address'] = address
        supabase.table('apartments').insert(payload).execute()

# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}")
    existing = supabase.table('apartments').select('id, name, address').execute().data or []
    print(f"Loaded {len(existing)} existing apartments from DB")

    landlord_id = get_landlord_id()
    print(f"Smile landlord_id: {landlord_id}")

    print("Fetching listings from Smile API...")
    listings = fetch_listings()
    print(f"Got {len(listings)} unit-level listings")
    buildings = group_by_building(listings)
    print(f"Grouped into {len(buildings)} buildings\n")

    updated = inserted = 0
    for addr1, bdata in sorted(buildings.items()):
        name = addr1
        print(f"Processing: {name}")
        match = find_match(addr1, existing)
        if match:
            upsert_row(match['id'], match.get('name', name), bdata['address'], bdata, landlord_id)
            updated += 1
        else:
            upsert_row(None, name, bdata['address'], bdata, landlord_id)
            inserted += 1
        time.sleep(0.2)

    print(f"\n{'='*50}")
    print(f"Done: {updated} updated, {inserted} inserted")
    if DRY_RUN:
        print("(DRY RUN — nothing written to DB)")

if __name__ == '__main__':
    main()
