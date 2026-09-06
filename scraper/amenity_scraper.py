"""
amenity_scraper.py
Scrapes amenity data from each apartment's own leasing_url stored in the DB.
NEVER searches or guesses — only fetches the exact URL tied to each apartment row.

Usage:
    python amenity_scraper.py           # live run (writes to DB)
    python amenity_scraper.py --dry-run # prints what would be written, no DB writes
"""

import os
import sys
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from supabase import create_client
from dotenv import load_dotenv

# ── env ──────────────────────────────────────────────────────────────────────
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, '..', '.env.local'))
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

DRY_RUN = '--dry-run' in sys.argv

HEADERS = {
    'User-Agent': (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/124.0.0.0 Safari/537.36'
    )
}

# ── amenity keyword patterns ──────────────────────────────────────────────────
# Each key matches a boolean column in the apartments table.
AMENITY_PATTERNS: dict[str, list[str]] = {
    'laundry_in_unit': [
        'in-unit washer', 'in unit washer', 'washer/dryer in unit',
        'w/d in unit', 'in-unit w/d', 'washer & dryer in unit',
        'washer and dryer in unit', 'in-unit laundry', 'in unit laundry',
        'full-size washer', 'full size washer',
    ],
    'laundry_in_building': [
        'laundry facility', 'laundry room', 'shared laundry',
        'on-site laundry', 'on site laundry', 'community laundry',
        'laundry center', 'coin laundry', 'laundry on site',
    ],
    'parking_available': [
        'parking available', 'parking included', 'garage parking',
        'covered parking', 'surface parking', 'parking lot',
        'assigned parking', 'off-street parking', 'parking space',
        'parking garage', 'private parking',
    ],
    'pets_allowed': [
        'pet friendly', 'pet-friendly', 'pets allowed', 'pets welcome',
        'cats allowed', 'dogs allowed', 'cats ok', 'dogs ok',
        'pet policy', 'we love pets',
    ],
    'utilities_included': [
        'utilities included', 'all utilities included', 'water included',
        'heat included', 'electricity included', 'utilities paid',
        'utilities are included',
    ],
    'furnished': [
        'fully furnished', 'furnished apartment', 'furniture included',
        'comes furnished',
    ],
    'dishwasher': [
        'dishwasher',
    ],
    'ac': [
        'air conditioning', 'central air', 'central a/c', 'central ac',
        'air conditioner', 'a/c included', 'cooling',
    ],
}


def detect_amenities(text: str) -> dict[str, bool]:
    """Return a dict of amenity booleans based on keyword matching."""
    lower = text.lower()
    return {
        amenity: any(kw in lower for kw in keywords)
        for amenity, keywords in AMENITY_PATTERNS.items()
    }


def scrape_url(apt_name: str, url: str) -> dict | None:
    """
    Fetch the given URL (no redirects to a different domain allowed).
    Returns amenity dict or None on failure.
    """
    expected_domain = urlparse(url).netloc.lower().lstrip('www.')

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, allow_redirects=True)
    except requests.RequestException as e:
        print(f"  [ERROR] {apt_name}: {e}")
        return None

    # Safety check: did we land on a different domain?
    final_domain = urlparse(resp.url).netloc.lower().lstrip('www.')
    if final_domain != expected_domain:
        print(
            f"  [SKIP] {apt_name}: redirect to wrong domain "
            f"({expected_domain} -> {final_domain})"
        )
        return None

    if resp.status_code != 200:
        print(f"  [SKIP] {apt_name}: HTTP {resp.status_code}")
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')
    text = soup.get_text(separator=' ')

    # Warn if the page returned almost no text (likely JS-rendered)
    if len(text.strip()) < 300:
        print(
            f"  [WARN] {apt_name}: very little text on page — "
            f"site may be JS-rendered, amenity data unreliable"
        )

    amenities = detect_amenities(text)
    found = [k for k, v in amenities.items() if v]
    print(f"  [OK]   {apt_name}: {found if found else '(none detected)'}")
    return amenities


def fetch_apartments() -> list[dict]:
    resp = supabase.table('apartments').select(
        'id, name, leasing_url, contact_url'
    ).execute()
    return resp.data or []


def apply_update(apt_id: str, apt_name: str, amenities: dict) -> None:
    if DRY_RUN:
        print(f"         -> [DRY RUN] would write: {amenities}")
        return
    supabase.table('apartments').update(amenities).eq('id', apt_id).execute()


def main() -> None:
    apartments = fetch_apartments()
    print(f"Loaded {len(apartments)} apartments from DB")
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}\n")

    success = skipped = no_url = 0

    for apt in apartments:
        apt_id   = apt['id']
        apt_name = apt['name']
        # Prefer leasing_url; fall back to contact_url
        url = apt.get('leasing_url') or apt.get('contact_url')

        if not url:
            print(f"  [NO URL] {apt_name}")
            no_url += 1
            continue

        print(f"Scraping: {apt_name}")
        print(f"  URL: {url}")

        amenities = scrape_url(apt_name, url)

        if amenities is not None:
            apply_update(apt_id, apt_name, amenities)
            success += 1
        else:
            skipped += 1

        time.sleep(1.0)   # polite delay between requests

    print(f"\n{'='*50}")
    print(f"Done: {success} updated, {skipped} skipped/failed, {no_url} had no URL")
    if DRY_RUN:
        print("(DRY RUN — nothing was written to the database)")


if __name__ == '__main__':
    main()
