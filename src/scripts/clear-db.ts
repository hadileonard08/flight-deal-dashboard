import 'dotenv/config';
import { db } from '../db';
import { flights, deals } from '../db/schema';

async function clearDatabase() {
  console.log('Clearing database...');
  await db.delete(deals);
  await db.delete(flights);
  console.log('Database cleared.');
  process.exit(0);
}

clearDatabase().catch((err) => { console.error(err); process.exit(1); });
