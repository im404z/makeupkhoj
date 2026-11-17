// MongoDB connection singleton for Next.js
import mongoose from 'mongoose';

interface GlobalMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoose: GlobalMongoose | undefined;
}

const cached: GlobalMongoose = global._mongoose ?? { conn: null, promise: null };
if (!global._mongoose) global._mongoose = cached;

export async function connectDB() {
  // Guard: If maintenance mode is active or MONGODB_URI is absent, prevent any connection
  if (process.env.MAINTENANCE_MODE === 'true') {
    throw new Error('DATABASE_DISABLED: Maintenance mode is active. Database connections are disabled.');
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('DATABASE_DISABLED: MONGODB_URI is not defined. Database connections are disabled.');
  }

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      dbName: process.env.MASTER_DB ?? 'makeupkhoj',
      bufferCommands: false,
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 20000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
