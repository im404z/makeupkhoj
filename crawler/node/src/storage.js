import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';
import { collections, directory, root } from './config.js';
import {numericPrice, priceObservation} from './price-observation.js';

export class Storage {
  constructor({ dryRun = false, runId, syncMaster = false, onChange = () => {} }) {
    this.dryRun = dryRun; this.runId = runId; this.syncMaster = syncMaster;
    this.chain = Promise.resolve(); this.saved = 0;
    this.changes = { newProducts: 0, priceDown: 0, priceUp: 0, unchangedPrice: 0, firstPrice: 0, missingPrice: 0 };
    this.onChange = onChange;
    this.brands = JSON.parse(fs.readFileSync(path.join(root, 'crawler/brands.json'), 'utf8')).sort((a, b) => b.length - a.length);
  }
  async open() {
    fs.mkdirSync(path.join(directory, 'state', this.runId), { recursive: true });
    if (this.dryRun) return;
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO;
    if (!uri) throw Error('MongoDB URI required; set MONGODB_URI in .env');
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, socketTimeoutMS: 300000, connectTimeoutMS: 30000, maxPoolSize: 20, retryWrites: true, retryReads: true });
    await this.client.connect();
    const name = process.env.MASTER_DB || 'makeupkhoj';
    if (name !== 'makeupkhoj') throw Error('Only makeupkhoj database is permitted');
    this.db = this.client.db(name);
  }
  async prepare(store) {
    if (!this.db) return;
    const col = this.db.collection(collections[store]);
    const field = store === 'amazon' ? 'asin' : 'id';
    const indexes = await col.listIndexes().toArray().catch(e => { if (e.code === 26) return []; throw e; });
    if (!indexes.some(i => Object.keys(i.key).length === 1 && i.key[field] === 1)) await col.createIndex({ [field]: 1 }, { unique: true });
    // Legacy non-unique indexes are retained. All writes in this runner are serialized.
    // A process lock prevents two copies of this Node runner from sharing a database.
  }
  async pendingBatch(store, limit = 200, all = false, lastId = null) {
    if (!this.db) throw Error('PDP database selection requires MongoDB; use --url for a dry-run PDP');
    const query = all ? {} : { pdp_scraped: { $ne: true } };
    if (lastId) query._id = { $gt: lastId };
    return this.db.collection(collections[store]).find(query, {
      projection: { _id: 1, id: 1, asin: 1, product_id: 1, url: 1, name: 1, title: 1, brand: 1, image: 1, price: 1, mrp: 1, category: 1, sub_category: 1, sub_sub_category: 1, category_name: 1, category_path: 1, category_url: 1, shade: 1, size: 1, pack_size: 1, sku: 1 }
    }).sort({ _id: 1 }).limit(limit).toArray();
  }
  async pending(store, limit, all) {
    if (!this.db) throw Error('PDP database selection requires MongoDB; use --url for a dry-run PDP');
    const query = all ? {} : { pdp_scraped: { $ne: true } };
    let cursor = this.db.collection(collections[store]).find(query,{projection:{id:1,asin:1,product_id:1,url:1,name:1,title:1,brand:1,image:1,price:1,mrp:1,category:1,sub_category:1,sub_sub_category:1,category_name:1,category_path:1,category_url:1,shade:1,size:1,pack_size:1,sku:1}}).sort({ _id: 1 });
    if (limit) cursor = cursor.limit(limit);
    return cursor;
  }
  save(store, rows, phase) {
    const task = this.chain.then(async () => {
      for (const raw of rows) {
        const row = { ...raw };
        delete row._id;
        delete row.price_history;
        delete row.category_reviewed;
        delete row.category_reviewed_at;
        // A listing refresh must not erase existing PDP data when a source
        // omits a field or returns no visible reviews on this visit.
        for(const [field,value] of Object.entries(row))if(value===undefined||value===null||value==='')delete row[field];
        for(const field of ['reviews','images','customer_photos','variants','specifications']){
          const value=row[field];if(Array.isArray(value)&&!value.length||value&&typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value).length)delete row[field];
        }
        if (!row.id || !row.url || !row.title) throw Error('Product identity, URL and title are required');
        if (!row.brand) row.brand = this.brands.find(b => row.title.toLowerCase().startsWith(b.toLowerCase())) || 'Unknown';
        const now = new Date().toISOString();
        row.updated_at = now;
        if (row.price > 0) row.price_last_checked = now;
        else { delete row.price; delete row.price_last_checked; }
        if (!(row.mrp > 0)) delete row.mrp;
        if (phase === 'pdp') { row.pdp_scraped = true; row.pdp_scraped_at = now; }
        else row.crawled_at = now;
        if (this.db) {
          const key = store === 'amazon' ? { asin: row.asin || row.id } : { id: row.id };
          const col = this.db.collection(collections[store]);
          const old = await col.findOne(key, { projection: { price: 1, category_reviewed: 1 } });
          if (old?.category_reviewed) {
            for (const field of ['category', 'sub_category', 'sub_sub_category', 'category_name', 'category_path']) delete row[field];
          }
          const update = { $set: row };
          if (row.price > 0) {
            update.$min = { lowest_recorded_price: row.price };
            update.$max = { highest_recorded_price: row.price };
            // Source documents can contain these fields on PDP refresh.
            delete row.lowest_recorded_price; delete row.highest_recorded_price;
          }
          const observation=priceObservation(old?.price,row.price,now,store);
          if(observation)update.$push={price_history:{$each:[observation],$slice:-1000}};
          const result = await col.updateOne(key, update, { upsert: true });
          let change;
          if (result.upsertedCount) change = 'newProducts';
          else if (!numericPrice(row.price)) change = 'missingPrice';
          else if (!observation) change = 'unchangedPrice';
          else if (observation.old_price === null) change = 'firstPrice';
          else change = observation.price < observation.old_price ? 'priceDown' : 'priceUp';
          this.changes[change]++;
          if (['newProducts', 'priceDown', 'priceUp'].includes(change)) {
            this.onChange({ store, change, id: row.id, title: row.title, price: row.price, previous: observation?.old_price });
          }
          if (this.syncMaster && row.price > 0) await this.updateMaster(store, row, now);
        } else fs.appendFileSync(path.join(directory, 'state', this.runId, `${store}-${phase}.jsonl`), `${JSON.stringify(row)}\n`);
        this.saved++;
      }
    });
    this.chain = task.catch(() => {});
    return task;
  }
  async updateMaster(store, row, now) {
    const id = String(store === 'amazon' ? row.asin || row.id : row.id);
    const ids = [id]; if (/^\d+$/.test(id)) ids.push(Number(id));
    const col = this.db.collection('products');
    const docs = col.find({ $or: [{ [`mappings.${store}.id`]: { $in: ids } }, { [`mappings.${store}.asin`]: id }] });
    for await (const doc of docs) {
      const mapping = { ...doc.mappings?.[store], id, price: row.price, mrp: row.mrp, url: row.url, in_stock: row.in_stock !== false, rating: row.rating, rating_count: row.rating_count };
      const mappings = { ...doc.mappings, [store]: mapping };
      const offers = Object.entries(mappings).filter(([, v]) => v && v.in_stock !== false && Number(v.price) > 0).sort((a, b) => a[1].price - b[1].price);
      const fields = { [`mappings.${store}`]: mapping, price_last_checked: now, updated_at: now };
      if (offers.length) Object.assign(fields, { lowest_price: offers[0][1].price, price: offers[0][1].price, lowest_marketplace: offers[0][0], store_count: Object.keys(mappings).length });
      // Serialize master updates within this process. Existing matching is retained;
      // this runner does not guess shade/size matches or create master products.
      const update = { $set: fields };
      if (offers.length) { update.$min = { lowest_recorded_price: offers[0][1].price }; update.$max = { highest_recorded_price: offers[0][1].price }; }
      const oldPrice = doc.mappings?.[store]?.price;
      if (oldPrice !== row.price) update.$push = { price_history: { $each: [{ marketplace: store, price: row.price, old_price: oldPrice ?? null, timestamp: now, date: now.slice(0, 10) }], $slice: -30 } };
      await col.updateOne({ _id: doc._id }, update);
    }
  }
  async close() { await this.chain; await this.client?.close(); }
}
