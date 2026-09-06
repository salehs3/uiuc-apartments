"""
green_street_scraper.py
Scrapes all Green Street Realty properties and upserts them into the apartments table.
Matches existing DB rows by address; inserts new rows for unknown properties.

Usage:
    python scraper/green_street_scraper.py --dry-run
    python scraper/green_street_scraper.py
"""

import asyncio
import os
import re
import sys
import time
from playwright.async_api import async_playwright
from supabase import create_client
from dotenv import load_dotenv

# ── env ──────────────────────────────────────────────────────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, '..', '.env.local'))

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = '--dry-run' in sys.argv

SEARCH_URL = (
    "https://www.greenstrealty.com/properties/search/"
    "CYB8Rrerul6YX7SZHcsZ_BGD-49cWnsAt3YrwmCkn6gG-AF0mC8MwmGTp2CZtGlai-Nv4ZFuTcyNM5MlPRGNI2two1R-R3injsk471TO0pfFDQ"
)

# Address street words to help detect the address line on detail pages
STREET_WORDS = {
    'ave', 'st', 'dr', 'ct', 'blvd', 'rd', 'ln', 'pl', 'way',
    'green', 'armory', 'chalmers', 'john', 'clark', 'elm', 'white',
    'euclid', 'stoughton', 'wright', 'randolph', 'second', 'third',
    'fourth', 'sixth', 'university', 'bash', 'columbia', 'neil',
}


# ── text parsing helpers ──────────────────────────────────────────────────────

def extract_prices(text: str) -> tuple[int | None, int | None]:
    """Return (rent_min, rent_max) per bed from floor plan price strings."""
    prices = re.findall(r'\$([\d,]+)/[Bb]ed', text)
    if not prices:
        return None, None
    ints = [int(p.replace(',', '')) for p in prices]
    return min(ints), max(ints)


def extract_bedrooms(text: str) -> list[int]:
    beds = set()
    if re.search(r'\bstudio\b', text, re.IGNORECASE):
        beds.add(0)
    for m in re.finditer(r'(\d)\s+[Bb]edroom', text):
        b = int(m.group(1))
        if 1 <= b <= 8:
            beds.add(b)
    return sorted(beds)


def detect_amenities(text: str) -> dict:
    t = text.lower()
    return {
        'laundry_in_unit': any(k in t for k in [
            'in-unit washer', 'in unit washer', 'washer/dryer in unit',
            'in-unit w/d', 'washer & dryer in unit', 'washer and dryer in unit',
        ]),
        'laundry_in_building': any(k in t for k in [
            'laundry room', 'laundry facility', 'shared laundry',
            'on-site laundry', 'laundry center', 'community laundry',
        ]),
        'parking_available': any(k in t for k in [
            'parking', 'garage',
        ]),
        'pets_allowed': any(k in t for k in [
            'pet friendly', 'pet-friendly', 'pets allowed',
            'cats allowed', 'dogs allowed',
        ]),
        'utilities_included': any(k in t for k in [
            'utilities included', 'all utilities included', 'all-inclusive',
            'all inclusive',
        ]),
        'ac': any(k in t for k in [
            'air conditioning', 'central air', ' a/c ', 'air conditioner',
        ]),
        'dishwasher': 'dishwasher' in t,
        'furnished': any(k in t for k in [
            'fully furnished', 'furnished apartment', 'furniture included',
        ]),
    }


def extract_utility_info(lines: list[str]) -> tuple[int | None, str | None]:
    fee = None
    includes = None
    for i, line in enumerate(lines):
        fee_match = re.search(r'utility fee[:\s]+\$?([\d,]+)\s*per\s*bed', line, re.IGNORECASE)
        if fee_match:
            fee = int(fee_match.group(1).replace(',', ''))
        inc_match = re.search(r'[Ii]ncludes?:\s*(.+)', line)
        if inc_match:
            # Only keep up to the next blank-ish boundary
            includes = inc_match.group(1).strip()[:120]
    return fee, includes


SKIP_ADDRESSES = {'510 s neil st', '510 s. neil st'}

def detect_address_line(lines: list[str]) -> str | None:
    for line in lines:
        if line.lower().strip('.').strip() in SKIP_ADDRESSES:
            continue
        words = line.lower().split()
        if words and re.match(r'^\d+', line) and any(w.strip('.,') in STREET_WORDS for w in words):
            return line
    return None


# ── Playwright scrapers ───────────────────────────────────────────────────────

async def get_property_links(page) -> list[str]:
    await page.goto(SEARCH_URL, wait_until='domcontentloaded', timeout=30_000)
    await asyncio.sleep(4)

    # Get all profile links from the page
    all_links = await page.evaluate("""
        () => [...new Set(
            Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(h => h.includes('/properties/profile/'))
        )]
    """)

    # Get the page text — it only shows the filtered results
    text = await page.inner_text('body')

    # Extract slugs that appear in the search results text by matching link slugs
    # to address words visible in the page text
    text_lower = text.lower()
    filtered = []
    for link in all_links:
        slug = link.split('/profile/')[-1]  # e.g. "105-e-armory-ave"
        # Check if the key parts of the slug appear in the page text
        parts = [p for p in slug.split('-') if len(p) > 1 and not p.isalpha() or len(p) > 3]
        street_num = slug.split('-')[0]
        if street_num.isdigit() and street_num in text_lower:
            # Also check a street word from the slug
            slug_words = [w for w in slug.split('-') if len(w) > 3 and w.isalpha()]
            if any(w in text_lower for w in slug_words):
                filtered.append(link)

    return filtered


