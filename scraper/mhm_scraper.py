"""
mhm_scraper.py
Scrapes MHM Properties (mhmproperties.com) — WordPress, server-side rendered.
Fetches /apartments/ and /houses-condos/ for all property links, then scrapes each.
Usage:
    python mhm_scraper.py           # live run
    python mhm_scraper.py --dry-run
"""
import os
import re
import sys
import time
import requests
from bs4 import BeautifulSoup
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
BASE_URL  = 'https://www.mhmproperties.com'
LIST_URLS = [
    'https://www.mhmproperties.com/apartments/',
    'https://www.mhmproperties.com/houses-condos/',
]
HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    )
}
SKIP_ADDRESSES = set()
# ── landlord ID ───────────────────────────────────────────────────────────────
def get_landlord_id() -> str | None:
    rows = supabase.table('landlords').select('id').eq('name', 'MHM Property Management').execute()
    if rows.data:
        return rows.data[0]['id']
    return None
# ── get property links ────────────────────────────────────────────────────────
def get_property_links() -> list[str]:
    seen = set()
    links = []
    for list_url in LIST_URLS:
        resp = requests.get(list_url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        for a in soup.find_all('a', href=re.compile(r'/property/')):
            href = a['href'].strip()
            if not href.startswith('http'):
                href = BASE_URL + href
            if href not in seen:
                seen.add(href)
                links.append(href)
    return links
# ── parse a property page ─────────────────────────────────────────────────────
def scrape_property(url: str) -> dict | None:
    resp = requests.get(url, headers=HEADERS, timeout=15)
    if resp.status_code != 200:
        print(f"  [SKIP] HTTP {resp.status_code}")
        return None
    soup = BeautifulSoup(resp.text, 'html.parser')
    text = soup.get_text(separator=' ')
    # Address from <h1>
    h1 = soup.find('h1')
    address = h1.get_text(strip=True) if h1 else ''
    if not address:
        return None
    if any(s in address.lower() for s in SKIP_ADDRESSES):
        print(f"  [SKIP] Office address: {address}")
        return None
    # Amenities section
    amenity_text = ''
    for heading in soup.find_all(['h2', 'h3', 'h4']):
        if 'features' in heading.get_text(separator=' ').lower() and 'amenities' in heading.get_text(separator=' ').lower():
            ul = heading.find_next('ul')
            if ul:
                amenity_text = ul.get_text(separator=' ').lower()
            break
    full_text = text.lower()
    amenities = detect_amenities(amenity_text or full_text, full_text)
    # Prices
    price_section = ''
    for heading in soup.find_all(['h2', 'h3', 'h4']):
        if 'price' in heading.get_text().lower():
            nxt = heading.find_next_sibling()
            chunks = []
            while nxt and nxt.name not in ('h2', 'h3', 'h4'):
                chunks.append(nxt.get_text(separator=' '))
                nxt = nxt.find_next_sibling()
            price_section = ' '.join(chunks).lower()
            break
    prices = []
    for m in re.finditer(r'\$\s*([\d,]+)\s*/\s*(?:person|mo|month)', price_section, re.I):
        val = int(m.group(1).replace(',', ''))
        if 300 <= val <= 5000:
            prices.append(val)
    for m in re.finditer(r'from\s+\$\s*([\d,]+)', price_section, re.I):
        val = int(m.group(1).replace(',', ''))
        if 300 <= val <= 5000:
            prices.append(val)
    rent_min = min(prices) if prices else None
    rent_max = max(prices) if prices else None
    # Bedrooms
    beds = set()
    if re.search(r'studio|efficiency', full_text):
        beds.add(0)
    for m in re.finditer(r'(\d)\s*bed(?:room)?', full_text):
        n = int(m.group(1))
        if 1 <= n <= 8:
            beds.add(n)
    for m in re.finditer(r'(\d+)[\s-]*(?:to[\s-]*(\d+))?\s*(?:person|people)', full_text):
        lo = int(m.group(1))
        hi = int(m.group(2)) if m.group(2) else lo
        for n in range(lo, min(hi, 11) + 1):
            beds.add(n)
    bedrooms = sorted(b for b in beds if 0 <= b <= 11)
    return {
        'address': address,
        'rent_min': rent_min,
        'rent_max': rent_max,
        'bedrooms': bedrooms,
        'leasing_url': url,
        **amenities,
    }
# ── amenity detection ─────────────────────────────────────────────────────────
def detect_amenities(amenity_text: str, full_text: str) -> dict:
    t = amenity_text
    laundry_unit = any(k in t for k in [
        'in-unit washer', 'in unit washer', 'washer/dryer', 'washer & dryer',
        'in-unit laundry', 'in unit laundry', 'in-unit full size washer',
        'full size washer',
    ])
    laundry_building = (not laundry_unit) and any(k in t for k in [
        'laundry facility', 'laundry room', 'laundry on', 'on-site laundry',
        'community laundry', 'coin laundry', 'laundry center',
    ])
    parking = any(k in t for k in [
        'parking available', 'parking included', 'garage parking', 'covered parking',
        'parking lot', 'assigned parking', 'off-street parking', 'parking space',
        'parking garage', 'underground', 'free parking', 'reserved parking',
    ])
    pets = any(k in t for k in [
        'pet friendly', 'pet-friendly', 'pets allowed', 'pets welcome',
        'cats allowed', 'dogs allowed', 'cats ok', 'dogs ok',
    ])
    utilities = any(k in t for k in [
        'all utilities', 'utilities included', 'paid utilities', 'utilities paid',
        'water included', 'heat included',
    ]) or 'paid utilities' in full_text
    furnished = any(k in t for k in [
        'fully furnished', 'furnished apartment', 'furnished unit',
        'furniture included',
    ])
    dishwasher = 'dishwasher' in t
    ac = any(k in t for k in [
        'central a/c', 'central air', 'central ac', 'air conditioning',
        'air conditioner',
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
# ── DB helpers ────────────────────────────────────────────────────────────────
def normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()
def find_match(address: str, existing: list[dict]) -> dict | None:
    parts = normalize(address).split()
    if not parts or not parts[0].isdigit():
        return None
    num = parts[0]
    street_words = [p for p in parts[1:] if p not in (
        'e', 'w', 'n', 's', 'st', 'ave', 'dr', 'ct', 'blvd', 'street', 'road'
    )]
    if not street_words:
        return None
    sword = street_words[0]
    for row in existing:
        addr = normalize(row.get('address', ''))
        if re.search(r'\b' + re.escape(num) + r'\b', addr) and sword in addr:
            return row
    return None
def upsert_row(row_id: str | None, name: str, data: dict, landlord_id: str | None) -> None:
    payload = {
        'rent_min':            data['rent_min'],
        'rent_max':            data['rent_max'],
        'bedrooms':            data['bedrooms'],
        'laundry_in_unit':     data['laundry_in_unit'],
        'laundry_in_building': data['laundry_in_building'],
        'parking_available':   data['parking_available'],
        'pets_allowed':        data['pets_allowed'],
        'utilities_included':  data['utilities_included'],
        'furnished':           data['furnished'],
        'dishwasher':          data['dishwasher'],
        'ac':                  data['ac'],
        'leasing_url':         data['leasing_url'],
    }
    if landlord_id:
        payload['landlord_id'] = landlord_id
    if DRY_RUN:
        action = 'UPDATE' if row_id else 'INSERT'
        print(f"  [{action}] {name}")
        print(f"    rent: ${data['rent_min']} – ${data['rent_max']}/person  |  beds: {data['bedrooms']}")
        a = data
        print(f"    laundry_in_unit={a['laundry_in_unit']}  parking={a['parking_available']}  "
              f"furnished={a['furnished']}  utilities={a['utilities_included']}  "
              f"dishwasher={a['dishwasher']}  ac={a['ac']}")
        return
    if row_id:
        supabase.table('apartments').update(payload).eq('id', row_id).execute()
    else:
        payload['name']    = name
        payload['address'] = data['address'] + ', Champaign, IL 61820'
        supabase.table('apartments').insert(payload).execute()
# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}")
    existing = supabase.table('apartments').select('id, name, address').execute().data or []
    print(f"Loaded {len(existing)} existing apartments from DB")
    landlord_id = get_landlord_id()
    print(f"MHM landlord_id: {landlord_id}")
    links = get_property_links()
    print(f"Found {len(links)} property pages\n")
    updated = inserted = skipped = 0
    for url in links:
        slug = url.rstrip('/').split('/')[-1]
        print(f"Scraping: {slug}  ({url})")
        data = scrape_property(url)
        if data is None:
            skipped += 1
            continue
        match = find_match(data['address'], existing)
        if match:
            upsert_row(match['id'], match.get('name', data['address']), data, landlord_id)
            updated += 1
        else:
            upsert_row(None, data['address'], data, landlord_id)
            inserted += 1
        time.sleep(0.8)
    print(f"\n{'='*50}")
    print(f"Done: {updated} updated, {inserted} inserted, {skipped} skipped")
    if DRY_RUN:
        print("(DRY RUN — nothing written to DB)")
if __name__ == '__main__':
    main()
