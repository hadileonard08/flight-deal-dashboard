import 'dotenv/config';
import { db } from '../db';
import { flights, deals } from '../db/schema';

async function clearDatabase() {
  console.log('Clearing database...');
  await db.delete(deals);
  await db.delete(flights);
  console.log('Database cleared.');
}

clearDatabase().catch(console.error);
