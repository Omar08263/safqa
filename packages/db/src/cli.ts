import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createDatabase } from './client';
import { migrate } from './migrate';
import { seed } from './seed';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

const command = process.argv[2] ?? 'seed';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const database = createDatabase(url);
try {
  if (command === 'migrate' || command === 'seed') {
    const result = await migrate(database.sql);
    console.log(`migrated (timescale=${result.timescale})`);
  }
  if (command === 'seed') {
    await seed(database);
    console.log('seeded demo@safqa.app / demo1234');
  }
} finally {
  await database.sql.end();
}
