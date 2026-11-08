import test from 'node:test';
import assert from 'node:assert/strict';
import { listing, pdp, embedded, nextUrl } from '../src/adapters.js';
import { targets, proxyUrls } from '../src/config.js';
import { Storage } from '../src/storage.js';

test('all four listing adapters preserve marketplace IDs and numeric prices', () => {
  const cases = [
    ['amazon', '<div data-component-type="s-search-result" data-asin="B012345678"><h2><a href="/dp/B012345678"><span>Lipstick</span></a></h2><span class="a-price"><span class="a-offscreen">₹1,299</span></span></div>', 'B012345678'],
    ['flipkart', '<div data-id="LIP123"><a title="Lipstick" href="/item/p/x?pid=LIP123"></a><div class="Nx9bqj">₹1,299</div></div>', 'LIP123'],
    ['myntra', '<script>window.__myx = {"searchData":{"results":{"products":[{"productId":123,"product":"Lipstick","price":1299,"landingPageUrl":"lipstick/123/buy"}]}}};</script>', '123'],
    ['nykaa', '<div class="productWrapper"><a href="/lipstick/p/123"><img alt="Lipstick" src="/pic.jpg"></a><span class="css-111z9ua">₹1,299</span></div>', 'NYK-123']
  ];
  for (const [store, html, id] of cases) {
    const rows = listing(store, html, `https://www.${store}.com/`, { category_path: 'Makeup > Lips > Lipstick' });
    assert.equal(rows.length, 1, store); assert.equal(rows[0].id, id); assert.equal(rows[0].price, 1299);
    assert.equal(rows[0].category_path, 'Makeup > Lips > Lipstick');
  }
});
test('all four PDP adapters extract structured fallback and retain source identity', () => {
  const html = '<script type="application/ld+json">{"@type":"Product","name":"Red Lipstick","brand":{"name":"Test"},"offers":{"price":"399","availability":"https://schema.org/InStock"},"aggregateRating":{"ratingValue":4.5,"ratingCount":20},"image":["https://example.com/red.jpg"]}</script>';
  for (const store of ['amazon', 'flipkart', 'myntra', 'nykaa']) {
    const row = pdp(store, html, 'https://example.com/p/1', { id: 'existing', category_path: 'Makeup > Lips' });
    assert.equal(row.id, 'existing'); assert.equal(row.price, 399); assert.equal(row.rating, 4.5);
    assert.equal(row.brand, 'Test'); assert.equal(row.in_stock, true);
  }
});
test('Myntra embedded JSON parser handles braces in strings and trailing script code', () => {
  assert.deepEqual(embedded('window.__myx={broken};', 'window.__myx'), {});
  const data = { searchData: { name: 'x } { " y' } };
  assert.deepEqual(embedded(`window.__myx=${JSON.stringify(data)}; other();`, 'window.__myx'), data);
});
test('PDP incomplete and blocked pages fail rather than mark pdp_scraped', () => {
  assert.throws(() => pdp('myntra', '<h1>Access denied</h1>', 'https://www.myntra.com', {}));
  assert.throws(() => pdp('amazon', '<h1>Product</h1>', 'https://amazon.in', {}), /price missing/);
});
test('pagination uses store-specific Next links', () => {
  assert.equal(nextUrl('amazon', '<a class="s-pagination-next" href="?page=2">Next</a>', 'https://www.amazon.in/s?k=lip'), 'https://www.amazon.in/s?page=2');
  assert.equal(nextUrl('flipkart', '<a class="_9QVEpD" href="?page=1">Previous</a><a class="_9QVEpD" href="?page=3">Next</a>', 'https://www.flipkart.com/search?page=2'), 'https://www.flipkart.com/search?page=3');
});
test('Myntra page 2 reads rendered DOM instead of stale page 1 embedded JSON', () => {
  const html = '<script>window.__myx={"searchData":{"results":{"products":[{"id":1,"product":"Old","landingPageUrl":"1/buy"}]}}};</script><li class="product-base" id="product-2"><a href="/2/buy"><h3 class="product-brand">Brand</h3><h4 class="product-product">New</h4><span class="product-discountedPrice">Rs. 250</span></a></li>';
  const rows = listing('myntra', html, 'https://www.myntra.com/makeup', { page: 2 });
  assert.equal(rows[0].id, '2'); assert.equal(rows[0].name, 'New'); assert.equal(rows[0].price, 250);
});
test('all registered target URLs load and mismatched custom hosts are rejected', () => {
  for (const store of ['amazon', 'flipkart', 'myntra', 'nykaa']) assert.ok(targets(store).length);
  assert.throws(() => targets('myntra', 'https://example.com'), /marketplace/);
  assert.throws(() => proxyUrls({ CRAWLER_PROXY_URL: 'file:///x' }));
});
test('serialized upserts retain PDP enrichment and do not conflict with source history', async () => {
  const storage = new Storage({ runId: 'test' });
  let active = 0, max = 0;
  const updates = [];
  storage.db = { collection: () => ({
    async findOne() { return { price: 100 }; },
    async updateOne(key, update) { active++; max = Math.max(max, active); await new Promise(r => setTimeout(r, 5)); updates.push(update); active--; }
  }) };
  const row = { id: '1', url: 'https://example.com/p', title: 'Test lipstick', price: 90, price_history: [], lowest_recorded_price: 100, highest_recorded_price: 100 };
  await Promise.all([storage.save('myntra', [row], 'pdp'), storage.save('myntra', [row], 'listing')]);
  assert.equal(max, 1);
  assert.equal(updates[0].$set.pdp_scraped, true);
  assert.ok(!('pdp_scraped' in updates[1].$set));
  assert.ok(!('price_history' in updates[0].$set));
  assert.ok(!('lowest_recorded_price' in updates[0].$set));
  assert.ok(!('highest_recorded_price' in updates[0].$set));
  assert.equal(updates[0].$push.price_history.$each[0].old_price, 100);
});
test('missing listing prices do not overwrite stored price or check timestamp', async () => {
  const storage = new Storage({ runId: 'test' });
  let update;
  storage.db = { collection: () => ({ async findOne() { return { price: 100 }; }, async updateOne(k, u) { update = u; } }) };
  await storage.save('myntra', [{ id: '1', title: 'Lipstick', url: 'https://example.com', price: null, mrp: null }], 'listing');
  assert.ok(!('price' in update.$set)); assert.ok(!('price_last_checked' in update.$set));
  assert.ok(!('$push' in update));
});
test('crawler updates preserve categories manually reviewed in the admin panel', async () => {
  const storage = new Storage({ runId: 'test' });
  let update;
  storage.db = { collection: () => ({ async findOne() { return { price: 100, category_reviewed: true }; }, async updateOne(k, u) { update = u; } }) };
  await storage.save('myntra', [{ id: '1', title: 'Lipstick', url: 'https://example.com', price: 100, category: 'Makeup', sub_category: 'General', sub_sub_category: 'General', category_path: 'Makeup > General', category_reviewed: false }], 'listing');
  for (const field of ['category', 'sub_category', 'sub_sub_category', 'category_path', 'category_reviewed']) assert.ok(!(field in update.$set));
});

test('refresh preserves existing review details when extraction returns empty fields', async () => {
  const storage=new Storage({runId:'test'});let update;
  storage.db={collection:()=>({async findOne(){return {price:'100'};},async updateOne(k,u){update=u;}})};
  await storage.save('nykaa',[{id:'1',title:'Lipstick',url:'https://example.com',price:100,reviews:[],images:[],specifications:{},rating:undefined}], 'pdp');
  for(const field of ['reviews','images','specifications','rating'])assert.ok(!(field in update.$set));
  assert.ok(!update.$push);
  await storage.save('nykaa',[{id:'1',title:'Lipstick',url:'https://example.com',price:90,reviews:[{text:'Updated review'}],rating:4.6}], 'pdp');
  assert.equal(update.$set.reviews[0].text,'Updated review');assert.equal(update.$set.rating,4.6);
  assert.equal(update.$push.price_history.$each[0].old_price,100);
});
