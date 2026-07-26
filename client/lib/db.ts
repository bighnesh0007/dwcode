import mongoose from 'mongoose';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

const globalWithMongoose = global as typeof globalThis & {
  mongoose?: MongooseCache;
};

const cached = globalWithMongoose.mongoose ??
  (globalWithMongoose.mongoose = { conn: null, promise: null });

async function connectToDatabase() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,

      /*
       * autoIndex OFF by default. This is not a performance tweak — it prevents
       * a real hazard we hit for real.
       *
       * Mongoose defaults `autoIndex` to TRUE, so merely loading a model builds
       * every index its schema declares, against whatever `MONGODB_URI` points
       * at, at whatever moment the process happens to start. Because this
       * repo's `.env.local` points at PRODUCTION Atlas, a local `next dev`
       * silently created 13 production indexes the moment the new schemas were
       * saved.
       *
       * Additive indexes are mostly harmless. The dangerous case is a partial
       * migration: autoIndex CREATED the new unique `{userId, problemId}` index
       * on `notes` but could not DROP the stale unique `problemId_1`, leaving a
       * state where the first user to save a note for a problem succeeds and
       * every other user gets a duplicate-key error.
       *
       * Index creation belongs in a deliberate, observable step — see
       * `npm run indexes` (scripts/ensure-indexes.ts) and
       * docs/runbooks/database-migrations.md. Mirrors server/src/db/connection.ts.
       *
       * Set MONGOOSE_AUTO_INDEX=true to opt back in against a scratch database.
       */
      autoIndex: process.env.MONGOOSE_AUTO_INDEX === "true",
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default connectToDatabase;
