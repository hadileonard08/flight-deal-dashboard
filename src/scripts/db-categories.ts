import 'dotenv/config';
import { db } from '../db';
import { deals } from '../db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const res = await db.select({ category: deals.category, count: sql`count(*)` }).from(deals).groupBy(deals.category);
  console.log(res);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
