import asyncio
import json
from playwright.async_api import async_playwright

START_URL = "https://www.myntra.com/dresses?f=Brand%3AHERE%26NOW%3A%3ACategories%3ADresses%3AGender%3Amen%20women%2Cwomen"

JS_EXTRACT = """
() => [...document.querySelectorAll('li.product-base')].map(li => {
  const t = s => li.querySelector(s)?.innerText.trim() || null;
  return {
    id: li.id,
    brand: t('.product-brand'),
    name: t('.product-product'),
    sizes: t('.product-sizes'),
    price: t('.product-discountedPrice'),
    mrp: t('.product-strike'),
    discount: t('.product-discountPercentage'),
    rating: li.querySelector('.product-ratingsContainer span')?.innerText || null,
    rating_count: t('.product-ratingsCount'),
    is_ad: !!li.querySelector('.product-waterMark'),
    url: li.querySelector('a')?.href || null,
    image: li.querySelector('img')?.src || null,
  };
})
"""

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        context = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            locale="en-IN",
        )
        page = await context.new_page()
        await page.goto(START_URL, wait_until="domcontentloaded")
        await page.wait_for_selector("li.product-base", timeout=15000)

        # DOM extraction
        dom_items = await page.evaluate(JS_EXTRACT)
        print(f"DOM Extracted {len(dom_items)} items")
        if dom_items:
            print("DOM Item 0:", json.dumps(dom_items[0], indent=2))

        # __myx extraction
        myx_data = await page.evaluate("() => window.__myx?.searchData?.results?.products || []")
        print(f"__myx Extracted {len(myx_data)} items")
        if myx_data:
            print("MYX Item 0 keys:", list(myx_data[0].keys()))
            print("MYX Item 0 sample:", json.dumps({k: myx_data[0][k] for k in list(myx_data[0].keys())[:15]}, indent=2))

        await browser.close()

if __name__ == "__main__":
    asyncio.run(test())