async def scrape_detail(page, url: str) -> dict:
    await page.goto(url, wait_until='domcontentloaded', timeout=30_000)
    await asyncio.sleep(2)
    text = await page.inner_text('body')
    lines = [l.strip() for l in text.split('\n') if l.strip()]

    address_line = detect_address_line(lines)
    if not address_line:
        slug = url.split('/profile/')[-1]
        address_line = slug.replace('-', ' ').title()

    # City/state is usually right after the address line
    city_state = 'Champaign, IL 61820'
    try:
        idx = next(i for i, l in enumerate(lines) if l == address_line)
        if idx + 1 < len(lines) and 'IL' in lines[idx + 1]:
            city_state = lines[idx + 1]
    except StopIteration:
        pass

    full_address = f"{address_line}, {city_state}, USA"

    rent_min, rent_max = extract_prices(text)
    bedrooms = extract_bedrooms(text)
    amenities = detect_amenities(text)
    util_fee, util_includes = extract_utility_info(lines)

    # laundry_in_building should not override laundry_in_unit
    if amenities['laundry_in_unit']:
        amenities['laundry_in_building'] = False

    return {
        'name': address_line,
        'address': full_address,
        'leasing_url': url,
        'contact_url': 'https://www.greenstrealty.com/',
        'rent_min': rent_min,
        'rent_max': rent_max,
        'bedrooms': bedrooms,
        'utilities_fee_per_bed': util_fee,
        'utilities_what_included': util_includes,
        **amenities,
    }


# ── DB upsert ─────────────────────────────────────────────────────────────────

def fetch_existing_apartments() -> list[dict]:
    return supabase.table('apartments').select('id, name, address').execute().data or []


def find_match(prop: dict, existing: list[dict]) -> str | None:
    """
    Return the DB id of an existing apartment that matches this property.
    Matches on street number + a key word from the street name.
    """
    addr = prop['address'].lower()
    # Extract street number
    num_match = re.match(r'(\d+)', prop['name'])
    if not num_match:
        return None
    num = num_match.group(1)

    # Key street word (first non-directional word)
    words = [w.strip('.,').lower() for w in prop['name'].split() if w.lower() not in {'e', 'w', 'n', 's', 'e.', 'w.', 'n.', 's.'}]
    street_word = words[1] if len(words) > 1 else ''

    for row in existing:
        row_addr = (row.get('address') or '').lower()
        row_name = (row.get('name') or '').lower()
        if num in row_addr and street_word and street_word in row_addr:
            return row['id']
        if num in row_name and street_word and street_word in row_name:
            return row['id']
    return None


def upsert(prop: dict, existing_id: str | None) -> None:
    db_record = {
        'name':               prop['name'],
        'address':            prop['address'],
        'leasing_url':        prop['leasing_url'],
        'contact_url':        prop['contact_url'],
        'rent_min':           prop['rent_min'],
        'rent_max':           prop['rent_max'],
        'bedrooms':           prop['bedrooms'],
        'laundry_in_unit':    prop['laundry_in_unit'],
        'laundry_in_building':prop['laundry_in_building'],
        'parking_available':  prop['parking_available'],
        'pets_allowed':       prop['pets_allowed'],
        'utilities_included': prop['utilities_included'],
        'ac':                 prop['ac'],
        'dishwasher':         prop['dishwasher'],
        'furnished':          prop['furnished'],
    }

    util_note = ''
    if prop.get('utilities_fee_per_bed'):
        util_note = f"Utility fee: ${prop['utilities_fee_per_bed']}/bed"
        if prop.get('utilities_what_included'):
            util_note += f" — includes {prop['utilities_what_included']}"

    if DRY_RUN:
        action = 'UPDATE' if existing_id else 'INSERT'
        print(f"  [{action}] {prop['name']}")
        print(f"    rent: ${prop['rent_min']} – ${prop['rent_max']}/bed  |  beds: {prop['bedrooms']}")
        print(f"    laundry_in_unit={prop['laundry_in_unit']}  parking={prop['parking_available']}  pets={prop['pets_allowed']}")
        if util_note:
            print(f"    {util_note}")
        return

    if existing_id:
        supabase.table('apartments').update(db_record).eq('id', existing_id).execute()
        print(f"  [UPDATED]  {prop['name']}")
    else:
        supabase.table('apartments').insert(db_record).execute()
        print(f"  [INSERTED] {prop['name']}")


# ── main ─────────────────────────────────────────────────────────────────────

async def main():
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (writing to DB)'}\n")

    existing = fetch_existing_apartments()
    print(f"Loaded {len(existing)} existing apartments from DB\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print("Fetching property list from Green Street Realty...")
        links = await get_property_links(page)
        print(f"Found {len(links)} properties\n")

        updated = inserted = failed = 0

        for url in links:
            slug = url.split('/profile/')[-1]
            print(f"Scraping: {slug}")
            try:
                prop = await scrape_detail(page, url)
                existing_id = find_match(prop, existing)
                upsert(prop, existing_id)
                if existing_id:
                    updated += 1
                else:
                    inserted += 1
            except Exception as e:
                print(f"  [ERROR] {e}")
                failed += 1
            await asyncio.sleep(1)

        await browser.close()

    print(f"\n{'='*50}")
    print(f"Done: {updated} updated, {inserted} inserted, {failed} failed")
    if DRY_RUN:
        print("(DRY RUN — nothing written to DB)")


asyncio.run(main())
