#!/usr/bin/env python3
"""
Bankier Apartments scraper
Data source: WordPress REST API (/wp-json/wp/v2/properties)
Amenities from class_list slugs; rent/bedrooms not available via API.
"""
import os, re, sys, requests
from dotenv import load_dotenv
from supabase import create_client
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
DRY_RUN = '--dry-run' in sys.argv
PROPERTIES_API = 'https://bankierapartments.com/wp-json/wp/v2/properties?per_page=100'
LANDLORD = 'Bankier Apartments'
CITY = 'Champaign'
STATE = 'IL'
ZIP_CODE = '61820'
# Amenity slug → field mapping
AMENITY_MAP = {
    'amenities-air-conditioner': 'ac',
    'amenities-air-conditioning': 'ac',
    'amenities-furnished': 'furnished',
    'amenities-available-onsite-parking': 'parking_available',
    'amenities-covered-parking': 'parking_available',
    'amenities-garage': 'parking_available',
    'amenities-off-street-parking': 'parking_available',
    'amenities-washer-dryer': 'laundry_in_unit',
    'amenities-pets-allowed': 'pets_allowed',
}
def normalize_address(title: str) -> str:
    """'202 E. John St' -> '202 E John St, Champaign, IL 61820'"""
    addr = title.strip().replace('.', '')
    addr = addr.rstrip(',')
    return f"{addr}, {CITY}, {STATE} {ZIP_CODE}"
def parse_amenities(class_list: list) -> dict:
    amenities = {
        'ac': False,
        'furnished': False,
        'parking_available': False,
        'laundry_in_unit': False,
        'pets_allowed': False,
    }
    for cls in class_list:
        if cls in AMENITY_MAP:
            amenities[AMENITY_MAP[cls]] = True
    return amenities
def fetch_properties() -> list:
    resp = requests.get(PROPERTIES_API, timeout=15)
    resp.raise_for_status()
    return resp.json()
def find_db_row(supabase, address_title: str):
    """Try to match property in DB by street number + street word."""
    parts = address_title.replace('.', '').split()
    if not parts:
        return None
    num = parts[0]
    street_word = parts[2] if len(parts) >= 3 else (parts[1] if len(parts) >= 2 else '')
    rows = supabase.table('apartments').select('id, address').execute()
    for row in (rows.data or []):
        addr = (row.get('address') or '').lower()
        if re.search(r'\b' + re.escape(num.lower()) + r'\b', addr):
            if not street_word or street_word.lower() in addr:
                return row
    return None
def upsert_row(supabase, prop: dict) -> str:
    title = prop['title']['rendered']
    address = normalize_address(title)
    amenities = parse_amenities(prop.get('class_list', []))
    link = prop.get('link', '')  # direct URL to this property's page on bankierapartments.com
    # Skip future properties with no amenity data
    classes = prop.get('class_list', [])
    amenity_classes = [c for c in classes if c.startswith('amenities-') and
                       c not in ('amenities-gigabit-speed-fiber-internet',)]
    if 'propertytypes-future' in classes and len(amenity_classes) <= 2:
        print(f"  [SKIP] {title}: future property with minimal data")
        return 'skipped'
    row_data = {
        'address': address,
        'ac': amenities['ac'],
        'furnished': amenities['furnished'],
        'parking_available': amenities['parking_available'],
        'laundry_in_unit': amenities['laundry_in_unit'],
        'pets_allowed': amenities['pets_allowed'],
        'laundry_in_building': False,
        'utilities_included': False,
        'leasing_url': link or None,
    }
    print(f"  {title} -> {address}")
    print(f"    ac={amenities['ac']} furnished={amenities['furnished']} "
      f"parking={amenities['parking_available']} laundry_in_unit={amenities['laundry_in_unit']}")
    print(f"    leasing_url={link}")
    if DRY_RUN:
        return 'dry'
    existing = find_db_row(supabase, title)
    if existing:
        supabase.table('apartments').update(row_data).eq('id', existing['id']).execute()
        return 'updated'
    else:
        row_data['name'] = title
        supabase.table('apartments').insert(row_data).execute()
        return 'inserted'
def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Fetching Bankier properties...")
    props = fetch_properties()
    print(f"Got {len(props)} properties\n")
    if not DRY_RUN:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        supabase = None
    counts = {'updated': 0, 'inserted': 0, 'skipped': 0, 'dry': 0}
    for prop in props:
        result = upsert_row(supabase, prop)
        counts[result] = counts.get(result, 0) + 1
    print(f"\nDone: {counts.get('updated', 0)} updated, "
          f"{counts.get('inserted', 0)} inserted, "
          f"{counts.get('skipped', 0)} skipped")
if __name__ == '__main__':
    main()
