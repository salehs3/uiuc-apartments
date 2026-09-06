#!/usr/bin/env python3
"""
Roland Realty scraper.
Groups unit-level listings into buildings, then inserts one row per building.
All units: furnished=True, parking_available=True.
"""
import os, re, sys, time
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
DRY_RUN = '--dry-run' in sys.argv
BASE_URL = 'https://www.roland-realty.com/for-rent/available-fall/all-unit-listings'
CITY = 'Champaign'
STATE = 'IL'
ZIP_CODE = '61820'
TOTAL_PAGES = 14
DIRECTIONS = {'s', 'n', 'e', 'w'}
STREET_TYPES = {'st', 'ave', 'dr', 'ct', 'blvd', 'ln', 'pl', 'rd', 'ave'}

def slug_to_parts(slug):
    parts = slug.split('-')
    street_type_idx = -1
    for i, p in enumerate(parts):
        if p in STREET_TYPES:
            street_type_idx = i
            break
    if street_type_idx == -1:
        return slug, None
    after = parts[street_type_idx + 1:]
    if not after:
        return slug, None
    unit = after[-1]
    if re.match(r'^\d+$', unit) or re.match(r'^[a-z]\d*$', unit) or unit == 'sfh':
        building_slug = '-'.join(parts[:street_type_idx + 1])
        return building_slug, unit
    return slug, None

def slug_to_address(slug):
    parts = slug.split('-')
    result = []
    for p in parts:
        if p in DIRECTIONS:
            result.append(p.upper())
        elif p in STREET_TYPES:
            result.append(p.capitalize())
        elif p == '5' and result and result[-1][0].isdigit():
            result[-1] = result[-1] + '.5'
        elif p[0].isdigit():
            result.append(p)
        else:
            result.append(p.capitalize())
    return ' '.join(result)

def parse_listing(a_tag):
    text = a_tag.get_text(' ', strip=True)
    href = a_tag.get('href', '')
    slug = href.rstrip('/').split('/')[-1]
    building_slug, unit = slug_to_parts(slug)
    address = slug_to_address(building_slug)
    m = re.search(r'(\d+)\s+Bedrooms?', text)
    if not m:
        return None
    n_beds = int(m.group(1))
    m2 = re.search(r'\$\s*([\d,]+)\s+per bed', text)
    rent = int(m2.group(1).replace(',', '')) if m2 else None
    return {
        'building_address': f"{address}, {CITY}, {STATE} {ZIP_CODE}",
        'building_name': address,
        'bedrooms': n_beds,
        'rent': rent,
        'unit_url': href,
    }

def fetch_page(page):
    url = BASE_URL if page == 1 else f"{BASE_URL}?f5630116_page={page}"
    resp = requests.get(url, timeout=15, headers={'User-Agent': 'Mozilla/5.0'})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')
    listings = []
    for a in soup.find_all('a', href=re.compile(r'/unit-listings/')):
        data = parse_listing(a)
        if data:
            listings.append(data)
    return listings

def group_by_building(listings):
    buildings = {}
    for l in listings:
        addr = l['building_address']
        if addr not in buildings:
            buildings[addr] = {
                'address': addr,
                'name': l['building_name'],
                'bedrooms': set(),
                'rents': [],
                'leasing_url': l['unit_url'],
            }
        buildings[addr]['bedrooms'].add(l['bedrooms'])
        if l['rent']:
            buildings[addr]['rents'].append(l['rent'])
    result = []
    for addr, b in buildings.items():
        rents = b['rents']
        result.append({
            'address': addr,
            'name': b['name'],
            'bedrooms': sorted(b['bedrooms']),
            'rent_min': min(rents) if rents else None,
            'rent_max': max(rents) if rents else None,
            'leasing_url': b['leasing_url'],
        })
    return result

def find_match(address, existing):
    parts = re.sub(r'[^a-z0-9\s]', '', address.lower()).split()
    if not parts or not parts[0].isdigit():
        return None
    num = parts[0]
    street_words = [p for p in parts[1:] if p not in
                    ('e','w','n','s','st','ave','dr','ct','blvd','champaign','il','61820')]
    sword = street_words[0] if street_words else ''
    for row in existing:
        addr = re.sub(r'[^a-z0-9\s]', '', (row.get('address') or '').lower())
        if re.search(r'\b' + re.escape(num) + r'\b', addr) and (not sword or sword in addr):
            return row
    return None

def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Scraping Roland Realty ({TOTAL_PAGES} pages)...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Get Roland landlord_id
    landlord_id = None
    rows = supabase.table('landlords').select('id').eq('name', 'Roland Realty').execute()
    if rows.data:
        landlord_id = rows.data[0]['id']
    print(f"Roland landlord_id: {landlord_id}")

    if not DRY_RUN:
        existing = supabase.table('apartments').select('id, name, address').execute().data or []
        print(f"Loaded {len(existing)} existing apartments from DB\n")
    else:
        existing = []

    all_listings = []
    for page in range(1, TOTAL_PAGES + 1):
        listings = fetch_page(page)
        print(f"  Page {page}: {len(listings)} units")
        all_listings.extend(listings)
        time.sleep(0.5)

    buildings = group_by_building(all_listings)
    print(f"\nGrouped into {len(buildings)} buildings\n")

    updated = inserted = 0
    for b in buildings:
        print(f"  {b['name']} | beds={b['bedrooms']} rent=${b['rent_min']}-${b['rent_max']}/bed")
        if DRY_RUN:
            continue
        payload = {
            'rent_min': b['rent_min'],
            'rent_max': b['rent_max'],
            'bedrooms': b['bedrooms'],
            'furnished': True,
            'parking_available': True,
            'ac': False,
            'laundry_in_unit': False,
            'laundry_in_building': False,
            'pets_allowed': False,
            'utilities_included': False,
            'dishwasher': False,
            'leasing_url': b['leasing_url'],
        }
        if landlord_id:
            payload['landlord_id'] = landlord_id
        match = find_match(b['address'], existing)
        if match:
            supabase.table('apartments').update(payload).eq('id', match['id']).execute()
            updated += 1
        else:
            payload['name'] = b['name']
            payload['address'] = b['address']
            supabase.table('apartments').insert(payload).execute()
            inserted += 1

    if DRY_RUN:
        print(f"\n[DRY RUN] Would process {len(buildings)} buildings")
    else:
        print(f"\nDone: {updated} updated, {inserted} inserted")

if __name__ == '__main__':
    main()
