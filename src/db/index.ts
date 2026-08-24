import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/flight_tracker';
const queryClient = neon(connectionString);
export const db = drizzle(queryClient, { schema });
