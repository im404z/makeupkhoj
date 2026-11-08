import fs from 'node:fs';
import path from 'node:path';
import { root } from './config.js';

// Execute the existing JavaScript DOM extractor directly in Node/Playwright.
// This preserves its rich Amazon output without invoking any Python code.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const extract = new AsyncFunction('page', 'targetAsin', 'baseUrl',
  fs.readFileSync(path.join(root, 'crawler/amazon/amazon-product-extractor-logic.js'), 'utf8') + '\nreturn rawData;');

export async function amazonPdp(page, source) {
  const asin = source.asin || source.id;
  const raw = await extract(page, asin, 'https://www.amazon.in');
  
  if (!raw || !raw.title) {
    const isDogOr404 = await page.evaluate(() => {
      const text = document.title + ' ' + (document.body?.innerText || '').slice(0, 1000);
      return /sorry.*not a functioning page|looking for something\?|dogs of amazon|page not found|we couldn't find that page/i.test(text);
    }).catch(() => false);

    if (isDogOr404) {
      return {
        ...source,
        id: asin,
        asin,
        price: 0,
        mrp: Number(source.mrp) || 0,
        in_stock: false,
        pdp_scraped: true,
        currency: 'INR',
        marketplace: 'amazon',
        marketplace_name: 'Amazon',
        url: `https://www.amazon.in/dp/${asin}`,
        source_url: `https://www.amazon.in/dp/${asin}`
      };
    }
    throw Error('Amazon PDP title missing');
  }

  const price = Number(raw.currentPrice) || 0;
  const mrp = Number(raw.mrp) || price;
  const inStock = raw.inStock !== false && price > 0;
  return {
    ...source,
    ...raw,
    id: asin,
    asin,
    price,
    mrp,
    title: raw.title || source.title,
    brand: raw.brandName || source.brand,
    rating: raw.averageRating,
    rating_count: raw.ratingsCount,
    images: raw.highResImages || [],
    image: raw.mainImage || source.image,
    specifications: raw.specsTable,
    skin_type: raw.skinType,
    quantity: raw.netQuantity,
    in_stock: inStock,
    pdp_scraped: true,
    currency: 'INR',
    marketplace: 'amazon',
    marketplace_name: 'Amazon',
    url: `https://www.amazon.in/dp/${asin}`,
    source_url: `https://www.amazon.in/dp/${asin}`
  };
}
