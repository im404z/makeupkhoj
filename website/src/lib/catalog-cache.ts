import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { BSON } from 'mongodb';
import { createClient } from 'redis';
import { connectDB } from './mongodb';

const defaults = { enabled: true, ttlSeconds: 120, generation: 'initial' };
const settingsId = { _id: 'catalog-cache' };
let settingsCache: { expires: number; value: Promise<typeof defaults> } | undefined;

async function settingsCollection() {
  const connection = await connectDB();
  return connection.connection.db!.collection<typeof defaults & { _id: string }>('site_settings');
}

export function getCatalogCacheSettings() {
  if (!settingsCache || settingsCache.expires <= Date.now()) {
    settingsCache = {
      expires: Date.now() + 10_000,
      value: settingsCollection().then(async collection => {
        const row = await collection.findOne(settingsId);
        return row ? { enabled: row.enabled, ttlSeconds: row.ttlSeconds, generation: row.generation } : defaults;
      }),
    };
  }
  return settingsCache.value;
}

export async function saveCatalogCacheSettings(input: unknown) {
  const collection = await settingsCollection();
  const generation = randomUUID();
  if (!input || typeof input !== 'object') throw Error('Invalid cache settings');
  if ('clear' in input && input.clear === true) {
    await collection.updateOne(settingsId, { $set: { generation }, $setOnInsert: {
      enabled: defaults.enabled, ttlSeconds: defaults.ttlSeconds,
    } }, { upsert: true });
  } else {
    const { enabled, ttlSeconds } = input as Partial<typeof defaults>;
    if (typeof enabled !== 'boolean' || typeof ttlSeconds !== 'number' ||
        !Number.isInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 900) {
      throw Error('Choose a cache lifetime between 15 and 900 seconds.');
    }
    await collection.updateOne(settingsId, { $set: { enabled, ttlSeconds, generation } }, { upsert: true });
  }
  settingsCache = undefined;
}

function createCatalogRedisClient(url: string) {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: { connectTimeout: 350, reconnectStrategy: false },
  });
}

type RedisClient = ReturnType<typeof createCatalogRedisClient>;
let connection: Promise<RedisClient> | undefined;
let retryAfter = 0;

function redis() {
  const url = process.env.REDIS_URL;
  if (!url || Date.now() < retryAfter) return;
  if (!connection) {
    connection = Promise.resolve().then(async () => {
      const client = createCatalogRedisClient(url);
      client.on('error', () => {
        if (!client.isReady) {
          connection = undefined;
          retryAfter = Date.now() + 10_000;
        }
      });
      await client.connect();
      return client;
    }).catch(error => {
      connection = undefined;
      retryAfter = Date.now() + 10_000;
      throw error;
    });
  }
  return connection;
}

async function redisCommand<T>(run: (client: RedisClient) => Promise<T>) {
  const client = await redis();
  if (!client) return;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(client.withCommandOptions({ abortSignal: controller.signal })),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          connection = undefined;
          retryAfter = Date.now() + 10_000;
          if (client.isOpen) client.destroy();
          resolve(undefined);
        }, 350);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function catalogCacheStatus() {
  const { enabled, ttlSeconds } = await getCatalogCacheSettings();
  const configured = Boolean(process.env.REDIS_URL);
  const connected = configured && await redisCommand(client => client.ping()).catch(() => undefined) === 'PONG';
  return { enabled, ttlSeconds, configured, connected };
}

const pending = new Map<string, Promise<unknown>>();

export async function cachedCatalogRead<T>(scope: string, args: unknown, load: () => Promise<T>): Promise<T> {
  if (!process.env.REDIS_URL) return load();
  const settings = await getCatalogCacheSettings().catch(() => undefined);
  if (!settings?.enabled) return load();

  const hash = createHash('sha256').update(BSON.EJSON.stringify([
    process.env.MONGODB_URI, process.env.MASTER_DB, args,
  ])).digest('hex');
  const key = `makeupkhoj:catalog:v1:${settings.generation}:${scope}:${hash}`;
  const existing = pending.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const result = (async () => {
    try {
      const value = await redisCommand(client => client.get(key));
      if (value) return BSON.EJSON.parse(value) as T;
    } catch {
      // A cache outage or invalid entry falls back to MongoDB.
    }
    const value = await load();
    try {
      const encoded = BSON.EJSON.stringify(value);
      if (Buffer.byteLength(encoded) <= 1_048_576) {
        await redisCommand(client => client.set(key, encoded, { expiration: { type: 'EX', value: settings.ttlSeconds } }));
      }
    } catch {
      // The successful database result can still be served.
    }
    return value;
  })().finally(() => pending.delete(key));
  pending.set(key, result);
  return result;
}
