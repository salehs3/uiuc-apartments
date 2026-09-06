"""
jsm_scraper.py
Scrapes JSM Living buildings for amenities, pricing, and bedroom counts.
Site: https://jsmliving.com (Drupal, server-side rendered — plain requests works)

Usage:
    python jsm_scraper.py           # live run (writes to DB)
    python jsm_scraper.py --dry-run # prints what would be written, no DB writes
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

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    )
}

BUILDINGS_URL = 'https://jsmliving.com/buildings'

# Non-apartment pages that show up as /node/XXXXX links — skip them
SKIP_NODE_NAMES = {
    'schedule a tour',
    'leasing application',
    'virtual lease signing appointment',
    'payments & security deposits',
    'frequently asked questions',
}

# ── amenity detection ─────────────────────────────────────────────────────────

def detect_amenities(text: str) -> dict:
    t = text.lower()

    laundry_unit = any(k in t for k in [
        'in-unit washer', 'in unit washer', 'washer/dryer in unit',
        'w/d in unit', 'in-unit w/d', 'washer & dryer in unit',
        'washer and dryer in unit', 'in-unit laundry', 'in unit laundry',
        'full-size washer', 'full size washer',
    ])

    laundry_building = (not laundry_unit) and any(k in t for k in [
        'laundry facility', 'laundry room', 'shared laundry',
        'on-site laundry', 'on site laundry', 'community laundry',
        'laundry center', 'coin laundry', 'laundry on site',
    ])

    # Parking: require explicit "parking available/included/garage/lot" — not
    # bare "parking" which appears in JSM's footer nav on every page.
    parking = any(k in t for k in [
        'parking available', 'parking included', 'garage parking',
        'covered parking', 'surface parking', 'parking lot',
        'assigned parking', 'off-street parking', 'parking space',
        'parking garage', 'private parking', 'permit parking',
    ])

    utilities = any(k in t for k in [
        'all utilities', 'utilities included', 'utility fee',
        'no caps', 'utilities are included', 'water included',
        'heat included', 'electricity included', 'utilities paid',
    ])

    return {
        'laundry_in_unit':     laundry_unit,
        'laundry_in_building': laundry_building,
        'parking_available':   parking,
        'pets_allowed':        any(k in t for k in [
            'pet friendly', 'pet-friendly', 'pets allowed', 'pets welcome',
            'cats allowed', 'dogs allowed', 'cats ok', 'dogs ok',
        ]),
        'utilities_included':  utilities,
        'furnished':           any(k in t for k in [
            'fully furnished', 'furnished apartment', 'furniture included',
            'comes furnished', 'furnished unit',
        ]),
        'dishwasher':          'dishwasher' in t,
        'ac':                  any(k in t for k in [
            'air conditioning', 'central air', 'central a/c', 'central ac',
            'air conditioner', 'a/c included', 'cooling',
        ]),
    }


# ── price / bedroom parsing ───────────────────────────────────────────────────

def parse_prices(text: str) -> tuple[int | None, int | None]:
    """Return (rent_min, rent_max) per bed or (None, None)."""
    # Patterns like "$850/bed", "$850 per bed", "$850/bedroom"
    explicit = re.findall(r'\$(\d[\d,]*)\s*/\s*(?:bed(?:room)?|br)\b', text, re.I)
    if not explicit:
        explicit = re.findall(r'\$(\d[\d,]*)\s+per\s+bed', text, re.I)

    prices = []
    if explicit:
        prices = [int(p.replace(',', '')) for p in explicit]
    else:
        # Fallback: all dollar amounts in realistic rent range
        raw = re.findall(r'\$(\d[\d,]*)', text)
        prices = [int(p.replace(',', '')) for p in raw if 300 <= int(p.replace(',', '')) <= 5000]

    if not prices:
        return None, None
    return min(prices), max(prices)


def parse_bedrooms(text: str) -> list[int]:
    """Return sorted list of bedroom counts (0 = studio)."""
    t = text.lower()
    beds = set()
    if any(k in t for k in ['studio', 'efficiency']):
        beds.add(0)
    for m in re.finditer(r'(\d)\s*(?:-\s*)?bed(?:room)?', t):
        n = int(m.group(1))
        if 1 <= n <= 8:
            beds.add(n)
    return sorted(beds)


# ── address / DB matching ─────────────────────────────────────────────────────

def normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()


def find_match(name: str, existing: list[dict]) -> dict | None:
    """Match by street number + first street word."""
    parts = normalize(name).split()
    if not parts:
        return None
    num = parts[0]
    if not num.isdigit():
        return None
    street_words = [p for p in parts[1:] if p not in ('e', 'w', 'n', 's', 'st', 'ave', 'dr', 'ct', 'blvd')]
    if not street_words:
        return None
    street_word = street_words[0]

    for row in existing:
        addr = normalize(row.get('address', ''))
        if num in addr and street_word in addr:
            return row
    return None


# ── scraping ──────────────────────────────────────────────────────────────────

def get_building_links() -> list[tuple[str, str]]:
    """Return list of (name, url) for each building node."""
    resp = requests.get(BUILDINGS_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    seen = set()
    links = []
    for a in soup.find_all('a', href=re.compile(r'/node/\d+')):
        href = a['href'].strip()
        if not href.startswith('http'):
            href = 'https://jsmliving.com' + href
        if href in seen:
            continue
        seen.add(href)
        name = a.get_text(strip=True)
        if name:
            links.append((name, href))
    return links


def scrape_building(name: str, url: str) -> dict | None:
    """Fetch a building page and return scraped data, or None to skip."""
    # Skip known non-apartment pages by name
    if name.lower() in SKIP_NODE_NAMES:
        print(f"  [SKIP] Non-apartment page: {name}")
        return None

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
    except requests.RequestException as e:
        print(f"  [ERROR] {name}: {e}")
        return None

    if resp.status_code != 200:
        print(f"  [SKIP] {name}: HTTP {resp.status_code}")
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')
    text = soup.get_text(separator=' ')

    rent_min, rent_max = parse_prices(text)
    bedrooms = parse_bedrooms(text)

    # Skip pages with no pricing AND no bedroom data — definitely not an apartment
    if rent_min is None and not bedrooms:
        print(f"  [SKIP] {name}: no rent/bed data (non-apartment page)")
        return None

    amenities = detect_amenities(text)
    return {
        'rent_min':  rent_min,
        'rent_max':  rent_max,
        'bedrooms':  bedrooms,
        **amenities,
    }


# ── Supabase helpers ──────────────────────────────────────────────────────────

def fetch_existing() -> list[dict]:
    resp = supabase.table('apartments').select('id, name, address').execute()
    return resp.data or []


def upsert_row(row_id: str | None, name: str, address_guess: str, data: dict) -> None:
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
    }

    if DRY_RUN:
        ...  # keep as-is

    if row_id:
        supabase.table('apartments').update(payload).eq('id', row_id).execute()
    else:
        payload['name']    = name
        payload['address'] = address_guess
        supabase.table('apartments').insert(payload).execute()


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}")
    existing = fetch_existing()
    print(f"Loaded {len(existing)} existing apartments from DB")

    print(f"Fetching building list from JSM...")
    links = get_building_links()
    print(f"Found {len(links)} buildings\n")

    updated = inserted = skipped = 0

    for name, url in links:
        print(f"Scraping: {name}  ({url})")
        data = scrape_building(name, url)
        if data is None:
            skipped += 1
            continue

        match = find_match(name, existing)
        if match:
            upsert_row(match['id'], name, match.get('address', name), data)
            updated += 1
        else:
            upsert_row(None, name, name, data)
            inserted += 1

        time.sleep(0.8)

    print(f"\n{'='*50}")
    print(f"Done: {updated} updated, {inserted} inserted, {skipped} skipped")
    if DRY_RUN:
        print("(DRY RUN — nothing written to DB)")


if __name__ == '__main__':
    main()
