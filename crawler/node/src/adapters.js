import { load } from 'cheerio';

export const number = v => {
  if (v == null || v === '') return null;
  const m = String(v).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const text = ($, selectors) => { for (const s of selectors.split('|')) { const v = $(s).first().text().replace(/\s+/g, ' ').trim(); if (v) return v; } return ''; };
const attr = ($, s, a) => $(s).first().attr(a) || '';
const image = $ => attr($, 'img', 'src') || attr($, 'img', 'data-src') || attr($, 'img', 'srcset').split(',')[0].split(' ')[0] || attr($, 'source', 'srcset').split(',')[0].split(' ')[0];
const absolute = (u, base) => { try { return u ? new URL(u, base).href : ''; } catch { return ''; } };
export function embedded(html, variable) {
  const start = html.indexOf(variable);
  if (start < 0) return {};
  const brace = html.indexOf('{', start);
  let depth = 0, quoted = false, escaped = false;
  for (let i = brace; i >= 0 && i < html.length; i++) {
    const c = html[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { try { return JSON.parse(html.slice(brace, i + 1)); } catch { return {}; } }
  }
  return {};
}
function normalize(store, row, meta = {}) {
  const title = row.title || row.name || '';
  const price = number(row.price), mrp = number(row.mrp) ?? price;
  const pct = mrp && price != null && mrp > price ? Math.round((mrp - price) / mrp * 100) : 0;
  return { ...row, title, name: row.name || title, currency: 'INR', price, mrp,
    discount: row.discount || (pct ? `${pct}% OFF` : ''), discount_percentage: pct,
    rating: number(row.rating), rating_count: number(row.rating_count) ?? 0,
    reviews_count: number(row.rating_count) ?? 0, marketplace: store,
    marketplace_name: store[0].toUpperCase() + store.slice(1), ...meta };
}

export function listing(store, html, url, meta = {}) {
  const $ = load(html), rows = [];
  if (store === 'myntra') {
    // Client-side Next navigation can leave the initial __myx script unchanged.
    const products = meta.page > 1 ? [] : embedded(html, 'window.__myx').searchData?.results?.products || [];
    for (const p of products) rows.push({ id: String(p.productId || p.id || ''), brand: p.brand,
      name: p.product || p.productName, price: p.price, mrp: p.mrp, rating: p.rating,
      rating_count: p.ratingCount, discount: p.discountDisplayLabel, sizes: p.sizes,
      image: p.searchImage || p.images?.[0]?.src, url: absolute(p.landingPageUrl, url), is_ad: p.isPLA ? 'Yes' : 'No' });
    $('li.product-base').each((_, el) => {
      const c = load($.html(el));
      const id = (c('li').attr('id') || '').replace('product-', '');
      const previous = rows.find(r => r.id === id) || {};
      rows.push({ ...previous, id, brand: text(c, '.product-brand') || previous.brand,
        name: text(c, '.product-product') || previous.name, price: text(c, '.product-discountedPrice|.product-price') || previous.price, mrp: text(c, '.product-strike') || previous.mrp,
        rating: text(c, '.product-ratingsContainer span') || previous.rating, rating_count: text(c, '.product-ratingsCount') || previous.rating_count,
        image: image(c) || previous.image, url: absolute(attr(c, 'a', 'href'), url) || previous.url });
    });
  } else {
    const selectors = { amazon: '[data-component-type="s-search-result"][data-asin]', flipkart: 'div[data-id]', nykaa: '.productWrapper, div[class*="productWrapper"]' };
    $(selectors[store]).each((_, el) => {
      const c = load($.html(el));
      if (store === 'amazon') {
        const asin = $(el).attr('data-asin');
        rows.push({ id: asin, asin, title: text(c, 'h2 span|h2'), brand: text(c, '.a-row.a-size-base-plus .a-size-base-plus'),
          price: text(c, '.a-price:not(.a-text-price) .a-offscreen'), mrp: text(c, '.a-text-price .a-offscreen'),
          rating: text(c, '.a-icon-alt'), rating_count: text(c, 'a[href*="customerReviews"] span|.a-size-base.s-underline-text'),
          image: image(c), url: `https://www.amazon.in/dp/${asin}` });
      } else if (store === 'flipkart') {
        const pid = $(el).attr('data-id');
        rows.push({ id: pid, pid, title: attr(c, 'a[title]', 'title') || attr(c, 'img', 'alt'),
          price: text(c, '.hZ3P6w|.Nx9bqj'), mrp: text(c, '.kRYCnD|.yRaY8j'),
          rating: text(c, '.MKiFS6|.CjyrHS'), rating_count: text(c, '.PvbNMB'),
          image: image(c), url: absolute(attr(c, 'a[href*="/p/"], a[href]', 'href'), url) });
      } else {
        const href = attr(c, 'a[href*="/p/"]', 'href');
        const id = href.match(/\/p\/(\d+)/)?.[1];
        rows.push({ id: id ? `NYK-${id}` : '', product_id: id, sku_id: href.match(/skuId=(\d+)/)?.[1] || '',
          title: attr(c, 'img[alt]', 'alt') || text(c, 'h2'), price: text(c, '.css-111z9ua'), mrp: text(c, '.css-17x46n5'),
          image: image(c), rating: attr(c, '[aria-label*="star rating"]', 'aria-label'),
          rating_count: text(c, '.css-1tbknh0'), url: absolute(href, url) });
      }
    });
  }
  return [...new Map(rows.filter(r => r.id && (r.name || r.title) && r.url).map(r => [r.id, normalize(store, r, meta)])).values()];
}

const pdpSelectors = {
  amazon: { title: '#productTitle|h1', price: '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen|.a-price .a-offscreen', mrp: '.basisPrice .a-offscreen|.a-text-price .a-offscreen', brand: '#bylineInfo', rating: '#acrPopover .a-icon-alt', count: '#acrCustomerReviewText', images: '#altImages img, #landingImage', specs: '#productDetails_techSpec_section_1 tr, #productOverview_feature_div tr, #productDetails_detailBullets_sections1 tr', reviews: '[data-hook="review"]' },
  flipkart: { title: '.VU-ZEz|.B_NuCI|h1', price: '.Nx9bqj.CxhGGd|.Nx9bqj|.hZ3P6w', mrp: '.yRaY8j|.kRYCnD', brand: 'a.TSD49J', rating: '.XQDdHH|.MKiFS6', count: '.Wphh3N|.PvbNMB', images: 'img.DByuf4, img._396cs4', specs: 'tr.WJdYP6, tr._1s_Smc', reviews: '.col.EPCmJX, .col._2wzgFH' },
  myntra: { title: '.pdp-name', price: '.pdp-price strong|.pdp-price|.PriceInfo-price', mrp: '.pdp-mrp s|.pdp-mrp', brand: '.pdp-title', rating: '.index-overallRating div', count: '.index-ratingsCount', images: '.image-grid-container img', specs: '.index-row', reviews: '.user-review-userReviewWrapper' },
  nykaa: { title: 'h1', price: '.css-1jczs19|.css-111z9ua|.css-1jt1hbu|[data-test-id="product-price"]', mrp: '.css-u05rr|.css-17x46n5|.css-1mhn5d|.css-1k2x2h8', brand: 'a[href*="/brands/"]', rating: '.css-m6n3ou|.css-1297gf2', count: '.css-1hvvm95', images: '.slide-view-container img, .productSelectedImage img, .css-smh1rg img, .css-irizhh img, .imageRailImageItem img', specs: 'tr', reviews: '.css-z7l7ua, [class*="review-content"], [data-test-id="review"]' }
};
export function pdp(store, html, url, source = {}) {
  const $ = load(html), s = pdpSelectors[store];
  const schemas = [];
  const walk = v => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) return v.forEach(walk); if ([v['@type']].flat().includes('Product')) schemas.push(v); if (v['@graph']) walk(v['@graph']); };
  $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text())); } catch {} });
  const schema = schemas[0] || {}, offer = [schema.offers].flat().find(Boolean) || {};
  const myx = store === 'myntra' ? embedded(html, 'window.__myx').pdpData || {} : {};
  const nykaa = store === 'nykaa' ? embedded(html, 'window.__PRELOADED_STATE__').productPage?.product || {} : {};
  const title = text($, s.title) || schema.name || myx.name || nykaa.title || nykaa.name;
  if (!title) throw Error(`${store}: product title not found`);
  const specifications = {};
  $(s.specs).each((_, el) => {
    const cells = $(el).find('th,td,.index-rowKey,.index-rowValue');
    if (cells.length >= 2) specifications[$(cells[0]).text().trim()] = $(cells[cells.length - 1]).text().trim();
  });
  $('.index-sizeFitDesc').each((_, el) => { const t = $(el).text(); if (t) specifications['Size & Fit'] = t.trim(); });
  for (const [k, v] of Object.entries(myx.articleAttributes || {})) if (v != null && !specifications[k]) specifications[k] = load(String(v)).text().trim();
  if (store === 'flipkart') $('.grid-formation.grid-column-2, ._21lJ10').each((_, el) => {
    const cells = $(el).children();
    if (cells.length >= 2) specifications[$(cells[0]).text().trim()] = $(cells[cells.length - 1]).text().trim();
  });
  const images = new Set([schema.image].flat().filter(v => typeof v === 'string'));
  for (const album of myx.media?.albums || []) for (const item of album.images || []) {
    const u = item.src || item.imageURL;
    if (u) images.add(u.startsWith('http') ? u : `https://assets.myntassets.com/${u}`);
  }
  for (const item of [...(nykaa.media || []), ...(nykaa.carousel || [])]) if (item.url && item.mediaType !== 'video') images.add(item.url);
  $(s.images).each((_, el) => { const src = $(el).attr('data-old-hires') || $(el).attr('src'); if (src) images.add(absolute(src, url)); });
  $('.image-grid-image').each((_, el) => { const src = ($(el).attr('style') || '').match(/url\(['"]?(.*?)['"]?\)/)?.[1]; if (src) images.add(src); });
  const reviews = [];
  $(s.reviews).each((_, el) => { const c = load($.html(el)); const body = text(c, '[data-hook="review-body"]|.user-review-reviewTextWrapper|p.css-1n0nrdk|p'); if (body) reviews.push({ text: body, rating: number(text(c, '[data-hook="review-star-rating"]|.user-review-starRating|.css-1132h24')), author: text(c, '.a-profile-name|.user-review-left|.css-amd8cf'), shade: text(c, '.css-1aqqo0s'), date: text(c, '.css-3zk3jq') }); });
  for (const review of [...(myx.ratings?.reviewInfo?.topReviews || []), ...(myx.ratings?.reviewInfo?.topImageReviews || [])]) {
    if (!reviews.some(r => r.review_id === review.reviewId)) reviews.push({ review_id: review.reviewId, text: review.reviewText, rating: review.userRating, author: review.userName, images: review.reviewImages || [], date: review.timestamp });
  }
  const attrs = {};
  for (const [key, value] of Object.entries(specifications)) {
    const k = key.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
    if (['shade', 'colour', 'color', 'finish', 'formulation', 'coverage', 'skin_type', 'spf', 'quantity', 'net_quantity', 'skin_tone', 'country_of_origin', 'manufacturer', 'ingredients'].includes(k)) attrs[k === 'colour' || k === 'color' ? 'shade' : k] = value;
  }
  const aliases = { finish_type: 'finish', item_form: 'formulation', form: 'formulation', sun_protection_factor: 'spf', net_quantity: 'quantity', colour: 'shade', color: 'shade' };
  for (const [k, val] of Object.entries(specifications)) { const alias = aliases[k.toLowerCase().replace(/[^a-z]+/g, '_')]; if (alias && !attrs[alias]) attrs[alias] = val; }
  attrs.shade ||= nykaa.variantName || text($, '#variation_color_name .selection|#inline-twister-row-color_name .inline-twister-dim-title-value');
  const cosmeticText = `${title} ${Object.values(specifications).join(' ')} ${text($, '#content-details|.pdp-product-description-content')}`;
  for (const [key, pattern] of Object.entries({ finish: /\b(matte|satin|glossy|dewy|shimmer|metallic|radiant|velvet)\b/i,
    formulation: /\b(liquid|cream|powder|gel|crayon|pencil|stick|mousse)\b/i,
    coverage: /\b(full coverage|medium coverage|sheer coverage|buildable)\b/i,
    skin_type: /\b(all skin types|oily skin|dry skin|combination skin|sensitive skin)\b/i,
    spf: /\bSPF\s*\d+\+?/i, quantity: /\b\d+(?:\.\d+)?\s*(?:ml|g|gm|kg|litres?)\b/i })) {
    if (!attrs[key]) { const value = cosmeticText.match(pattern)?.[0]; if (value) attrs[key] = value; }
  }
  const price = number(text($, s.price)) ?? number(offer.price) ?? number(myx.price?.discounted) ?? number(nykaa.offerPrice);
  // Never mark a blocked or structurally incomplete product page as enriched.
  if (price == null || price <= 0) throw Error(`${store}: valid PDP price missing`);
  const row = normalize(store, { ...source, title, name: title,
    brand: text($, s.brand).replace(/^Visit the (.*?) Store$/i, '$1').replace(/^Brand:\s*/i, '') || schema.brand?.name || myx.brand?.name || nykaa.brandName || source.brand,
    price, mrp: number(text($, s.mrp)) ?? number(myx.price?.mrp) ?? number(nykaa.mrp) ?? source.mrp,
    rating: text($, s.rating) || schema.aggregateRating?.ratingValue || nykaa.rating || myx.ratings?.averageRating, rating_count: text($, s.count) || schema.aggregateRating?.ratingCount || nykaa.ratingCount || myx.ratings?.totalCount,
    url, images: [...images], image: [...images][0] || source.image, specifications, ...attrs, reviews,
    description: text($, '#productDescription|#content-details|.pdp-product-description-content|.css-13udqpx'),
    variants: nykaa.variants || myx.sizes || [],
    in_stock: nykaa.inStock != null ? Boolean(nykaa.inStock) : offer.availability ? !String(offer.availability).includes('OutOfStock') : !/sold out|currently unavailable/i.test(text($, '#availability|.pdp-add-to-bag')) });
  delete row._id;
  return row;
}

export function nextUrl(store, html, current) {
  const $ = load(html);
  const selector = { amazon: 'a.s-pagination-next:not(.s-pagination-disabled)', flipkart: 'a._9QVEpD, a._1LKTO3', myntra: '.pagination-next:not(.pagination-disabled) a', nykaa: 'a[aria-label="Next"], a[rel="next"]' }[store];
  const links = $(selector).toArray();
  const el = links.find(e => /next/i.test($(e).text()) || store !== 'flipkart');
  return el ? absolute($(el).attr('href'), current) : '';
}
