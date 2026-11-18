import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createDatabase, migrate, seed } from '@safqa/db';
import { config } from 'dotenv';
import { createApp } from './app';
import { createRedis } from './redis';
import { withStaticWeb } from './static';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const database = createDatabase();
const redis = createRedis();
if (redis) {
  redis.on('error', (error) => {
    console.warn('redis', error.message);
  });
  await redis.connect().catch((error: unknown) => {
    console.warn(
      'redis connect failed',
      error instanceof Error ? error.message : error,
    );
  });
}

const migrated = await migrate(database.sql);
console.log(`database ready (timescale=${migrated.timescale})`);
if (process.env.SEED_ON_BOOT === 'true') {
  await seed(database);
  console.log('seeded demo catalog');
}

const app = createApp({ database, redis });
const port = Number(process.env.PORT || process.env.API_PORT || 8787);
serve(
  { fetch: withStaticWeb(app.fetch), port, hostname: '0.0.0.0' },
  (info) => {
    console.log(`Safqa API http://localhost:${info.port}`);
    console.log(`OpenAPI http://localhost:${info.port}/docs`);
  },
);
