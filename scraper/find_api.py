"""
find_api.py
Extracts property links from Green Street Realty search page,
then opens the first detail page to see amenity structure.

Run:
    python scraper/find_api.py
"""

import asyncio
from playwright.async_api import async_playwright

SEARCH_URL = (
    "https://www.greenstrealty.com/properties/search/"
    "CYBhsIns6AMcnYy0wu_M_DJbaXsCeYs9JT6u_qcXl5I-YOJNp8QaLLm89-ya0uAtPlcVfE2frJKrX-h0eGchnMIPQ"
)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        print("Loading search page...")
        await page.goto(SEARCH_URL, wait_until='domcontentloaded', timeout=30_000)
        await asyncio.sleep(4)

        # Extract all links from the page
        all_links = await page.evaluate("""
            () => Array.from(document.querySelectorAll('a[href]'))
                .map(a => a.href)
                .filter(h => h.includes('greenstrealty.com/properties/') && !h.includes('/search/'))
        """)

        print(f"\nFound {len(all_links)} property links:")
        for link in all_links[:5]:
            print(f"  {link}")

        if not all_links:
            # Fallback: show all links on page
            all_links2 = await page.evaluate("""
                () => Array.from(document.querySelectorAll('a[href]'))
                    .map(a => ({text: a.innerText.trim(), href: a.href}))
                    .filter(a => a.text.length > 0)
            """)
            print("\nAll links on page:")
            for l in all_links2[:30]:
                print(f"  [{l['text']}] -> {l['href']}")
            await browser.close()
            return

        # Visit the first property detail page
        detail_url = all_links[0]
        print(f"\nOpening detail page: {detail_url}")
        await page.goto(detail_url, wait_until='domcontentloaded', timeout=30_000)
        await asyncio.sleep(3)

        print("\n=== DETAIL PAGE TEXT (first 3000 chars) ===")
        text = await page.inner_text('body')
        print(text[:3000])

        await browser.close()


asyncio.run(main())
