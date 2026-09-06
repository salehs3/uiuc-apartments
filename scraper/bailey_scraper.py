"""
bailey_scraper.py
Scrapes Bailey Apartments (baileyapartments.com).
All data is on a single amenities page — one fetch, no per-building requests.
Usage:
    python bailey_scraper.py           # live run
    python bailey_scraper.py --dry-run
"""
import os
import re
import sys
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
AMENITIES_URL = 'https://baileyapartments.com/amenities/'
LEASING_URL   = 'https://baileyapartments.com/amenities/'
CITY_STATE    = 'Urbana, IL 61801'
HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    ),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
}
# Building name → street address
BUILDING_ADDRESSES = {
    '901':  '901 W Springfield Ave',
    '911':  '911 W Springfield Ave',
    '1004': '1004 W Springfield Ave',
    '1006': '1006 W Springfield Ave',
    '1010': '1010 W Springfield Ave',
    '111':  '111 S Lincoln Ave',
    '808':  '808 W Springfield Ave',
}

# ── landlord ID ───────────────────────────────────────────────────────────────
def get_landlord_id() -> str | None:
    rows = supabase.table('landlords').select('id').eq('name', 'Bailey Apartments').execute()
    if rows.data:
        return rows.data[0]['id']
    return None

# ── parse amenities page ──────────────────────────────────────────────────────
def parse_amenities_page() -> dict[str, dict]:
    session = requests.Session()
    session.headers.update(HEADERS)
    session.get('https://baileyapartments.com/', timeout=15)
    resp = session.get(AMENITIES_URL, timeout=15)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')
    tables = soup.find_all('table')
    if len(tables) < 2:
        raise ValueError(f"Expected 2 tables, got {len(tables)}")
    amenity_table = tables[0]
    price_table   = tables[1]
    rows = amenity_table.find_all('tr')
    headers = [th.get_text(strip=True) for th in rows[0].find_all(['th', 'td'])]
    bldg_keys = headers[1:]
    buildings: dict[str, dict] = {k: {} for k in bldg_keys}
    for row in rows[1:]:
        cells = [td.get_text(strip=True) for td in row.find_all(['th', 'td'])]
        if not cells:
            continue
        feature = cells[0].lower()
        for i, key in enumerate(bldg_keys):
            val = cells[i + 1] if i + 1 < len(cells) else ''
            present = (val == 'X')
            buildings[key][feature] = present
    price_rows = price_table.find_all('tr')[1:]
    rents:    dict[str, list[int]] = {k: [] for k in bldg_keys}
    bedrooms: dict[str, set]       = {k: set() for k in bldg_keys}
    for row in price_rows:
        cells = [td.get_text(strip=True) for td in row.find_all(['th', 'td'])]
        if len(cells) < 3:
            continue
        bldg_raw = cells[0].strip()
        beds_raw = cells[1].strip()
        price_raw = cells[3].strip() if len(cells) > 3 else ''
        num_match = re.match(r'(\d+)', bldg_raw)
        if not num_match:
            continue
        bkey = num_match.group(1)
        if bkey not in buildings:
            continue
        if beds_raw.lower() in ('efficiency', 'studio', '0'):
            bedrooms[bkey].add(0)
        elif beds_raw.isdigit():
            bedrooms[bkey].add(int(beds_raw))
        for m in re.finditer(r'\$\s*([\d,]+)', price_raw):
            val = int(m.group(1).replace(',', ''))
            if 300 <= val <= 10000:
                rents[bkey].append(val)
    result = {}
    for key in bldg_keys:
        feats = buildings[key]
        all_rents = rents.get(key, [])
        addr = BUILDING_ADDRESSES.get(key, key + ' W Springfield Ave')
        result[key] = {
            'address':             addr,
            'rent_min':            min(all_rents) if all_rents else None,
            'rent_max':            max(all_rents) if all_rents else None,
            'bedrooms':            sorted(bedrooms.get(key, set())),
            'laundry_in_unit':     False,
            'laundry_in_building': feats.get('on-site laundry', False),
            'parking_available':   feats.get('parking (uncovered)', False) or feats.get('parking (covered)', False),
            'pets_allowed':        False,
            'utilities_included':  False,
            'furnished':           feats.get('furnished', False),
            'dishwasher':          feats.get('dishwasher', False),
            'ac':                  feats.get('air conditioning (central)', False),
            'leasing_url':         f'https://baileyapartments.com/amenities/#{key}',
        }
    return result

# ── DB helpers ────────────────────────────────────────────────────────────────
def normalize(s: str) -> str:
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()

def find_match(address: str, existing: list[dict]) -> dict | None:
    parts = normalize(address).split()
    if not parts or not parts[0].isdigit():
        return None
    num = parts[0]
    street_words = [p for p in parts[1:] if p not in (
        'w', 'e', 'n', 's', 'ave', 'st', 'dr', 'blvd', 'street', 'avenue', 'road'
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
        print(f"  [{action}] {name}  ({data['address']})")
        print(f"    rent: ${data['rent_min']} – ${data['rent_max']}/mo  |  beds: {data['bedrooms']}")
        print(f"    laundry_bldg={data['laundry_in_building']}  parking={data['parking_available']}  "
              f"furnished={data['furnished']}  dishwasher={data['dishwasher']}  ac={data['ac']}")
        return

    if row_id:
        supabase.table('apartments').update(payload).eq('id', row_id).execute()
    else:
        payload['name']    = name
        payload['address'] = data['address'] + ', ' + CITY_STATE
        supabase.table('apartments').insert(payload).execute()

# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}")
    existing = supabase.table('apartments').select('id, name, address').execute().data or []
    print(f"Loaded {len(existing)} existing apartments from DB")

    landlord_id = get_landlord_id()
    print(f"Bailey landlord_id: {landlord_id}")

    print("Fetching Bailey amenities page...")
    buildings = parse_amenities_page()
    print(f"Found {len(buildings)} buildings\n")

    updated = inserted = 0
    for key, data in buildings.items():
        name = data['address']
        print(f"Processing: {name}")
        match = find_match(data['address'], existing)
        if match:
            upsert_row(match['id'], match.get('name', name), data, landlord_id)
            updated += 1
        else:
            upsert_row(None, name, data, landlord_id)
            inserted += 1

    print(f"\n{'='*50}")
    print(f"Done: {updated} updated, {inserted} inserted")
    if DRY_RUN:
        print("(DRY RUN — nothing written to DB)")

if __name__ == '__main__':
    main()
