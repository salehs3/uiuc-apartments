"""
amenity_scraper.py
Scrapes amenity data from each apartment's own leasing_url stored in the DB.
NEVER searches or guesses — only fetches the exact URL tied to each apartment row.

Strategy:
  1. Try requests (fast, silent).
  2. On 403, DNS error, or JS-rendered page (<300 chars), fall back to Playwright.
  3. If redirect goes to a known management-company domain, allow it and scrape there.

Usage:
    python amenity_scraper.py           # live run (writes to DB)
    python amenity_scraper.py --dry-run # prints what would be written, no DB writes
"""

import asyncio
import os
import sys
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from supabase import create_client
from dotenv import load_dotenv
from playwright.async_api import async_playwright

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

# Redirects to these management-company domains are trusted and scraped normally.
ALLOWED_REDIRECT_DOMAINS = {
    'ugroupcu.com',        # 75 Armory, 901 Western → University Group
    'roysebrinkmeyer.com', # 520 Neil → Royse + Brinkmeyer
    'greenstrealty.com',   # The Academy → Green Street Realty
    'fairlawncu.com',      # Westbury Townhomes → Fair Lawn
}

# ── amenity keyword patterns ──────────────────────────────────────────────────
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
    lower = text.lower()
    return {
        amenity: any(kw in lower for kw in keywords)
        for amenity, keywords in AMENITY_PATTERNS.items()
    }


# ── Playwright fallback ───────────────────────────────────────────────────────

async def _pw_fetch(url: str) -> str | None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent=HEADERS['User-Agent']
        )
        try:
            await page.goto(url, timeout=20_000, wait_until='domcontentloaded')
            await page.wait_for_timeout(2_500)   # let JS render
            return await page.inner_text('body')
        except Exception as e:
            print(f"    [PW ERROR] {e}")
            return None
        finally:
            await browser.close()


def scrape_with_playwright(apt_name: str, url: str) -> dict | None:
    print(f"  [PLAYWRIGHT] retrying {apt_name} ...")
    text = asyncio.run(_pw_fetch(url))
    if not text or len(text.strip()) < 100:
        print(f"  [PW FAIL]   {apt_name}: still no content")
        return None
    amenities = detect_amenities(text)
    found = [k for k, v in amenities.items() if v]
    print(f"  [PW OK]     {apt_name}: {found if found else '(none detected)'}")
    return amenities


# ── requests-based scrape ────────────────────────────────────────────────────

def scrape_url(apt_name: str, url: str) -> dict | None:
    """
    Try requests first. Falls back to Playwright on 403, DNS error,
    or a JS-rendered page (< 300 chars of body text).
    Redirects to ALLOWED_REDIRECT_DOMAINS are accepted.
    """
    expected_domain = urlparse(url).netloc.lower().lstrip('www.')

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, allow_redirects=True)
    except requests.RequestException as e:
        print(f"  [ERROR] {apt_name}: {e}")
        return scrape_with_playwright(apt_name, url)

    final_domain = urlparse(resp.url).netloc.lower().lstrip('www.')

    # Redirect to a completely different domain?
    if final_domain != expected_domain:
        if final_domain in ALLOWED_REDIRECT_DOMAINS:
            print(f"  [REDIRECT OK] {apt_name}: {expected_domain} → {final_domain}")
        else:
            print(f"  [SKIP] {apt_name}: redirect to unknown domain "
                  f"({expected_domain} → {final_domain})")
            return None

    if resp.status_code == 403:
        print(f"  [403] {apt_name}: blocked — trying Playwright")
        return scrape_with_playwright(apt_name, url)

    if resp.status_code != 200:
        print(f"  [SKIP] {apt_name}: HTTP {resp.status_code}")
        return None

    soup = BeautifulSoup(resp.text, 'html.parser')
    text = soup.get_text(separator=' ')

    if len(text.strip()) < 300:
        print(f"  [JS-render] {apt_name}: very little text — trying Playwright")
        return scrape_with_playwright(apt_name, url)

    amenities = detect_amenities(text)
    found = [k for k, v in amenities.items() if v]
    print(f"  [OK]   {apt_name}: {found if found else '(none detected)'}")
    return amenities


# ── Supabase helpers ─────────────────────────────────────────────────────────

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


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    apartments = fetch_apartments()
    print(f"Loaded {len(apartments)} apartments from DB")
    print(f"Mode: {'DRY RUN (no writes)' if DRY_RUN else 'LIVE (will write to DB)'}\n")

    success = skipped = no_url = 0

    for apt in apartments:
        apt_id   = apt['id']
        apt_name = apt['name']
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

        time.sleep(1.0)

    print(f"\n{'='*50}")
    print(f"Done: {success} updated, {skipped} skipped/failed, {no_url} had no URL")
    if DRY_RUN:
        print("(DRY RUN — nothing was written to the database)")


if __name__ == '__main__':
    main()
