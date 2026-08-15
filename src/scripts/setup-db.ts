import 'dotenv/config';
import { db } from '../db';
import { flights, deals } from '../db/schema';

async function setupDatabase() {
  console.log('Setting up database tables...');
  
  // This will be handled by drizzle-kit push
  console.log('Please run: npm run db:push');
  console.log('This will create the tables in PostgreSQL based on the schema.');
}

setupDatabase().catch(console.error);
