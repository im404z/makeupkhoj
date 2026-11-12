import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Standard slugify matching format.ts with NFKD accent normalization
function slugify(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// Format price with Indian numbering
function formatInr(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  return '₹' + Math.round(num).toLocaleString('en-IN');
}

// Load .env if present
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const f of envFiles) {
    const full = path.join(rootDir, f);
    if (fs.existsSync(full)) {
      const content = fs.readFileSync(full, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

async function generateBrandStats() {
  loadEnv();

  const uri = process.env.MONGODB_URI || 'mongodb://admin:8ko92AWggrY2%21@38.45.64.201:27017/?authSource=admin';
  const dbName = process.env.MASTER_DB || 'makeupkhoj';
  const outputPath = path.join(rootDir, 'src', 'data', 'brand-stats.json');

  console.log(`[Brand Stats Generator] Starting 100% dynamic aggregation from MongoDB across all collections...`);

  let client;
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db(dbName);
    const collections = ['nykaa_makeupkhoj', 'amazon_makeupkhoj', 'flipkart_makeupkhoj', 'myntra_makeupkhoj'];

    console.time('Brand Stats Generation');

    // Dynamic brand map keyed by canonical slug
    const brandMap = new Map();

    for (const collName of collections) {
      const coll = db.collection(collName);
      const pipeline = [
        {
          $match: {
            brand: { $exists: true, $nin: ['', null, 'Unknown'] }
          }
        },
        {
          $project: {
            brand: '$brand',
            price: {
              $convert: {
                input: { $ifNull: ['$price', '$currentPrice'] },
                to: 'double',
                onError: null,
                onNull: null
              }
            },
            rating: {
              $convert: {
                input: { $ifNull: ['$rating', '$averageRating'] },
                to: 'double',
                onError: null,
                onNull: null
              }
            },
            ratingCount: {
              $convert: {
                input: { $ifNull: ['$rating_count', { $ifNull: ['$ratingsCount', '$reviews_count'] }] },
                to: 'int',
                onError: null,
                onNull: null
              }
            }
          }
        },
        {
          $group: {
            _id: '$brand',
            count: { $sum: 1 },
            minPrice: {
              $min: {
                $cond: [{ $and: [{ $gt: ['$price', 0] }, { $lt: ['$price', 500000] }] }, '$price', null]
              }
            },
            maxPrice: {
              $max: {
                $cond: [{ $and: [{ $gt: ['$price', 0] }, { $lt: ['$price', 500000] }] }, '$price', null]
              }
            },
            avgRating: {
              $avg: {
                $cond: [{ $and: [{ $gt: ['$rating', 0] }, { $lte: ['$rating', 5] }] }, '$rating', null]
              }
            },
            totalRatingCount: {
              $sum: {
                $cond: [{ $gt: ['$ratingCount', 0] }, '$ratingCount', 0]
              }
            },
            ratedCount: {
              $sum: {
                $cond: [{ $and: [{ $gt: ['$rating', 0] }, { $lte: ['$rating', 5] }] }, 1, 0]
              }
            }
          }
        }
      ];

      const rows = await coll.aggregate(pipeline, { allowDiskUse: true }).toArray();

      for (const row of rows) {
        const rawName = String(row._id).trim();
        if (!rawName || rawName === 'Unknown') continue;

        const slug = slugify(rawName);
        if (!slug) continue;

        let entry = brandMap.get(slug);
        if (!entry) {
          entry = {
            slug,
            nameCounts: new Map([[rawName, row.count]]),
            aliases: new Set([rawName]),
            productCount: 0,
            minPrice: null,
            maxPrice: null,
            sumRatingProduct: 0,
            ratedCount: 0,
            totalRatingCount: 0
          };
          brandMap.set(slug, entry);
        } else {
          entry.aliases.add(rawName);
          entry.nameCounts.set(rawName, (entry.nameCounts.get(rawName) || 0) + row.count);
        }

        entry.productCount += row.count;
        if (row.minPrice !== null && row.minPrice > 0 && (entry.minPrice === null || row.minPrice < entry.minPrice)) {
          entry.minPrice = row.minPrice;
        }
        if (row.maxPrice !== null && row.maxPrice > 0 && (entry.maxPrice === null || row.maxPrice > entry.maxPrice)) {
          entry.maxPrice = row.maxPrice;
        }
        if (row.avgRating && row.ratedCount) {
          entry.sumRatingProduct += row.avgRating * row.ratedCount;
          entry.ratedCount += row.ratedCount;
        }
        if (row.totalRatingCount) {
          entry.totalRatingCount += row.totalRatingCount;
        }
      }
    }

    console.timeEnd('Brand Stats Generation');

    // Build final structured dictionary
    const finalStatsBySlug = {};

    for (const [slug, item] of brandMap.entries()) {
      // Choose best display name by highest product frequency
      let bestName = slug;
      let maxNameCount = -1;
      for (const [name, cnt] of item.nameCounts.entries()) {
        if (cnt > maxNameCount) {
          maxNameCount = cnt;
          bestName = name;
        }
      }

      const avg = item.ratedCount > 0 ? Number((item.sumRatingProduct / item.ratedCount).toFixed(1)) : null;
      const minP = item.minPrice !== null ? Math.round(item.minPrice) : null;
      const maxP = item.maxPrice !== null ? Math.round(item.maxPrice) : null;

      let priceRange = null;
      if (minP !== null && maxP !== null) {
        priceRange = minP === maxP ? formatInr(minP) : `${formatInr(minP)} - ${formatInr(maxP)}`;
      } else if (minP !== null) {
        priceRange = `From ${formatInr(minP)}`;
      }

      const brandRecord = {
        name: bestName,
        slug: item.slug,
        aliases: Array.from(item.aliases),
        productCount: item.productCount,
        minPrice: minP,
        maxPrice: maxP,
        priceRange,
        avgRating: avg,
        ratingCount: item.totalRatingCount,
        ratedProductsCount: item.ratedCount
      };

      finalStatsBySlug[slug] = brandRecord;

      // Map every alias slug variant so direct lookup by alias is immediate
      for (const a of item.aliases) {
        const aSlug = slugify(a);
        if (aSlug && !finalStatsBySlug[aSlug]) {
          finalStatsBySlug[aSlug] = brandRecord;
        }
      }
    }

    // Write to JSON file
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(finalStatsBySlug, null, 2), 'utf8');
    const statsCount = Object.keys(finalStatsBySlug).length;
    console.log(`[Brand Stats Generator] Successfully dynamically generated stats for ${statsCount} brand entries in ${outputPath}`);

  } catch (error) {
    console.warn(`[Brand Stats Generator] Warning: Could not connect to MongoDB: ${error.message}`);
    if (fs.existsSync(outputPath)) {
      console.log(`[Brand Stats Generator] Reusing existing ${outputPath}`);
    } else {
      console.log(`[Brand Stats Generator] Initializing fallback empty stats file.`);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({}, null, 2), 'utf8');
    }
  } finally {
    if (client) {
      await client.close();
    }
  }
}

generateBrandStats();
