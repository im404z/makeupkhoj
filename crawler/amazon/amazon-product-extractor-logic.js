/**
 * Amazon Product Detail Page (PDP) In-Browser DOM Extraction Engine
 * Extracts complete product metadata, specifications, and brand attributes.
 */
const rawData = await page.evaluate(({ targetAsin, baseUrl }) => {
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();

  // 1. Title
  const titleEl = document.querySelector('#productTitle, #title, h1.a-size-large');
  const title = titleEl ? clean(titleEl.innerText) : '';

  // 2. Brand Detection
  let brandName = '';
  let brandUrl = '';

  // 2a. From Byline / Store link ("Visit the Bath & Body Works Store" / "Brand: Denver")
  const byline = document.querySelector('#bylineInfo, a#bylineInfo_feature_div, #bylineInfo_feature_div a');
  if (byline) {
    const raw = clean(byline.innerText);
    brandUrl = byline.getAttribute('href') || '';
    if (/visit\s+the\s+(.*?)\s+store/i.test(raw)) {
      brandName = raw.match(/visit\s+the\s+(.*?)\s+store/i)[1].trim();
    } else if (/brand:\s*(.*)/i.test(raw)) {
      brandName = raw.match(/brand:\s*(.*)/i)[1].trim();
    } else if (raw && !/brand/i.test(raw)) {
      brandName = raw.trim();
    }
  }

  // 2b. Specs table / Overview table
  const specsTable = {};
  const overviewRows = document.querySelectorAll(
    '#productOverview_feature_div tr, #poExpander tr, table.a-normal tr, #productDetails_techSpec_section_1 tr'
  );
  overviewRows.forEach(row => {
    const th = row.querySelector('td:first-child, th');
    const td = row.querySelector('td:last-child');
    if (th && td) {
      const k = clean(th.innerText);
      const v = clean(td.innerText);
      if (k && v) specsTable[k] = v;
    }
  });

  if (!brandName && specsTable['Brand']) {
    brandName = specsTable['Brand'];
  }
  if (!brandName && specsTable['Manufacturer']) {
    brandName = specsTable['Manufacturer'];
  }

  // 2c. Check JSON-LD schema fallback
  if (!brandName) {
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of ldScripts) {
      try {
        const data = JSON.parse(s.innerText);
        if (data && data.brand && data.brand.name) {
          brandName = data.brand.name;
          break;
        }
      } catch (e) {}
    }
  }

  // 3. Pricing & MRP
  let currentPrice = null;
  let mrp = null;

  const priceWhole = document.querySelector('.a-price .a-price-whole');
  const priceOffscreen = document.querySelector('.a-price .a-offscreen, #corePriceDisplay_desktop_feature_div .a-price .a-offscreen');
  if (priceOffscreen) {
    const match = priceOffscreen.innerText.replace(/[^\d.]/g, '');
    if (match) currentPrice = parseFloat(match);
  } else if (priceWhole) {
    const match = priceWhole.innerText.replace(/[^\d.]/g, '');
    if (match) currentPrice = parseFloat(match);
  }

  const basisPriceEl = document.querySelector('.basisPrice .a-offscreen, .a-text-price .a-offscreen, #corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen');
  if (basisPriceEl) {
    const match = basisPriceEl.innerText.replace(/[^\d.]/g, '');
    if (match) mrp = parseFloat(match);
  }
  if (!mrp && currentPrice) mrp = currentPrice;
  if (!currentPrice && mrp) currentPrice = mrp;

  // 4. Rating & Reviews Count
  let averageRating = null;
  const ratingEl = document.querySelector('#acrPopover, span[data-hook="rating-out-of-text"], i.a-icon-star span');
  if (ratingEl) {
    const m = (ratingEl.innerText || ratingEl.getAttribute('aria-label') || '').match(/(\d+(?:\.\d+)?)/);
    if (m) averageRating = parseFloat(m[1]);
  }

  let ratingsCount = 0;
  const countEl = document.querySelector('#acrCustomerReviewText, #acrCustomerReviewLink span');
  if (countEl) {
    const m = countEl.innerText.replace(/[^\d]/g, '');
    if (m) ratingsCount = parseInt(m, 10);
  }

  // 5. Images
  let mainImage = '';
  const mainImgEl = document.querySelector('#landingImage, #imgBlkFront, #main-image');
  if (mainImgEl) {
    mainImage = mainImgEl.getAttribute('data-old-hires') || mainImgEl.getAttribute('src') || '';
  }

  const galleryThumbnails = [];
  document.querySelectorAll('#altImages img, .thumb-image img').forEach(img => {
    let src = img.getAttribute('src') || '';
    if (src && !src.includes('pixel') && !src.includes('sprite')) {
      // Convert thumbnail url to high-res url
      src = src.replace(/\._[A-Z0-9_,]+_\./i, '.');
      if (!galleryThumbnails.includes(src)) galleryThumbnails.push(src);
    }
  });

  // 6. Bullet Points & Description
  const bulletPoints = [];
  document.querySelectorAll('#feature-bullets li span.a-list-item').forEach(b => {
    const text = clean(b.innerText);
    if (text && !text.includes('Make sure this fits')) bulletPoints.push(text);
  });

  const descEl = document.querySelector('#productDescription p, #productDescription, #productDescription_feature_div');
  const description = descEl ? clean(descEl.innerText) : '';

  // 7. Stock & Seller
  let inStock = true;
  const availEl = document.querySelector('#availability');
  if (availEl) {
    const availText = clean(availEl.innerText).toLowerCase();
    if (availText.includes('currently unavailable') || availText.includes('out of stock')) {
      inStock = false;
    }
  }

  let sellerName = 'Amazon India';
  const sellerEl = document.querySelector('#sellerProfileTriggerId, #merchant-info a, #tabular-buybox .tabular-buybox-text');
  if (sellerEl) {
    sellerName = clean(sellerEl.innerText) || 'Amazon India';
  }

  // 8. Bought in past month
  let boughtInPastMonth = '';
  const boughtEl = document.querySelector('#social-proofing-faceout-title-tk_bought, span.social-proofing-faceout-title');
  if (boughtEl) {
    boughtInPastMonth = clean(boughtEl.innerText);
  }

  // 9. Makeup Specific Attributes (Shade, Finish, Formulation, Coverage, Skin Type, SPF)
  const shadeEl = document.querySelector('#inline-twister-row-color_name .inline-twister-dim-title-value, #variation_color_name .selection, #variation_style_name .selection');
  const shade = shadeEl ? clean(shadeEl.innerText) : (specsTable['Colour'] || specsTable['Color'] || specsTable['Shade'] || '');
  const finish = specsTable['Finish Type'] || specsTable['Finish'] || '';
  const formulation = specsTable['Item Form'] || specsTable['Form'] || '';
  const coverage = specsTable['Coverage'] || '';
  const skinType = specsTable['Skin Type'] || '';
  const spf = specsTable['Sun Protection Factor'] || specsTable['Sun Protection'] || specsTable['SPF'] || '';
  const netQuantity = specsTable['Net Quantity'] || specsTable['Item Volume'] || specsTable['Item Weight'] || '';

  return {
    asin: targetAsin,
    title,
    brandName,
    brandUrl,
    currentPrice,
    mrp,
    averageRating,
    ratingsCount,
    mainImage,
    highResImages: galleryThumbnails.length > 0 ? galleryThumbnails : [mainImage].filter(Boolean),
    specsTable,
    bulletPoints,
    description,
    inStock,
    sellerName,
    boughtInPastMonth,
    shade,
    finish,
    formulation,
    coverage,
    skinType,
    spf,
    netQuantity
  };
}, { targetAsin, baseUrl });
