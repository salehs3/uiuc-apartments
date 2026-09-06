#!/usr/bin/env python3
"""
JSJ Property Management scraper.
Data hardcoded from property pages (AppFolio API not accessible).
Skips: Pines|Metro (Charleston IL, EIU area), Garden Court (no full address), 611|Lofts (page empty).
"""
import os, re, sys
from dotenv import load_dotenv
from supabase import create_client
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env.local'))
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')
DRY_RUN = '--dry-run' in sys.argv
LANDLORD = 'JSJ Property Management'
# Hardcoded from property pages
PROPERTIES = [
    # U|301
    {
        'name': '301 W University Ave',
        'address': '301 W University Ave, Champaign, IL 61820',
        'bedrooms': [0, 1],
        'ac': True, 'furnished': True, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/u-301',
    },
    # Luxe District - 4 buildings, 1-2 bed, furnished, W/D in unit, AC
    {
        'name': '314 S State St',
        'address': '314 S State St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': True, 'furnished': True, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/luxe-district',
    },
    {
        'name': '318 S State St',
        'address': '318 S State St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': True, 'furnished': True, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/luxe-district',
    },
    {
        'name': '309 W Washington St',
        'address': '309 W Washington St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': True, 'furnished': True, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/luxe-district',
    },
    {
        'name': '305 W Clark St',
        'address': '305 W Clark St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': True, 'furnished': True, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/luxe-district',
    },
    # 305|Lofts
    {
        'name': '305 W Washington St',
        'address': '305 W Washington St, Champaign, IL 61820',
        'bedrooms': [1],
        'ac': True, 'furnished': False, 'parking_available': False,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/305-lofts',
    },
    # 2414|Neil
    {
        'name': '2414 N Neil St',
        'address': '2414 N Neil St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': True, 'furnished': False, 'parking_available': True,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/2414-neil',
    },
    # 707|Luxe (Urbana)
    {
        'name': '707 W Springfield Ave',
        'address': '707 W Springfield Ave, Urbana, IL 61801',
        'bedrooms': [1, 2],
        'ac': False, 'furnished': True, 'parking_available': True,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/707---luxe',
    },
    # State|Cedar - 2 buildings
    {
        'name': '1407 S State St',
        'address': '1407 S State St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': False, 'furnished': False, 'parking_available': True,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': True, 'dishwasher': False,
        'leasing_url': 'https://www.jsjmanagement.com/state-cedar',
    },
    {
        'name': '310 Cedar St',
        'address': '310 Cedar St, Champaign, IL 61820',
        'bedrooms': [1, 2],
        'ac': False, 'furnished': False, 'parking_available': True,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': False, 'utilities_included': True, 'dishwasher': False,
        'leasing_url': 'https://www.jsjmanagement.com/state-cedar',
    },
    # The Foundry - 2 buildings
    {
        'name': '208 N Harvey Ave',
        'address': '208 N Harvey Ave, Champaign, IL 61820',
        'bedrooms': [1, 2, 3],
        'ac': True, 'furnished': True, 'parking_available': True,
        'laundry_in_unit': False, 'laundry_in_building': True,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/the-foundry',
    },
    {
        'name': '905 W Springfield Ave',
        'address': '905 W Springfield Ave, Champaign, IL 61820',
        'bedrooms': [1, 2, 3],
        'ac': True, 'furnished': True, 'parking_available': True,
        'laundry_in_unit': False, 'laundry_in_building': True,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': True,
        'leasing_url': 'https://www.jsjmanagement.com/the-foundry',
    },
    # 512|Clark (512|Elevate)
    {
        'name': '512 W Clark St',
        'address': '512 W Clark St, Champaign, IL 61820',
        'bedrooms': [1],
        'ac': True, 'furnished': False, 'parking_available': True,
        'laundry_in_unit': True, 'laundry_in_building': False,
        'pets_allowed': True, 'utilities_included': False, 'dishwasher': False,
        'leasing_url': 'https://www.jsjmanagement.com/512-clark',
    },
]
def find_match(address, existing):
    parts = re.sub(r'[^a-z0-9\s]', '', address.lower()).split()
    if not parts or not parts[0].isdigit():
        return None
    num = parts[0]
    street_words = [p for p in parts[1:] if p not in
                    ('e','w','n','s','st','ave','dr','ct','blvd','champaign','urbana','il','61820','61801')]
    sword = street_words[0] if street_words else ''
    for row in existing:
        addr = re.sub(r'[^a-z0-9\s]', '', (row.get('address') or '').lower())
        if re.search(r'\b' + re.escape(num) + r'\b', addr) and (not sword or sword in addr):
            return row
    return None
def main():
    print(f"{'[DRY RUN] ' if DRY_RUN else ''}JSJ Property Management — {len(PROPERTIES)} properties\n")
    if not DRY_RUN:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        existing = supabase.table('apartments').select('id, name, address').execute().data or []
        print(f"Loaded {len(existing)} existing apartments from DB\n")
    else:
        supabase = None
        existing = []
    updated = inserted = 0
    for p in PROPERTIES:
        print(f"  {p['name']} | beds={p['bedrooms']} ac={p['ac']} furnished={p['furnished']} "
              f"parking={p['parking_available']} laundry_unit={p['laundry_in_unit']} | {p['leasing_url']}")
        payload = {
            'bedrooms':            p['bedrooms'],
            'ac':                  p['ac'],
            'furnished':           p['furnished'],
            'parking_available':   p['parking_available'],
            'laundry_in_unit':     p['laundry_in_unit'],
            'laundry_in_building': p['laundry_in_building'],
            'pets_allowed':        p['pets_allowed'],
            'utilities_included':  p['utilities_included'],
            'dishwasher':          p['dishwasher'],
            'leasing_url':         p['leasing_url'],
        }
        if DRY_RUN:
            continue
        match = find_match(p['address'], existing)
        if match:
            supabase.table('apartments').update(payload).eq('id', match['id']).execute()
            updated += 1
        else:
            payload['name'] = p['name']
            payload['address'] = p['address']
            supabase.table('apartments').insert(payload).execute()
            inserted += 1
    if DRY_RUN:
        print(f"\n[DRY RUN] Would process {len(PROPERTIES)} properties")
    else:
        print(f"\nDone: {updated} updated, {inserted} inserted")
if __name__ == '__main__':
    main()
